// server.js
// Node.js Express backend for IBM-FE Real-Time Stock Ticker (Phase 3 - MVP)

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const bodyParser = require("body-parser");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ALPHAVANTAGE_API_KEY || null;

// Default watchlist
let symbols = ["AAPL", "TSLA", "MSFT"];
let lastKnown = {}; // { SYMBOL: { price, change, percent, timestamp, pricesArray } }

// Chart renderer setup
const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width: 800,
  height: 300,
  backgroundColour: "white",
});

// -------- Helper: Simulated Price Generator --------
function simulatePrice(symbol) {
  const base = (symbol.split("").reduce((s, c) => s + c.charCodeAt(0), 0) % 500) + 100;
  const last = lastKnown[symbol]?.price || base;
  const drift = (Math.random() - 0.5) * (base * 0.01);
  const newPrice = Math.max(0.01, parseFloat((last + drift).toFixed(2)));
  const change = parseFloat((newPrice - last).toFixed(2));
  const percent = ((change / last) * 100).toFixed(2) + "%";
  return { symbol, price: newPrice, change, percent, source: "simulated" };
}

// -------- Helper: Fetch real-time price from Alpha Vantage --------
async function fetchAlphaQuote(symbol) {
  if (!API_KEY) return null;
  try {
   const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
    const res = await axios.get(url);
    const q = res.data["Global Quote"];
    if (!q) return null;
    return {
      symbol: q["01. symbol"],
      price: parseFloat(q["05. price"]),
      change: parseFloat(q["09. change"]),
      percent: q["10. change percent"],
      source: "alphavantage",
    };
  } catch (err) {
    console.error("Alpha fetch error:", err.message);
    return null;
  }
}

// -------- Update all symbols periodically --------
async function refreshAll() {
  for (let sym of symbols) {
    const q = await fetchAlphaQuote(sym);
    const data = q || simulatePrice(sym);
    lastKnown[sym] = {
      price: data.price,
      change: data.change,
      percent: data.percent,
      timestamp: Date.now(),
      source: data.source,
      pricesArray: lastKnown[sym]?.pricesArray
        ? [...lastKnown[sym].pricesArray.slice(-23), data.price]
        : [data.price],
    };
  }
}
setInterval(refreshAll, 10 * 1000);
(async () => await refreshAll())();

// -------- Routes --------

// Home
app.get("/", (req, res) => {
  res.send(`
    <h2>IBM FE - Real-Time Stock Ticker (Phase 3)</h2>
    <p>Available Endpoints:</p>
    <ul>
      <li>GET /prices</li>
      <li>GET /price/:symbol</li>
      <li>POST /symbol {"symbol":"NFLX"}</li>
      <li>GET /chart/:symbol</li>
    </ul>
  `);
});

// Get all stock prices
app.get("/prices", (req, res) => {
  const out = symbols.map(sym => ({ symbol: sym, ...(lastKnown[sym] || {}) }));
  res.json(out);
});

// Get specific stock price
app.get("/price/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (!symbols.includes(symbol)) symbols.push(symbol);

  const q = await fetchAlphaQuote(symbol);
  const data = q || simulatePrice(symbol);

  lastKnown[symbol] = {
    price: data.price,
    change: data.change,
    percent: data.percent,
    timestamp: Date.now(),
    source: data.source,
    pricesArray: lastKnown[symbol]?.pricesArray
      ? [...lastKnown[symbol].pricesArray.slice(-23), data.price]
      : [data.price],
  };

  res.json({ symbol, ...lastKnown[symbol] });
});

// Add new stock
app.post("/symbol", (req, res) => {
  const symbol = (req.body.symbol || "").toUpperCase().trim();
  if (!symbol) return res.status(400).json({ error: "symbol required" });
  if (!symbols.includes(symbol)) symbols.push(symbol);
  res.json({ ok: true, symbol, symbols });
});

// Chart endpoint
app.get("/chart/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const data = lastKnown[symbol]?.pricesArray || Array.from({ length: 20 }, () => Math.random() * 100 + 200);

  const config = {
    type: "line",
    data: {
      labels: data.map((_, i) => i.toString()),
      datasets: [
        {
          label: symbol,
          data,
          borderColor: "#007bff",
          backgroundColor: "rgba(0,123,255,0.1)",
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { display: false }, y: { display: true } },
    },
  };

  const image = await chartJSNodeCanvas.renderToBuffer(config, "image/png");
  res.set("Content-Type", "image/png");
  res.send(image);
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
console.log(`🔑 Alpha Vantage Key: ${API_KEY ? "Loaded from .env" : "Using fallback (J8AUPVJANOR2WQ5P)"}`);
});