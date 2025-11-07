CREATE EXTENSION IF NOT EXISTS timescaledb_toolkit;


-- Create the base table with recommended data types
CREATE TABLE ohlc_1m (
    symbol VARCHAR(20) NOT NULL,
    open_time TIMESTAMPTZ NOT NULL,         -- Kline open time
    close_time TIMESTAMPTZ NOT NULL,        -- Kline close time
    open_price NUMERIC(20, 8) NOT NULL,
    high_price NUMERIC(20, 8) NOT NULL,
    low_price NUMERIC(20, 8) NOT NULL,
    close_price NUMERIC(20, 8) NOT NULL,
    base_volume NUMERIC(20, 8) NOT NULL,
    quote_asset_volume NUMERIC(20, 8) NOT NULL,
    num_trades INT NOT NULL DEFAULT 0,
    taker_buy_base_volume NUMERIC(20, 8),
    taker_buy_quote_volume NUMERIC(20, 8),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
-- A composite primary key is often a better practice for time-series data
    PRIMARY KEY (symbol, open_time)
) WITH (
   tsdb.hypertable,
   tsdb.partition_column='open_time',
   tsdb.segmentby='symbol', 
   tsdb.orderby='open_time DESC'
);


-- Create a continuous aggregate for 15-minute data
CREATE MATERIALIZED VIEW ohlc_15m_summary
WITH (timescaledb.continuous) AS
SELECT
    symbol,
    time_bucket(INTERVAL '15 minutes', open_time) AS bucket_time,
    first(open_price, open_time) AS open_price,
    MAX(high_price) AS high_price,
    MIN(low_price) AS low_price,
    last(close_price, open_time) AS close_price,
    SUM(base_volume) AS base_volume,
    SUM(quote_asset_volume) AS quote_asset_volume,
    SUM(num_trades) AS num_trades,
    SUM(taker_buy_base_volume) AS taker_buy_base_volume,
    SUM(taker_buy_quote_volume) AS taker_buy_quote_volume
FROM ohlc_1m
GROUP BY symbol, bucket_time;

-- Create a continuous aggregate for 1-hour data
CREATE MATERIALIZED VIEW ohlc_1h_summary
WITH (timescaledb.continuous) AS
SELECT
    symbol,
    time_bucket(INTERVAL '1 hour', open_time) AS bucket_time,
    first(open_price, open_time) AS open_price,
    MAX(high_price) AS high_price,
    MIN(low_price) AS low_price,
    last(close_price, open_time) AS close_price,
    SUM(base_volume) AS base_volume,
    SUM(quote_asset_volume) AS quote_asset_volume,
    SUM(num_trades) AS num_trades,
    SUM(taker_buy_base_volume) AS taker_buy_base_volume,
    SUM(taker_buy_quote_volume) AS taker_buy_quote_volume
    -- ... and so on for all other SUMmable columns
FROM ohlc_1m
GROUP BY symbol, bucket_time;

-- Add a policy to automatically refresh the views as new data arrives
SELECT add_continuous_aggregate_policy('ohlc_15m_summary',
  start_offset => INTERVAL '1 hour',
  end_offset => INTERVAL '0',  -- Changed from '1 minute' to '0'
  schedule_interval => INTERVAL '5 minutes');

SELECT add_continuous_aggregate_policy('ohlc_1h_summary',
  start_offset => INTERVAL '3 hours',  -- Changed from '2 hours' to '3 hours' to ensure at least 2 buckets
  end_offset => INTERVAL '0',  -- Changed from '1 minute' to '0'
  schedule_interval => INTERVAL '15 minutes');