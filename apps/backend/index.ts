import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Candlestick } from "@repo/types";

const app = new Hono();
app.use("*", cors());

// Postgres connection using Bun.sql
const DATABASE_URL = process.env.DATABASE_URL;

// Use Bun.sql tagged template. Bun uses DATABASE_URL automatically.
const sql = (Bun as any).sql;
if (!sql) {
  throw new Error("Bun.sql is not available. Ensure you're running with Bun and have a valid DATABASE_URL.");
}

// Open a connection eagerly and fail fast if not reachable
await sql`SELECT 1`;

app.get('/api/latest', async (c) => {
  const symbol = c.req.query('symbol') || 'BTCUSDT';

  // Query for the most recent 1-minute candle using Bun.sql
  const result = await sql`
    SELECT 
      open_time,
      open_price,
      high_price,
      low_price,
      close_price,
      base_volume
    FROM ohlc_1m
    WHERE symbol = ${symbol}
    ORDER BY open_time DESC
    LIMIT 1440
  `;

  if (result.length === 0) {
    return c.json({ error: 'No data found' }, 404);
  }

  // Transform database results to Candlestick type
  const candlesticks: Candlestick[] = result.map((row: any) => {
    const openTime = new Date(row.open_time);
    const hours = openTime.getHours().toString().padStart(2, '0');
    const minutes = openTime.getMinutes().toString().padStart(2, '0');
    
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
});




export default app;
