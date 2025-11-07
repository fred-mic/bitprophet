import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Candlestick } from "@repo/types";

type Env = {
  HYPERDRIVE: {
    connectionString: string;
  };
};

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors());

app.get('/api/latest', async (c) => {
  // Set DATABASE_URL from HYPERDRIVE binding if available
  if (c.env.HYPERDRIVE?.connectionString) {
    process.env.DATABASE_URL = c.env.HYPERDRIVE.connectionString;
  }

  const symbol = c.req.query('symbol') || 'BTCUSDT';

  // Use Bun.sql tagged template
  const sql = (Bun as any).sql;
  if (!sql) {
    throw new Error("Bun.sql is not available.");
  }

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
