const { Client } = require('pg');

// --- Function to Fetch and Insert 1-Minute Data ---
async function ingestLatestMinuteData() {
  const symbol = 'BTCUSDT';
  
  // --- Database Configuration ---
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  const dbClient = new Client({ 
    connectionString,
    ssl: {
      rejectUnauthorized: false, // For cloud providers
    },
  });
  
  try {
    const x = await dbClient.connect();
    
    // Query the last record from ohlc_1m table
    const lastRecordQuery = `
      SELECT open_time 
      FROM ohlc_1m 
      WHERE symbol = $1 
      ORDER BY open_time DESC 
      LIMIT 1
    `;
    const lastRecordResult = await dbClient.query(lastRecordQuery, [symbol]);
    
    // Calculate minutes since last record, or default to 1 if no records exist
    let limit = 1;
    const now = new Date();
    if (lastRecordResult.rows.length > 0) {
      const lastOpenTime = new Date(lastRecordResult.rows[0].open_time);      
      const minutesDiff = Math.floor((now - lastOpenTime) / (1000 * 60));
      limit = Math.max(1, minutesDiff); // Ensure at least 1 minute
    } else {
      //If no records exist, ingest the last 7 days of data
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7); // 7 days ago
      limit = Math.floor((now - oneWeekAgo) / (1000 * 60));
    }
      
    
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // SQL with UPSERT to prevent duplicates
    const query = `
      INSERT INTO ohlc_1m (
        symbol, open_time, open_price, high_price, low_price, close_price,
        base_volume, close_time, quote_asset_volume, num_trades,
        taker_buy_base_volume, taker_buy_quote_volume
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )
      ON CONFLICT (symbol, open_time) DO UPDATE SET
        close_price = EXCLUDED.close_price,
        high_price = GREATEST(ohlc_1m.high_price, EXCLUDED.high_price),
        low_price = LEAST(ohlc_1m.low_price, EXCLUDED.low_price),
        base_volume = EXCLUDED.base_volume,
        updated_at = CURRENT_TIMESTAMP; 
    `;

    // Loop through all klines in the response
    for (const kline of data) {
      const dataPoint = {
        symbol: symbol,
        open_time: new Date(kline[0]).toISOString(), // Use ISO 8601 strings
        open_price: parseFloat(kline[1]),
        high_price: parseFloat(kline[2]),
        low_price: parseFloat(kline[3]),
        close_price: parseFloat(kline[4]),
        base_volume: parseFloat(kline[5]),
        close_time: new Date(kline[6]).toISOString(),
        quote_asset_volume: parseFloat(kline[7]),
        num_trades: parseInt(kline[8]),
        taker_buy_base_volume: parseFloat(kline[9]),
        taker_buy_quote_volume: parseFloat(kline[10]),
      };

      const values = Object.values(dataPoint);
      await dbClient.query(query, values);
      console.log(`Successfully ingested data for ${dataPoint.open_time}`);
    }

    await dbClient.end();
    console.log(`Successfully ingested ${data.length} data point(s)`);

  } catch (error) {
    const timestamp = new Date().toISOString();
    const errorDetails = {
      timestamp,
      error: {
        name: error?.name || 'UnknownError',
        message: error?.message || 'Unknown error occurred',
        stack: error?.stack || 'No stack trace available',
        code: error?.code,
        detail: error?.detail,
        hint: error?.hint,
        position: error?.position,
      },
      context: {
        hasConnectionString: !!connectionString,
        connectionStringLength: connectionString?.length || 0,
      },
    };

    console.error('='.repeat(80));
    console.error(`[${timestamp}] ERROR during data ingestion`);
    console.error('='.repeat(80));
    console.error('Error Name:', errorDetails.error.name);
    console.error('Error Message:', errorDetails.error.message);
    if (errorDetails.error.code) {
      console.error('Error Code:', errorDetails.error.code);
    }
    if (errorDetails.error.detail) {
      console.error('Error Detail:', errorDetails.error.detail);
    }
    if (errorDetails.error.hint) {
      console.error('Error Hint:', errorDetails.error.hint);
    }
    console.error('\nContext:');
    console.error('  Has Connection String:', errorDetails.context.hasConnectionString);
    console.error('\nStack Trace:');
    console.error(errorDetails.error.stack);
    console.error('='.repeat(80));
    
    // Also log as JSON for structured logging
    console.error('\nStructured Error Log (JSON):');
    console.error(JSON.stringify(errorDetails, null, 2));
    
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  ingestLatestMinuteData();
}
