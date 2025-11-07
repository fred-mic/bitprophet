import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import type { Candlestick } from "@repo/types";


const App = () => {
  const [allData, setAllData] = useState<Candlestick[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const CHUNK_SIZE = 60;

  // Calculate total number of chunks
  const totalChunks = Math.ceil(allData.length / CHUNK_SIZE);

  // Calculate the current chunk of data to display
  // Reverse the chunk so oldest is on the left, newest on the right
  const chunkData = allData.slice(
    currentChunkIndex * CHUNK_SIZE,
    (currentChunkIndex + 1) * CHUNK_SIZE
  );
  // Reverse the chunk for proper chronological display (oldest -> newest)
  const data = [...chunkData].reverse();

  // Navigation functions
  // Previous = older data (chunk index increases)
  // Next = newer data (chunk index decreases)
  const handlePrevious = () => {
    setCurrentChunkIndex((prev: number) => Math.min(totalChunks - 1, prev + 1));
  };

  const handleNext = () => {
    setCurrentChunkIndex((prev: number) => Math.max(0, prev - 1));
  };

  const formatUSD = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  useEffect(() => {
    const fetchBitcoinData = async (isInitial = false) => {
      try {
        if (isInitial) setLoading(true);
        const response = await fetch(
          "https://bitprohet-backend.fred-fa4.workers.dev/api/latest?symbol=BTCUSDT"
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg =
            errorData.msg ||
            errorData.message ||
            `HTTP ${response.status}: ${response.statusText}`;
          throw new Error(errorMsg);
        }

        const rawData = await response.json();
        const data = rawData.map((item: any) => ({
          time: item.time,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume,
        }));
        setAllData(data);
        setError(null);
        // Reset to most recent chunk (index 0) when new data is loaded
        if (isInitial) {
          setCurrentChunkIndex(0);
          setLoading(false);
        }
      } catch (err: any) {
        console.error("Fetch error:", err);
        setError(`${err.message}. Check browser console for details.`);
        if (isInitial) setLoading(false);
      }
    };
      fetchBitcoinData(true);
      const interval = setInterval(() => fetchBitcoinData(false), 60000);
      return () => clearInterval(interval);
    }, []);

    const CustomCandlestick = (props: any) => {
      const { x, y, width, height, payload } = props;
      if (!payload || !data || data.length === 0) return null;
  
      // Use the current chunk data for price calculations (no need to reverse here, just get the range)
      const currentChunkData = allData.slice(
        currentChunkIndex * CHUNK_SIZE,
        (currentChunkIndex + 1) * CHUNK_SIZE
      );
      if (currentChunkData.length === 0) return null;
      
      const prices = currentChunkData.flatMap((d: Candlestick) => [d.high, d.low]);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice;
      if (priceRange === 0) return null;
  
      const priceToPixel = (price: number) => {
        return y + height - ((price - minPrice) / priceRange) * height;
      };
  
      const wickX = x + width / 2;
      const bodyWidth = Math.max(width * 0.6, 8);
  
      const highY = priceToPixel(payload.high);
      const lowY = priceToPixel(payload.low);
      const openY = priceToPixel(payload.open);
      const closeY = priceToPixel(payload.close);
  
      const isGreen = payload.close >= payload.open;
      const color = isGreen ? "#10b981" : "#ef4444";
  
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.abs(closeY - openY) || 2;
  
      return (
        <g>
          <line
            x1={wickX}
            y1={highY}
            x2={wickX}
            y2={lowY}
            stroke={color}
            strokeWidth={1}
          />
          <rect
            x={x + (width - bodyWidth) / 2}
            y={bodyTop}
            width={bodyWidth}
            height={bodyHeight}
            fill={color}
            stroke={color}
            strokeWidth={1}
          />
        </g>
      );
    };
  
    if (loading) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-6">
          <div className="text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mb-4"></div>
            <p>Loading Bitcoin data...</p>
          </div>
        </div>
      );
    }
  
    if (error) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-6">
          <div className="text-red-400">
            <p>Error loading data: {error}</p>
          </div>
        </div>
      );
    }
  
    // Calculate stats based on all data, not just current chunk
    const currentPrice = allData.length > 0 ? allData[allData.length - 1]?.close ?? 0 : 0;
    const previousPrice = allData.length > 0 ? allData[0]?.open ?? 0 : 0;
    const priceChange = currentPrice - previousPrice;
    const percentChange =
      previousPrice > 0 ? (priceChange / previousPrice) * 100 : 0;
    const allHigh = allData.length > 0 ? Math.max(...allData.map((d: Candlestick) => d.high)) : 0;
    const allLow = allData.length > 0 ? Math.min(...allData.map((d: Candlestick) => d.low)) : 0;
    const volumeSum = allData.reduce((sum: number, d: Candlestick) => sum + d.volume, 0);
  
    return (
      <div className="w-full h-full flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            Bitcoin (BTC/USDT)
          </h1>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <span className="text-3xl sm:text-4xl font-bold text-emerald-400">
              {formatUSD(currentPrice)}
            </span>
            <span
              className={`text-lg sm:text-xl font-semibold ${
                priceChange >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {priceChange >= 0 ? "+" : ""}
              {percentChange.toFixed(2)}% (24h)
            </span>
          </div>
          <p className="text-gray-400 mt-2">
            24-Hour Candlestick Chart (Binance)
          </p>
        </div>
  
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart
            data={data}
            margin={{ top: 20, right: 0, left: 0, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" stroke="#9ca3af" tick={{ fontSize: 12 }} />
            <YAxis
              stroke="#9ca3af"
              tick={{ fontSize: 12 }}
              domain={["auto", "auto"]}
              label=""
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #4b5563",
                borderRadius: "8px",
                color: "#fff",
              }}
              content={({ payload }) => {
                if (!payload || !payload[0]) return null;
                const d = payload[0].payload;
                return (
                  <div className="p-3 text-xs bg-white/30 backdrop-blur-sm rounded-lg font-mono">
                    <p className="font-semibold text-white">{d.time}</p>
                    <p className="text-emerald-400 flex justify-between">
                      <span>O:</span>
                      <span>{formatUSD(d.open)}</span>
                    </p>
                    <p className="text-emerald-400 flex justify-between">
                      <span>H:</span>
                      <span>{formatUSD(d.high)}</span>
                    </p>
                    <p className="text-red-400 flex justify-between">
                      <span>L:</span>
                      <span>{formatUSD(d.low)}</span>
                    </p>
                    <p className="text-emerald-400 flex justify-between">
                      <span>C:</span>
                      <span>{formatUSD(d.close)}</span>
                    </p>
                  </div>
                );
              }}
              cursor={{ stroke: "#6b7280" }}
            />
            <Bar dataKey="close" shape={<CustomCandlestick />} />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Navigation Controls */}
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            onClick={handlePrevious}
            disabled={currentChunkIndex >= totalChunks - 1}
            className={`px-6 py-2 rounded-lg font-semibold transition-all ${
              currentChunkIndex >= totalChunks - 1
                ? "bg-slate-700 text-gray-500 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            }`}
          >
            ← Older
          </button>
          <span className="text-gray-300 text-sm">
            {data && data.length > 0 ? (
              <>
                {data[0]?.time}-{data[data.length - 1]?.time} | Page {totalChunks - currentChunkIndex} of {totalChunks}
              </>
            ) : (
              `Page ${totalChunks - currentChunkIndex} of ${totalChunks}`
            )}
          </span>
          <button
            onClick={handleNext}
            disabled={currentChunkIndex === 0}
            className={`px-6 py-2 rounded-lg font-semibold transition-all ${
              currentChunkIndex === 0
                ? "bg-slate-700 text-gray-500 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            }`}
          >
            Newer →
          </button>
        </div>
  
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-700 rounded p-4">
            <p className="text-gray-400 text-sm">High (24h)</p>
            <p className="text-xl font-bold text-white">{formatUSD(allHigh)}</p>
          </div>
          <div className="bg-slate-700 rounded p-4">
            <p className="text-gray-400 text-sm">Low (24h)</p>
            <p className="text-xl font-bold text-white">{formatUSD(allLow)}</p>
          </div>
          <div className="bg-slate-700 rounded p-4">
            <p className="text-gray-400 text-sm">Total Volume (24h)</p>
            <p className="text-xl font-bold text-white">
              {formatNumber(volumeSum)}B USDT
            </p>
          </div>
          <div className="bg-slate-700 rounded p-4">
            <p className="text-gray-400 text-sm">Change</p>
            <p
              className={`text-xl font-bold ${
                priceChange >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {priceChange >= 0 ? "+" : ""}
              {formatUSD(priceChange)}
            </p>
          </div>
        </div>
      </div>
    );
  };

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}

