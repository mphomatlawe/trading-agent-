import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT"];
const BINANCE_BASE = "https://api.binance.com/api/v3";
const BINANCE_SAPI = "https://api.binance.com/sapi/v1";

const AI_SYSTEM = `You are an elite quantitative crypto trader. You receive real OHLCV candlestick data and market indicators.

Analyze the data and respond ONLY with this exact JSON (no markdown, no extra text):
{
  "marketBias": "BULLISH" | "BEARISH" | "NEUTRAL",
  "biasStrength": 40-95,
  "biasReason": "1 concise sentence explaining market bias for today",
  "shouldTrade": true | false,
  "direction": "BUY" | "SELL",
  "confidence": 40-92,
  "entry": <number - exact price to enter>,
  "stopLoss": <number - stop loss price>,
  "takeProfit1": <number - first take profit>,
  "takeProfit2": <number - second take profit>,
  "takeProfit3": <number - third take profit>,
  "riskReward": "1:X",
  "setup": "Pattern name (e.g. Bull Flag, Breakout, Support Bounce)",
  "reasoning": "2-3 sentences explaining the trade setup based on the chart data",
  "keyLevels": ["level description 1", "level description 2"],
  "warning": "Main risk or null"
}

Base your analysis on: trend direction, support/resistance, momentum, volume profile, candlestick patterns. Be precise with price levels.`;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

function calcEMA(closes, period) {
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  return ema12 - ema26;
}

function fmt(n, decimals = 2) {
  if (!n && n !== 0) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPrice(n) {
  if (!n) return "—";
  return n >= 1000 ? fmt(n, 2) : n >= 1 ? fmt(n, 4) : fmt(n, 6);
}

// Binance signature (HMAC-SHA256 via SubtleCrypto)
async function signQuery(queryString, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(queryString));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── MINI CHART ───────────────────────────────────────────────────────────────
function MiniChart({ candles, direction }) {
  if (!candles || candles.length < 2) return null;
  const closes = candles.map(c => c[4]);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const w = 300, h = 80;
  const pts = closes.map((c, i) => `${(i / (closes.length - 1)) * w},${h - ((c - min) / range) * h}`).join(" ");
  const color = direction === "BUY" ? "#00E696" : "#FF465A";
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: 80 }}>
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#cg)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── LOG ENTRY ────────────────────────────────────────────────────────────────
function LogEntry({ log }) {
  const colors = { info: "#4A90D9", success: "#00E696", error: "#FF465A", warn: "#F5A623", trade: "#C8A87A" };
  return (
    <div style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "flex-start" }}>
      <span style={{ color: "#3A4050", fontSize: 10, fontFamily: "monospace", whiteSpace: "nowrap", paddingTop: 1 }}>{log.time}</span>
      <span style={{ color: colors[log.type] || "#888", fontSize: 12, lineHeight: "1.5" }}>{log.msg}</span>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function TradingAgent() {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [accountInfo, setAccountInfo] = useState(null);

  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setIntervalVal] = useState("1h");
  const [tradeSize, setTradeSize] = useState("50"); // USDT
  const [running, setRunning] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [candles, setCandles] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [logs, setLogs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState("analysis");
  const [showSecret, setShowSecret] = useState(false);
  const [agentStatus, setAgentStatus] = useState("idle"); // idle | scanning | trading | error
  const intervalRef = useRef(null);
  const logsEndRef = useRef(null);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const addLog = useCallback((msg, type = "info") => {
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    setLogs(prev => [...prev.slice(-199), { msg, type, time }]);
  }, []);

  // ── Connect to Binance ──
  async function connect() {
    if (!apiKey.trim() || !apiSecret.trim()) return;
    setConnecting(true);
    addLog("Connecting to Binance...", "info");
    try {
      const ts = Date.now();
      const qs = `timestamp=${ts}`;
      const sig = await signQuery(qs, apiSecret);
      const res = await fetch(`${BINANCE_BASE}/account?${qs}&signature=${sig}`, {
        headers: { "X-MBX-APIKEY": apiKey },
      });
      if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
      const data = await res.json();
      if (data.code) throw new Error(data.msg);
      setAccountInfo(data);
      setConnected(true);
      addLog(`✓ Connected to Binance. Account type: ${data.accountType}`, "success");
      const usdt = data.balances?.find(b => b.asset === "USDT");
      if (usdt) addLog(`USDT Balance: ${fmt(usdt.free)} free / ${fmt(usdt.locked)} locked`, "info");
    } catch (e) {
      addLog(`✗ Connection failed: ${e.message}`, "error");
    }
    setConnecting(false);
  }

  // ── Fetch Candles ──
  async function fetchCandles(sym, tf) {
    const res = await fetch(`${BINANCE_BASE}/klines?symbol=${sym}&interval=${tf}&limit=100`);
    if (!res.ok) throw new Error("Failed to fetch candles");
    return await res.json();
  }

  // ── Fetch Price ──
  async function fetchPrice(sym) {
    const res = await fetch(`${BINANCE_BASE}/ticker/price?symbol=${sym}`);
    const d = await res.json();
    return parseFloat(d.price);
  }

  // ── AI Analysis ──
  async function runAnalysis() {
    setAnalyzing(true);
    setAgentStatus("scanning");
    addLog(`📊 Fetching ${symbol} ${interval} chart data...`, "info");
    try {
      const klines = await fetchCandles(symbol, interval);
      setCandles(klines);
      const price = await fetchPrice(symbol);
      setCurrentPrice(price);
      addLog(`Current price: $${fmtPrice(price)}`, "info");

      const closes = klines.map(k => parseFloat(k[4]));
      const volumes = klines.map(k => parseFloat(k[5]));
      const highs = klines.map(k => parseFloat(k[2]));
      const lows = klines.map(k => parseFloat(k[3]));
      const rsi = calcRSI(closes);
      const macd = calcMACD(closes);
      const ema20 = calcEMA(closes, 20);
      const ema50 = calcEMA(closes, 50);
      const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const lastVol = volumes[volumes.length - 1];
      const high24 = Math.max(...highs.slice(-24));
      const low24 = Math.min(...lows.slice(-24));
      const priceChange = ((closes[closes.length - 1] - closes[closes.length - 25]) / closes[closes.length - 25] * 100).toFixed(2);

      const chartSummary = `
Symbol: ${symbol} | Timeframe: ${interval} | Candles: ${klines.length}
Current Price: $${fmtPrice(price)}
24H Range: $${fmtPrice(low24)} – $${fmtPrice(high24)}
24H Change: ${priceChange}%
RSI(14): ${rsi.toFixed(1)}
MACD: ${macd.toFixed(4)}
EMA20: $${fmtPrice(ema20)} | EMA50: $${fmtPrice(ema50)}
Trend (EMA20 vs EMA50): ${ema20 > ema50 ? "BULLISH" : "BEARISH"}
Volume vs 20MA: ${((lastVol / avgVol) * 100).toFixed(0)}%
Last 10 closes: ${closes.slice(-10).map(fmtPrice).join(", ")}
Last 5 candles (O,H,L,C,V):
${klines.slice(-5).map(k => `  O:${fmtPrice(k[1])} H:${fmtPrice(k[2])} L:${fmtPrice(k[3])} C:${fmtPrice(k[4])} V:${fmt(k[5], 0)}`).join("\n")}
      `.trim();

      addLog("🤖 Sending chart data to AI for analysis...", "info");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: AI_SYSTEM,
          messages: [{ role: "user", content: `Analyze this crypto chart and provide a trade setup:\n\n${chartSummary}` }],
        }),
      });
      const aiData = await res.json();
      const raw = aiData.content.map(b => b.text || "").join("");
      const clean = raw.replace(/```json|```/g, "").trim();
      const result = JSON.parse(clean);
      setAnalysis(result);

      addLog(`📈 Market bias: ${result.marketBias} (${result.biasStrength}% strength)`, result.marketBias === "BULLISH" ? "success" : result.marketBias === "BEARISH" ? "error" : "warn");
      addLog(`🎯 Setup: ${result.setup} — ${result.direction} with ${result.confidence}% confidence`, "trade");
      addLog(result.reasoning, "info");
      if (result.warning) addLog(`⚠ Risk: ${result.warning}`, "warn");
      setAgentStatus("idle");
    } catch (e) {
      addLog(`✗ Analysis failed: ${e.message}`, "error");
      setAgentStatus("error");
    }
    setAnalyzing(false);
  }

  // ── Place Order on Binance ──
  async function placeOrder() {
    if (!analysis || !connected) return;
    setAgentStatus("trading");
    addLog("⚡ Preparing to place orders on Binance...", "trade");

    try {
      const price = await fetchPrice(symbol);
      const qty = (parseFloat(tradeSize) / price).toFixed(6);
      const side = analysis.direction;
      const ts = Date.now();

      // 1. Market order
      addLog(`📤 Placing ${side} market order: ${qty} ${symbol.replace("USDT", "")} @ ~$${fmtPrice(price)}`, "trade");
      const marketQS = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${qty}&timestamp=${ts}`;
      const marketSig = await signQuery(marketQS, apiSecret);
      const marketRes = await fetch(`${BINANCE_BASE}/order?${marketQS}&signature=${marketSig}`, {
        method: "POST",
        headers: { "X-MBX-APIKEY": apiKey },
      });
      const marketOrder = await marketRes.json();
      if (marketOrder.code) throw new Error(`Market order failed: ${marketOrder.msg}`);
      addLog(`✓ Market order filled! OrderId: ${marketOrder.orderId}`, "success");

      const oppSide = side === "BUY" ? "SELL" : "BUY";

      // 2. Stop-Loss order (STOP_LOSS_LIMIT)
      const slPrice = fmtPrice(analysis.stopLoss);
      const slLimit = fmtPrice(analysis.stopLoss * (side === "BUY" ? 0.999 : 1.001));
      const slTS = Date.now();
      const slQS = `symbol=${symbol}&side=${oppSide}&type=STOP_LOSS_LIMIT&quantity=${qty}&price=${slLimit}&stopPrice=${slPrice}&timeInForce=GTC&timestamp=${slTS}`;
      const slSig = await signQuery(slQS, apiSecret);
      const slRes = await fetch(`${BINANCE_BASE}/order?${slQS}&signature=${slSig}`, {
        method: "POST",
        headers: { "X-MBX-APIKEY": apiKey },
      });
      const slOrder = await slRes.json();
      if (slOrder.code) addLog(`⚠ Stop-loss order: ${slOrder.msg}`, "warn");
      else addLog(`✓ Stop-loss set @ $${fmtPrice(analysis.stopLoss)} (OrderId: ${slOrder.orderId})`, "success");

      // 3. Take-Profit (TAKE_PROFIT_LIMIT at TP1)
      const tpPrice = fmtPrice(analysis.takeProfit1);
      const tpLimit = fmtPrice(analysis.takeProfit1 * (side === "BUY" ? 1.001 : 0.999));
      const tpTS = Date.now();
      const tpQS = `symbol=${symbol}&side=${oppSide}&type=TAKE_PROFIT_LIMIT&quantity=${qty}&price=${tpLimit}&stopPrice=${tpPrice}&timeInForce=GTC&timestamp=${tpTS}`;
      const tpSig = await signQuery(tpQS, apiSecret);
      const tpRes = await fetch(`${BINANCE_BASE}/order?${tpQS}&signature=${tpSig}`, {
        method: "POST",
        headers: { "X-MBX-APIKEY": apiKey },
      });
      const tpOrder = await tpRes.json();
      if (tpOrder.code) addLog(`⚠ Take-profit order: ${tpOrder.msg}`, "warn");
      else addLog(`✓ Take-profit set @ $${fmtPrice(analysis.takeProfit1)} (OrderId: ${tpOrder.orderId})`, "success");

      setOrders(prev => [{
        id: marketOrder.orderId,
        symbol,
        side,
        qty,
        entry: fmtPrice(price),
        sl: fmtPrice(analysis.stopLoss),
        tp: fmtPrice(analysis.takeProfit1),
        rr: analysis.riskReward,
        time: new Date().toLocaleTimeString(),
        status: "OPEN",
      }, ...prev]);

      setTab("orders");
      addLog("🎉 Trade fully set up: entry + stop-loss + take-profit all placed!", "success");
      setAgentStatus("idle");
    } catch (e) {
      addLog(`✗ Order failed: ${e.message}`, "error");
      setAgentStatus("error");
    }
  }

  // ── Auto-run loop ──
  useEffect(() => {
    if (running && connected) {
      addLog("🔄 Auto-trade loop started. Analysing every 5 minutes...", "info");
      runAnalysis();
      intervalRef.current = setInterval(runAnalysis, 5 * 60 * 1000);
    } else {
      clearInterval(intervalRef.current);
      if (!running && connected) addLog("⏹ Auto-trade loop stopped.", "warn");
    }
    return () => clearInterval(intervalRef.current);
  }, [running, connected, symbol, interval]);

  // ── UI ──────────────────────────────────────────────────────────────────────
  const biasColor = analysis?.marketBias === "BULLISH" ? "#00E696" : analysis?.marketBias === "BEARISH" ? "#FF465A" : "#F5A623";
  const dirColor = analysis?.direction === "BUY" ? "#00E696" : "#FF465A";

  const statusDot = {
    idle: "#4A5568", scanning: "#F5A623", trading: "#00E696", error: "#FF465A"
  }[agentStatus];

  const usdtBalance = accountInfo?.balances?.find(b => b.asset === "USDT");

  return (
    <div style={{ minHeight: "100vh", background: "#060810", color: "#C8D0E0", fontFamily: "'IBM Plex Mono', monospace", position: "relative", overflow: "hidden" }}>

      {/* BG */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "radial-gradient(ellipse at 20% 50%, rgba(0,100,255,0.04) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(0,230,150,0.04) 0%, transparent 50%)" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 960, margin: "0 auto", padding: "24px 16px 32px" }}>

        {/* ── HEADER ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusDot, boxShadow: `0 0 10px ${statusDot}`, transition: "all 0.3s" }} />
              <span style={{ fontSize: 11, color: "#4A5568", letterSpacing: 3 }}>{agentStatus.toUpperCase()}</span>
            </div>
            <h1 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 700, color: "#fff", letterSpacing: -1 }}>
              NEXUS <span style={{ color: "#00E696" }}>TRADE</span>
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: "#3A4050" }}>Autonomous Binance Trading Agent · AI-Powered</p>
          </div>
          {connected && usdtBalance && (
            <div style={{ textAlign: "right", background: "rgba(0,230,150,0.06)", border: "1px solid rgba(0,230,150,0.15)", borderRadius: 12, padding: "10px 16px" }}>
              <div style={{ fontSize: 10, color: "#4A5568", letterSpacing: 2, marginBottom: 3 }}>USDT BALANCE</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#00E696" }}>${fmt(usdtBalance.free)}</div>
              {parseFloat(usdtBalance.locked) > 0 && <div style={{ fontSize: 10, color: "#4A5568" }}>${fmt(usdtBalance.locked)} locked</div>}
            </div>
          )}
        </div>

        {/* ── API CONNECTION ── */}
        {!connected ? (
          <div style={{ background: "rgba(10,14,24,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 28, marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: "#00E696", letterSpacing: 2, marginBottom: 4 }}>CONNECT BINANCE</div>
            <p style={{ fontSize: 12, color: "#4A5568", margin: "0 0 20px" }}>Use a Read + Trade API key. Never enable withdrawals. Your keys stay in your browser only.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[
                { label: "API KEY", val: apiKey, set: setApiKey, type: "text", ph: "Your Binance API Key" },
                { label: "API SECRET", val: apiSecret, set: setApiSecret, type: showSecret ? "text" : "password", ph: "Your Binance Secret" },
              ].map(({ label, val, set, type, ph }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, color: "#4A5568", letterSpacing: 2, marginBottom: 6 }}>{label}</div>
                  <input value={val} onChange={e => set(e.target.value)} type={type} placeholder={ph}
                    style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={connect} disabled={connecting || !apiKey || !apiSecret}
                style={{ background: apiKey && apiSecret ? "#00E696" : "rgba(0,230,150,0.15)", color: apiKey && apiSecret ? "#060810" : "#2A4A3A", border: "none", borderRadius: 10, padding: "11px 24px", fontSize: 12, fontWeight: 700, cursor: apiKey && apiSecret ? "pointer" : "not-allowed", fontFamily: "inherit", letterSpacing: 1 }}>
                {connecting ? "CONNECTING..." : "CONNECT →"}
              </button>
              <button onClick={() => setShowSecret(s => !s)}
                style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "#4A5568", borderRadius: 10, padding: "10px 16px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                {showSecret ? "HIDE" : "SHOW"} SECRET
              </button>
              <span style={{ fontSize: 11, color: "#2A3040" }}>🔒 Keys never leave your browser</span>
            </div>
          </div>
        ) : (
          <>
            {/* ── CONTROLS ── */}
            <div style={{ background: "rgba(10,14,24,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              {[
                { label: "SYMBOL", el: <select value={symbol} onChange={e => setSymbol(e.target.value)} style={selStyle}>{COINS.map(c => <option key={c}>{c}</option>)}</select> },
                { label: "TIMEFRAME", el: <select value={interval} onChange={e => setIntervalVal(e.target.value)} style={selStyle}>{["15m","30m","1h","4h","1d"].map(t => <option key={t}>{t}</option>)}</select> },
                { label: "TRADE SIZE (USDT)", el: <input value={tradeSize} onChange={e => setTradeSize(e.target.value)} style={{ ...selStyle, width: 120 }} placeholder="50" /> },
              ].map(({ label, el }) => (
                <div key={label}>
                  <div style={{ fontSize: 9, color: "#4A5568", letterSpacing: 2, marginBottom: 5 }}>{label}</div>
                  {el}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button onClick={runAnalysis} disabled={analyzing}
                  style={{ background: "rgba(74,144,217,0.15)", border: "1px solid rgba(74,144,217,0.3)", color: "#4A90D9", borderRadius: 10, padding: "10px 18px", fontSize: 11, fontWeight: 700, cursor: analyzing ? "not-allowed" : "pointer", fontFamily: "inherit", letterSpacing: 1 }}>
                  {analyzing ? "SCANNING..." : "ANALYSE NOW"}
                </button>
                <button onClick={() => setRunning(r => !r)}
                  style={{ background: running ? "rgba(255,70,90,0.15)" : "rgba(0,230,150,0.15)", border: `1px solid ${running ? "rgba(255,70,90,0.3)" : "rgba(0,230,150,0.3)"}`, color: running ? "#FF465A" : "#00E696", borderRadius: 10, padding: "10px 18px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1 }}>
                  {running ? "⏹ STOP AUTO" : "▶ START AUTO"}
                </button>
              </div>
            </div>

            {/* ── TABS ── */}
            <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
              {["analysis", "orders", "log"].map(t => (
                <button key={t} onClick={() => setTab(t)}
                  style={{ background: tab === t ? "rgba(0,230,150,0.1)" : "transparent", border: `1px solid ${tab === t ? "rgba(0,230,150,0.3)" : "rgba(255,255,255,0.06)"}`, color: tab === t ? "#00E696" : "#4A5568", borderRadius: 8, padding: "7px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1, textTransform: "uppercase" }}>
                  {t}{t === "orders" && orders.length ? ` (${orders.length})` : ""}
                </button>
              ))}
            </div>

            {/* ── ANALYSIS TAB ── */}
            {tab === "analysis" && (
              <div>
                {!analysis && !analyzing && (
                  <div style={{ textAlign: "center", padding: "60px 20px", color: "#2A3040" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>📡</div>
                    <div style={{ fontSize: 14 }}>Click ANALYSE NOW to scan the market</div>
                  </div>
                )}
                {analyzing && (
                  <div style={{ display: "flex", gap: 14, alignItems: "center", background: "rgba(74,144,217,0.06)", border: "1px solid rgba(74,144,217,0.15)", borderRadius: 14, padding: "20px 24px" }}>
                    <div style={{ display: "flex", gap: 5 }}>{[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#4A90D9", animation: `p 1.2s ${i*0.2}s infinite` }} />)}</div>
                    <span style={{ color: "#4A90D9", fontSize: 13 }}>Fetching chart data & running AI analysis...</span>
                  </div>
                )}
                {analysis && !analyzing && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {/* Market Bias */}
                    <div style={{ ...cardStyle, borderColor: `${biasColor}30`, gridColumn: "1 / -1" }}>
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${biasColor}, transparent)` }} />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 9, color: "#4A5568", letterSpacing: 2, marginBottom: 4 }}>TODAY'S MARKET BIAS</div>
                          <div style={{ fontSize: 32, fontWeight: 700, color: biasColor, letterSpacing: -1 }}>{analysis.marketBias}</div>
                          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6, maxWidth: 400 }}>{analysis.biasReason}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 9, color: "#4A5568", letterSpacing: 2, marginBottom: 4 }}>STRENGTH</div>
                          <div style={{ fontSize: 36, fontWeight: 700, color: biasColor }}>{analysis.biasStrength}%</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 12, height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${analysis.biasStrength}%`, background: biasColor, borderRadius: 3, transition: "width 1s ease" }} />
                      </div>
                    </div>

                    {/* Trade Setup */}
                    <div style={{ ...cardStyle, borderColor: `${dirColor}25` }}>
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${dirColor}, transparent)` }} />
                      <div style={{ fontSize: 9, color: "#4A5568", letterSpacing: 2, marginBottom: 12 }}>TRADE SETUP</div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                        <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${dirColor}18`, color: dirColor, border: `1px solid ${dirColor}35` }}>{analysis.direction}</span>
                        <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, background: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }}>{analysis.setup}</span>
                        <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, background: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }}>{analysis.riskReward} R:R</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {[
                          { l: "ENTRY", v: `$${fmtPrice(analysis.entry)}`, c: "#C8A87A" },
                          { l: "STOP LOSS", v: `$${fmtPrice(analysis.stopLoss)}`, c: "#FF465A" },
                          { l: "TP1", v: `$${fmtPrice(analysis.takeProfit1)}`, c: "#00E696" },
                          { l: "TP2", v: `$${fmtPrice(analysis.takeProfit2)}`, c: "rgba(0,230,150,0.7)" },
                        ].map(({ l, v, c }) => (
                          <div key={l} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.05)" }}>
                            <div style={{ fontSize: 9, color: "#4A5568", letterSpacing: 1.5, marginBottom: 4 }}>{l}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: c }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {analysis.takeProfit3 && (
                        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.05)", marginTop: 8 }}>
                          <div style={{ fontSize: 9, color: "#4A5568", letterSpacing: 1.5, marginBottom: 4 }}>TP3 (FINAL TARGET)</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(0,230,150,0.5)" }}>${fmtPrice(analysis.takeProfit3)}</div>
                        </div>
                      )}
                      {/* Chart mini */}
                      {candles.length > 0 && <div style={{ marginTop: 12, opacity: 0.8 }}><MiniChart candles={candles} direction={analysis.direction} /></div>}
                    </div>

                    {/* Reasoning */}
                    <div style={cardStyle}>
                      <div style={{ fontSize: 9, color: "#4A5568", letterSpacing: 2, marginBottom: 10 }}>AI REASONING</div>
                      <p style={{ fontSize: 13, color: "#8A93A8", lineHeight: 1.8, margin: "0 0 14px" }}>{analysis.reasoning}</p>
                      {analysis.keyLevels?.length > 0 && (
                        <>
                          <div style={{ fontSize: 9, color: "#4A5568", letterSpacing: 2, marginBottom: 8 }}>KEY LEVELS</div>
                          {analysis.keyLevels.map((l, i) => (
                            <div key={i} style={{ fontSize: 12, color: "#6B7280", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>→ {l}</div>
                          ))}
                        </>
                      )}
                      {analysis.warning && (
                        <div style={{ marginTop: 12, background: "rgba(255,165,0,0.08)", border: "1px solid rgba(255,165,0,0.2)", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#F5A623" }}>
                          ⚠ {analysis.warning}
                        </div>
                      )}
                    </div>

                    {/* Execute */}
                    {analysis.shouldTrade && (
                      <div style={{ ...cardStyle, gridColumn: "1 / -1", borderColor: "rgba(0,230,150,0.2)", textAlign: "center" }}>
                        <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
                          AI recommends a <strong style={{ color: dirColor }}>{analysis.direction}</strong> on {symbol} with <strong style={{ color: "#fff" }}>{analysis.confidence}%</strong> confidence. Trade size: <strong style={{ color: "#fff" }}>${tradeSize} USDT</strong>
                        </div>
                        <button onClick={placeOrder}
                          style={{ background: dirColor, color: "#060810", border: "none", borderRadius: 12, padding: "14px 36px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1, boxShadow: `0 0 24px ${dirColor}40` }}>
                          ⚡ EXECUTE TRADE ON BINANCE
                        </button>
                        <div style={{ fontSize: 11, color: "#2A3040", marginTop: 10 }}>Places market entry + stop-loss + take-profit automatically</div>
                      </div>
                    )}
                    {!analysis.shouldTrade && (
                      <div style={{ ...cardStyle, gridColumn: "1 / -1", borderColor: "rgba(255,165,0,0.2)", textAlign: "center" }}>
                        <div style={{ fontSize: 18 }}>🚫</div>
                        <div style={{ fontSize: 13, color: "#F5A623", marginTop: 8 }}>AI advises <strong>no trade</strong> right now. Conditions are not favorable. Waiting for a cleaner setup.</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── ORDERS TAB ── */}
            {tab === "orders" && (
              <div>
                {orders.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 20px", color: "#2A3040" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                    <div style={{ fontSize: 14 }}>No orders placed yet this session</div>
                  </div>
                ) : orders.map((o, i) => (
                  <div key={i} style={{ ...cardStyle, marginBottom: 12, display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr 1fr 1fr auto", alignItems: "center", gap: 16 }}>
                    <span style={{ fontSize: 10, color: o.side === "BUY" ? "#00E696" : "#FF465A", fontWeight: 700, letterSpacing: 1 }}>{o.side}</span>
                    <div><div style={{ fontSize: 9, color: "#4A5568" }}>SYMBOL</div><div style={{ fontSize: 13, color: "#fff" }}>{o.symbol}</div></div>
                    <div><div style={{ fontSize: 9, color: "#4A5568" }}>ENTRY</div><div style={{ fontSize: 13, color: "#C8A87A" }}>${o.entry}</div></div>
                    <div><div style={{ fontSize: 9, color: "#4A5568" }}>STOP</div><div style={{ fontSize: 13, color: "#FF465A" }}>${o.sl}</div></div>
                    <div><div style={{ fontSize: 9, color: "#4A5568" }}>TARGET</div><div style={{ fontSize: 13, color: "#00E696" }}>${o.tp}</div></div>
                    <div><div style={{ fontSize: 9, color: "#4A5568" }}>R:R</div><div style={{ fontSize: 13, color: "#fff" }}>{o.rr}</div></div>
                    <div style={{ fontSize: 10, color: "#4A5568" }}>{o.time}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── LOG TAB ── */}
            {tab === "log" && (
              <div style={{ background: "rgba(6,8,16,0.9)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16, maxHeight: 480, overflowY: "auto" }}>
                {logs.length === 0 && <div style={{ color: "#2A3040", fontSize: 12, textAlign: "center", padding: 40 }}>No logs yet</div>}
                {logs.map((l, i) => <LogEntry key={i} log={l} />)}
                <div ref={logsEndRef} />
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 24, textAlign: "center", fontSize: 10, color: "#1E2530", letterSpacing: 1 }}>
          ⚠ FOR EDUCATIONAL PURPOSES · ALWAYS DYOR · NEVER RISK MORE THAN YOU CAN AFFORD TO LOSE
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap');
        @keyframes p { 0%,80%,100%{opacity:.2;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }
        * { box-sizing: border-box; }
        select option { background: #0D1117; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  );
}

const cardStyle = {
  background: "rgba(10,14,24,0.9)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 14,
  padding: 20,
  position: "relative",
  overflow: "hidden",
};

const selStyle = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "9px 12px",
  color: "#fff",
  fontSize: 12,
  outline: "none",
  fontFamily: "'IBM Plex Mono', monospace",
  cursor: "pointer",
};
