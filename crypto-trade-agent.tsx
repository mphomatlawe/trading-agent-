import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are CryptoEdge, an elite crypto trading strategist with deep expertise in technical analysis, market structure, and crypto market dynamics.

Your role is to generate specific, actionable crypto trade ideas based on the user's input (coin name, market conditions, sentiment, timeframe, etc.).

For each trade idea, structure your response EXACTLY in this JSON format (respond ONLY with valid JSON, no markdown, no extra text):

{
  "coin": "BTC",
  "fullName": "Bitcoin",
  "direction": "LONG" or "SHORT",
  "timeframe": "4H / Daily / Weekly etc",
  "entry": "$XX,XXX",
  "stopLoss": "$XX,XXX",
  "targets": ["$XX,XXX", "$XX,XXX", "$XX,XXX"],
  "riskReward": "1:X",
  "confidence": 65,
  "thesis": "2-3 sentence explanation of the trade rationale",
  "keyRisks": ["risk 1", "risk 2"],
  "setup": "Pattern or setup name (e.g. Bull Flag, Breakout, Support Bounce, Descending Wedge)",
  "tags": ["tag1", "tag2", "tag3"]
}

Confidence should be a number 40-90. Be realistic and analytical. Base your ideas on technical setups, market structure, momentum, support/resistance, macro crypto trends. Always include proper risk management with stop losses.`;

const SUGGESTIONS = [
  "BTC daily chart, looking for a swing trade",
  "Best altcoin setups for this week",
  "ETH showing bullish divergence on 4H",
  "SOL broke out of a 2-week range",
  "High risk/reward short setup on any coin",
  "Low cap gems with strong momentum",
];

function TradeCard({ trade, index }) {
  const isLong = trade.direction === "LONG";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), index * 120);
    return () => clearTimeout(t);
  }, [index]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: "all 0.5s cubic-bezier(0.23, 1, 0.32, 1)",
        background: "rgba(10,12,18,0.85)",
        border: `1px solid ${isLong ? "rgba(0,230,150,0.25)" : "rgba(255,70,90,0.25)"}`,
        borderRadius: "16px",
        padding: "24px",
        marginBottom: "16px",
        backdropFilter: "blur(12px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Glow accent */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "2px",
        background: isLong
          ? "linear-gradient(90deg, transparent, #00E696, transparent)"
          : "linear-gradient(90deg, transparent, #FF465A, transparent)",
      }} />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "26px", fontWeight: "800", color: "#fff", fontFamily: "'Syne', sans-serif", letterSpacing: "-1px" }}>
              {trade.coin}
            </span>
            <span style={{ fontSize: "13px", color: "#666", fontFamily: "'JetBrains Mono', monospace" }}>{trade.fullName}</span>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <span style={{
              padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700",
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: "1px",
              background: isLong ? "rgba(0,230,150,0.15)" : "rgba(255,70,90,0.15)",
              color: isLong ? "#00E696" : "#FF465A",
              border: `1px solid ${isLong ? "rgba(0,230,150,0.3)" : "rgba(255,70,90,0.3)"}`,
            }}>{trade.direction}</span>
            <span style={{
              padding: "3px 10px", borderRadius: "20px", fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              background: "rgba(255,255,255,0.05)", color: "#888",
              border: "1px solid rgba(255,255,255,0.08)",
            }}>{trade.timeframe}</span>
            <span style={{
              padding: "3px 10px", borderRadius: "20px", fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              background: "rgba(255,255,255,0.05)", color: "#888",
              border: "1px solid rgba(255,255,255,0.08)",
            }}>{trade.setup}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "11px", color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: "4px" }}>CONFIDENCE</div>
          <div style={{ fontSize: "28px", fontWeight: "800", fontFamily: "'Syne', sans-serif",
            color: trade.confidence >= 70 ? "#00E696" : trade.confidence >= 55 ? "#F5A623" : "#FF465A" }}>
            {trade.confidence}%
          </div>
        </div>
      </div>

      {/* Levels Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "18px" }}>
        {[
          { label: "ENTRY", value: trade.entry, color: "#C8A87A" },
          { label: "STOP LOSS", value: trade.stopLoss, color: "#FF465A" },
          { label: "R:R", value: trade.riskReward, color: "#00E696" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.03)", borderRadius: "10px",
            padding: "12px", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ fontSize: "9px", color: "#555", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "1.5px", marginBottom: "6px" }}>{label}</div>
            <div style={{ fontSize: "15px", fontWeight: "700", color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Targets */}
      <div style={{ marginBottom: "18px" }}>
        <div style={{ fontSize: "9px", color: "#555", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "1.5px", marginBottom: "8px" }}>TARGETS</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {trade.targets.map((t, i) => (
            <span key={i} style={{
              padding: "5px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: "600",
              fontFamily: "'JetBrains Mono', monospace",
              background: `rgba(0,230,150,${0.05 + i * 0.04})`,
              color: `rgba(0,230,150,${0.6 + i * 0.15})`,
              border: `1px solid rgba(0,230,150,${0.1 + i * 0.08})`,
            }}>TP{i + 1}: {t}</span>
          ))}
        </div>
      </div>

      {/* Thesis */}
      <div style={{
        background: "rgba(255,255,255,0.03)", borderRadius: "10px",
        padding: "14px", marginBottom: "14px", border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ fontSize: "9px", color: "#555", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "1.5px", marginBottom: "8px" }}>THESIS</div>
        <p style={{ color: "#B0B8C8", fontSize: "13px", lineHeight: "1.7", margin: 0, fontFamily: "'Instrument Serif', serif" }}>
          {trade.thesis}
        </p>
      </div>

      {/* Risks */}
      <div>
        <div style={{ fontSize: "9px", color: "#555", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "1.5px", marginBottom: "8px" }}>KEY RISKS</div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {trade.keyRisks.map((r, i) => (
            <span key={i} style={{
              padding: "4px 10px", borderRadius: "6px", fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              background: "rgba(255,70,90,0.08)", color: "#FF6B7A",
              border: "1px solid rgba(255,70,90,0.15)",
            }}>⚠ {r}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CryptoTradeAgent() {
  const [input, setInput] = useState("");
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const inputRef = useRef(null);

  async function generateIdeas() {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError("");

    const userMsg = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: newMessages,
        }),
      });

      const data = await response.json();
      const raw = data.content.map(b => b.text || "").join("");

      // Parse — may be array or single object
      let parsed;
      try {
        const clean = raw.replace(/```json|```/g, "").trim();
        parsed = JSON.parse(clean);
      } catch {
        throw new Error("Couldn't parse trade idea. Try rephrasing.");
      }

      const newTrades = Array.isArray(parsed) ? parsed : [parsed];
      setTrades(prev => [...newTrades, ...prev]);
      setMessages(prev => [...prev, { role: "assistant", content: raw }]);
    } catch (e) {
      setError(e.message || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      generateIdeas();
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080A10",
      fontFamily: "'JetBrains Mono', monospace",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background grid */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(0,230,150,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,230,150,0.03) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
      }} />

      {/* Radial glow */}
      <div style={{
        position: "fixed", top: "-20%", left: "50%", transform: "translateX(-50%)",
        width: "600px", height: "400px", zIndex: 0,
        background: "radial-gradient(ellipse, rgba(0,230,150,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: "720px", margin: "0 auto", padding: "40px 20px 120px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            background: "rgba(0,230,150,0.08)", border: "1px solid rgba(0,230,150,0.2)",
            borderRadius: "20px", padding: "5px 14px", marginBottom: "20px",
          }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00E696", boxShadow: "0 0 8px #00E696" }} />
            <span style={{ fontSize: "11px", color: "#00E696", letterSpacing: "2px" }}>LIVE AGENT</span>
          </div>
          <h1 style={{
            margin: 0, fontSize: "42px", fontWeight: "800", color: "#fff",
            fontFamily: "'Syne', sans-serif", letterSpacing: "-2px", lineHeight: 1,
          }}>
            Crypto<span style={{ color: "#00E696" }}>Edge</span>
          </h1>
          <p style={{ color: "#4A5568", fontSize: "13px", marginTop: "10px", letterSpacing: "0.5px" }}>
            AI-powered trade idea generation · Always DYOR · Not financial advice
          </p>
        </div>

        {/* Empty state */}
        {trades.length === 0 && !loading && (
          <div style={{ marginBottom: "32px" }}>
            <p style={{ color: "#4A5568", fontSize: "11px", letterSpacing: "1.5px", marginBottom: "12px", textAlign: "center" }}>
              TRY ASKING
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => setInput(s)} style={{
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "20px", padding: "7px 14px", color: "#6B7280", fontSize: "12px",
                  cursor: "pointer", transition: "all 0.2s", fontFamily: "'JetBrains Mono', monospace",
                }}
                  onMouseEnter={e => { e.target.style.borderColor = "rgba(0,230,150,0.3)"; e.target.style.color = "#00E696"; }}
                  onMouseLeave={e => { e.target.style.borderColor = "rgba(255,255,255,0.08)"; e.target.style.color = "#6B7280"; }}
                >{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* Trade cards */}
        <div>
          {trades.map((trade, i) => (
            <TradeCard key={i} trade={trade} index={i} />
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{
            display: "flex", alignItems: "center", gap: "14px",
            background: "rgba(0,230,150,0.05)", border: "1px solid rgba(0,230,150,0.15)",
            borderRadius: "14px", padding: "20px 24px", marginBottom: "16px",
          }}>
            <div style={{ display: "flex", gap: "5px" }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: "6px", height: "6px", borderRadius: "50%", background: "#00E696",
                  animation: `pulse 1.2s ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
            <span style={{ color: "#00E696", fontSize: "13px" }}>Scanning market structure...</span>
          </div>
        )}

        {error && (
          <div style={{
            background: "rgba(255,70,90,0.08)", border: "1px solid rgba(255,70,90,0.2)",
            borderRadius: "12px", padding: "14px 18px", color: "#FF6B7A", fontSize: "13px", marginBottom: "16px",
          }}>⚠ {error}</div>
        )}
      </div>

      {/* Fixed input bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 10,
        background: "rgba(8,10,16,0.95)", borderTop: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px)", padding: "16px 20px",
      }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", display: "flex", gap: "10px" }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Describe a coin or market setup... (e.g. 'BTC showing strength on 4H')"
            style={{
              flex: 1, background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px",
              padding: "14px 18px", color: "#fff", fontSize: "13px", outline: "none",
              fontFamily: "'JetBrains Mono', monospace",
              transition: "border-color 0.2s",
            }}
            onFocus={e => e.target.style.borderColor = "rgba(0,230,150,0.4)"}
            onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
          />
          <button
            onClick={generateIdeas}
            disabled={!input.trim() || loading}
            style={{
              background: input.trim() && !loading ? "#00E696" : "rgba(0,230,150,0.2)",
              color: input.trim() && !loading ? "#080A10" : "#2A4A3A",
              border: "none", borderRadius: "12px", padding: "14px 22px",
              fontSize: "13px", fontWeight: "700", cursor: input.trim() && !loading ? "pointer" : "not-allowed",
              fontFamily: "'JetBrains Mono', monospace", transition: "all 0.2s",
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "..." : "Generate →"}
          </button>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;600;700&family=Instrument+Serif:ital@0;1&display=swap');
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,230,150,0.2); border-radius: 2px; }
        input::placeholder { color: #3A4050; }
      `}</style>
    </div>
  );
}
