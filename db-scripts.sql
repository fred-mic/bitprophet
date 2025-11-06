CREATE EXTENSION IF NOT EXISTS timescaledb;


-- Create the base table with recommended data types
CREATE TABLE ohlc_1m (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    symbol VARCHAR(20) NOT NULL,
    open_time TIMESTAMPTZ NOT NULL,         -- Kline open time
    close_time TIMESTAMPTZ NOT NULL,        -- Kline close time
    open_price NUMERIC(20, 8) NOT NULL,
    high_price NUMERIC(20, 8) NOT NULL,
    low_price NUMERIC(20, 8) NOT NULL,
    close_price NUMERIC(20, 8) NOT NULL,
    base_volume NUMERIC(20, 8) NOT NULL,
    quote_asset_volume NUMERIC(20, 8) NOT NULL,
-- A composite primary key is often a better practice for time-series data
    PRIMARY KEY (symbol, open_time)
);

-- Convert to hypertable using the modern syntax
-- Note: You will need to define a chunk_time_interval suitable for your data volume.
-- The default is 7 days, but for 1-minute data, 1 day or a few hours might be better.
SELECT create_hypertable('ohlc_1m', by_range('open_time'), if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');

-- Create a composite index for common queries.
-- The index on open_time is created automatically by create_hypertable.
CREATE INDEX IF NOT EXISTS idx_symbol_time ON ohlc_1m (symbol, open_time DESC);


-- Add columns that are not part of the primary key
-- This is a strategy to add columns after the hypertable is created
ALTER TABLE ohlc_1m
    ADD COLUMN num_trades INT NOT NULL,
    ADD COLUMN taker_buy_base_volume NUMERIC(20, 8),
    ADD COLUMN taker_buy_quote_volume NUMERIC(20, 8),
    ADD COLUMN created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;


-- Create a continuous aggregate for 15-minute data
CREATE MATERIALIZED VIEW ohlc_15m_summary
WITH (timescaledb.continuous) AS
SELECT
    symbol,
    time_bucket('15 minutes', open_time) AS bucket_time,
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
    time_bucket('1 hour', open_time) AS bucket_time,
    first(open_price, open_time) AS open_price,
    MAX(high_price) AS high_price,
    MIN(low_price) AS low_price,
    last(close_price, open_time) AS close_price,
    SUM(base_volume) AS base_volume,
    -- ... and so on for all other SUMmable columns
FROM ohlc_1m
GROUP BY symbol, bucket_time;

-- Add a policy to automatically refresh the views as new data arrives
SELECT add_continuous_aggregate_policy('ohlc_15m_summary',
  start_offset => INTERVAL '1 hour',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '5 minutes');

SELECT add_continuous_aggregate_policy('ohlc_1h_summary',
  start_offset => INTERVAL '2 hours',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '15 minutes');