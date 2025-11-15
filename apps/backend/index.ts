import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Candlestick } from "@repo/types";
import { Pool } from "pg";

const app = new Hono();
app.use("*", cors());

// Initialize PostgreSQL connection pool
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Determine SSL configuration based on connection string
const shouldUseSSL = !connectionString.includes('sslmode=disable');
const sslConfig = shouldUseSSL 
  ? { rejectUnauthorized: false }
  : false;

const pool = new Pool({
  connectionString,
  max: 10, 
  min: 2, // Keep 2 connections warm
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000, 
  ssl: sslConfig,
  allowExitOnIdle: false,
});

// Handle pool errors
pool.on('error', (err: Error) => {
  console.error('Unexpected error in connection pool:', err);
});

pool.on('connect', () => {
  console.log('New connection created in pool');
});

pool.on('remove', () => {
  console.log('Connection removed from pool');
});

// Test connection on startup
let dbReady = false;
const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log("Database connection pool established");
    dbReady = true;
  } catch (err: any) {
    console.error("Failed to connect to database:");
    console.error("Error code:", err.code);
    console.error("Error message:", err.message);
    console.error("Connection string (masked):", connectionString.replace(/:[^:@]+@/, ':****@'));
    // Retry after 5 seconds
    setTimeout(testConnection, 5000);
  }
};

testConnection();

// Helper function to execute queries with retry logic
const queryWithRetry = async (
  queryText: string,
  params?: any[],
  retries = 3
): Promise<any> => {
  let lastError: any;

  for (let i = 0; i < retries; i++) {
    try {
      return await pool.query(queryText, params);
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a transient connection error
      const isTransientError =
        error.code === '57P03' || // cannot connect now
        error.code === '08003' || // connection does not exist
        error.code === '08006' || // connection failure
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'EHOSTUNREACH' ||
        error.message?.includes('Connection terminated') ||
        error.message?.includes('connection closed') ||
        error.message?.includes('timeout');

      if (isTransientError && i < retries - 1) {
        const backoffMs = 1000 * Math.pow(2, i); // Exponential backoff
        console.warn(
          `Database connection error (${error.code}), retrying in ${backoffMs}ms... (${i + 1}/${retries})`
        );
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      // If it's not a transient error or last retry, throw immediately
      throw error;
    }
  }

  throw lastError;
};

// Health check endpoint
app.get('/health', async (c) => {
  if (!dbReady) {
    return c.json({ status: 'initializing', database: 'connecting' }, 503);
  }

  try {
    await queryWithRetry('SELECT 1');
    return c.json({ status: 'healthy', database: 'connected' });
  } catch (error: any) {
    return c.json(
      {
        status: 'unhealthy',
        database: 'error',
        error: error.message,
        code: error.code,
      },
      503
    );
  }
});

// Resolution to database view/table mapping
const resolutionToViewMap: Record<string, string> = {
  '1m': 'public.ohlc_1m',
  '15m': 'public.ohlc_15m_summary',
  '1h': 'public.ohlc_1h_summary',
};

app.get('/api/v1/candles/:symbol', async (c) => {
  const symbol = c.req.param('symbol');
  const resolution = c.req.query('resolution') || '1h';
  const limit = parseInt(c.req.query('limit') || '24', 10);

  // Validate resolution
  if (!resolutionToViewMap[resolution]) {
    return c.json(
      {
        error: 'Invalid resolution',
        message: `Resolution must be one of: ${Object.keys(resolutionToViewMap).join(', ')}`,
      },
      400
    );
  }

  // Validate limit
  if (isNaN(limit) || limit < 1 || limit > 10000) {
    return c.json(
      {
        error: 'Invalid limit',
        message: 'Limit must be a number between 1 and 10000',
      },
      400
    );
  }

  const tableName = resolutionToViewMap[resolution];
  const timeColumn = resolution === '1m' ? 'open_time' : 'bucket_time';

  try {
    const result = await queryWithRetry(
      `
      SELECT 
        ${timeColumn} as time,
        open_price,
        high_price,
        low_price,
        close_price,
        base_volume
      FROM ${tableName}
      WHERE symbol = $1
      ORDER BY ${timeColumn} DESC
      LIMIT $2
    `,
      [symbol, limit]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'No data found' }, 404);
    }

    // Transform database results to Candlestick type
    const candlesticks: Candlestick[] = result.rows.map((row: any) => {
      const time = new Date(row.time);
      const hours = time.getHours().toString().padStart(2, '0');
      const minutes = time.getMinutes().toString().padStart(2, '0');

      return {
        time: `${hours}:${minutes}`,
        open: Number(row.open_price),
        high: Number(row.high_price),
        low: Number(row.low_price),
        close: Number(row.close_price),
        volume: Number(row.base_volume),
      };
    });

    return c.json(candlesticks);
  } catch (error: any) {
    console.error('Database query error:', error);
    return c.json(
      {
        error: 'Database error',
        message: error.message,
        code: error.code,
      },
      500
    );
  }
});

const port = parseInt(process.env.PORT || '3001');
export default {
  port,
  fetch: app.fetch,
};