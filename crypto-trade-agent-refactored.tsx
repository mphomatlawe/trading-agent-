import { useState, useCallback, useMemo, ReactNode } from "react";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface Trade {
  coin: string;
  fullName: string;
  direction: "LONG" | "SHORT";
  timeframe: string;
  entry: string;
  stopLoss: string;
  targets: string[];
  riskReward: string;
  confidence: number;
  thesis: string;
  keyRisks: string[];
  setup: string;
  tags?: string[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ============================================================================
// CONSTANTS & THEME
// ============================================================================

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

Confidence should be a number 40-90. Be realistic and analytical. Base your ideas on technical setups, market structure, momentum, support/resistance, macro crypto trends. Always include proper risk management principles.`;

const SUGGESTIONS = [
  "BTC daily chart, looking for a swing trade",
  "Best altcoin setups for this week",
  "ETH showing bullish divergence on 4H",
  "SOL broke out of a 2-week range",
  "High risk/reward short setup on any coin",
  "Low cap gems with strong momentum",
];

const COLORS = {
  primary: "#00E696",
  danger: "#FF465A",
  warning: "#F5A623",
  text: {
    primary: "#fff",
    secondary: "#B0B8C8",
    muted: "#4A5568",
    subtle: "#888",
  },
  bg: {
    dark: "#080A10",
    card: "rgba(10,12,18,0.85)",
    input: "rgba(255,255,255,0.05)",
  },
  border: {
    subtle: "rgba(255,255,255,0.08)",
    light: "rgba(255,255,255,0.1)",
    medium: "rgba(255,255,255,0.06)",
  },
};

// ============================================================================
// STYLE GENERATORS
// ============================================================================

const createBadgeStyle = (isLong: boolean) => ({
  padding: "3px 10px",
  borderRadius: "20px",
  fontSize: "11px",
  fontWeight: "700" as const,
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: "1px",
  background: isLong ? "rgba(0,230,150,0.15)" : "rgba(255,70,90,0.15)",
  color: isLong ? COLORS.primary : COLORS.danger,
  border: `1px solid ${isLong ? "rgba(0,230,150,0.3)" : "rgba(255,70,90,0.3)"}`,
});

const createNeutralBadgeStyle = () => ({
  padding: "3px 10px",
  borderRadius: "20px",
  fontSize: "11px",
  fontFamily: "'JetBrains Mono', monospace",
  background: COLORS.bg.input,
  color: COLORS.text.subtle,
  border: `1px solid ${COLORS.border.subtle}`,
});

const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 70) return COLORS.primary;
  if (confidence >= 55) return COLORS.warning;
  return COLORS.danger;
};

// ============================================================================
// VALIDATION
// ============================================================================

const validateTrade = (trade: unknown): trade is Trade => {
  if (!trade || typeof trade !== "object") return false;
  const required = [
    "coin",
    "fullName",
    "direction",
    "entry",
    "stopLoss",
    "targets",
    "confidence",
    "thesis",
    "keyRisks",
    "setup",
  ];
  return required.every((key) => key in (trade as Record<string, unknown>));
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface ConfidenceDisplayProps {
  confidence: number;
}

const ConfidenceDisplay = ({ confidence }: ConfidenceDisplayProps) => (
  <div style={{ textAlign: "right" }}>
    <div
      style={{
        fontSize: "11px",
        color: COLORS.text.muted,
        fontFamily: "'JetBrains Mono', monospace",
        marginBottom: "4px",
      }}
    >
      CONFIDENCE
    </div>
    <div
      style={{
        fontSize: "28px",
        fontWeight: "800",
        fontFamily: "'Syne', sans-serif",
        color: getConfidenceColor(confidence),
      }}
    >
      {confidence}%
    </div>
  </div>
);

interface LevelGridProps {
  entry: string;
  stopLoss: string;
  riskReward: string;
}

const LevelGrid = ({ entry, stopLoss, riskReward }: LevelGridProps) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: "10px",
      marginBottom: "18px",
    }}
  >
    {[
      { label: "ENTRY", value: entry, color: "#C8A87A" },
      { label: "STOP LOSS", value: stopLoss, color: COLORS.danger },
      { label: "R:R", value: riskReward, color: COLORS.primary },
    ].map(({ label, value, color }) => (
      <div
        key={label}
        style={{
          background: "rgba(255,255,255,0.03)",
          borderRadius: "10px",
          padding: "12px",
          border: `1px solid ${COLORS.border.medium}`,
        }}
      >
        <div
          style={{
            fontSize: "9px",
            color: COLORS.text.muted,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "1.5px",
            marginBottom: "6px",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: "15px",
            fontWeight: "700",
            color,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {value}
        </div>
      </div>
    ))}
  </div>
);

interface TradeTargetsProps {
  targets: string[];
}

const TradeTargets = ({ targets }: TradeTargetsProps) => (
  <div style={{ marginBottom: "18px" }}>
    <div
      style={{
        fontSize: "9px",
        color: COLORS.text.muted,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "1.5px",
        marginBottom: "8px",
      }}
    >
      TARGETS
    </div>
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      {targets.map((t, i) => (
        <span
          key={i}
          style={{
            padding: "5px 12px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: "600",
            fontFamily: "'JetBrains Mono', monospace",
            background: `rgba(0,230,150,${0.05 + i * 0.04})`,
            color: `rgba(0,230,150,${0.6 + i * 0.15})`,
            border: `1px solid rgba(0,230,150,${0.1 + i * 0.08})`,
          }}
        >
          TP{i + 1}: {t}
        </span>
      ))}
    </div>
  </div>
);

interface ThesisBoxProps {
  thesis: string;
}

const ThesisBox = ({ thesis }: ThesisBoxProps) => (
  <div
    style={{
      background: "rgba(255,255,255,0.03)",
      borderRadius: "10px",
      padding: "14px",
      marginBottom: "14px",
      border: `1px solid ${COLORS.border.medium}`,
    }}
  >
    <div
      style={{
        fontSize: "9px",
        color: COLORS.text.muted,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "1.5px",
        marginBottom: "8px",
      }}
    >
      THESIS
    </div>
    <p
      style={{
        color: COLORS.text.secondary,
        fontSize: "13px",
        lineHeight: "1.7",
        margin: 0,
        fontFamily: "'Instrument Serif', serif",
      }}
    >
      {thesis}
    </p>
  </div>
);

interface RisksDisplayProps {
  risks: string[];
}

const RisksDisplay = ({ risks }: RisksDisplayProps) => (
  <div>
    <div
      style={{
        fontSize: "9px",
        color: COLORS.text.muted,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "1.5px",
        marginBottom: "8px",
      }}
    >
      KEY RISKS
    </div>
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {risks.map((r, i) => (
        <span
          key={i}
          style={{
            padding: "4px 10px",
            borderRadius: "6px",
            fontSize: "11px",
            fontFamily: "'JetBrains Mono', monospace",
            background: "rgba(255,70,90,0.08)",
            color: "#FF6B7A",
            border: "1px solid rgba(255,70,90,0.15)",
          }}
        >
          ⚠ {r}
        </span>
      ))}
    </div>
  </div>
);

// ============================================================================
// MAIN TRADE CARD COMPONENT
// ============================================================================

interface TradeCardProps {
  trade: Trade;
  index: number;
}

const TradeCard = ({ trade, index }: TradeCardProps) => {
  const isLong = trade.direction === "LONG";
  const [visible, setVisible] = useState(false);

  const handleCopyTrade = useCallback(() => {
    const text = `${trade.coin} ${trade.direction} | Entry: ${trade.entry} | SL: ${trade.stopLoss} | Targets: ${trade.targets.join(", ")} | Confidence: ${trade.confidence}%`;
    navigator.clipboard.writeText(text);
  }, [trade]);

  React.useEffect(() => {
    const t = setTimeout(() => setVisible(true), index * 120);
    return () => clearTimeout(t);
  }, [index]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: "all 0.5s cubic-bezier(0.23, 1, 0.32, 1)",
        background: COLORS.bg.card,
        border: `1px solid ${
          isLong ? "rgba(0,230,150,0.25)" : "rgba(255,70,90,0.25)"
        }`,
        borderRadius: "16px",
        padding: "24px",
        marginBottom: "16px",
        backdropFilter: "blur(12px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Glow accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: isLong
            ? "linear-gradient(90deg, transparent, #00E696, transparent)"
            : "linear-gradient(90deg, transparent, #FF465A, transparent)",
        }}
      />

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "18px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                fontSize: "26px",
                fontWeight: "800",
                color: COLORS.text.primary,
                fontFamily: "'Syne', sans-serif",
                letterSpacing: "-1px",
              }}
            >
              {trade.coin}
            </span>
            <span
              style={{
                fontSize: "13px",
                color: "#666",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {trade.fullName}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <span style={createBadgeStyle(isLong)}>{trade.direction}</span>
            <span style={createNeutralBadgeStyle()}>{trade.timeframe}</span>
            <span style={createNeutralBadgeStyle()}>{trade.setup}</span>
          </div>
        </div>
        <ConfidenceDisplay confidence={trade.confidence} />
      </div>

      {/* Levels */}
      <LevelGrid
        entry={trade.entry}
        stopLoss={trade.stopLoss}
        riskReward={trade.riskReward}
      />

      {/* Targets */}
      <TradeTargets targets={trade.targets} />

      {/* Thesis */}
      <ThesisBox thesis={trade.thesis} />

      {/* Risks */}
      <RisksDisplay risks={trade.keyRisks} />

      {/* Copy button */}
      <button
        onClick={handleCopyTrade}
        aria-label="Copy trade details"
        style={{
          marginTop: "12px",
          width: "100%",
          padding: "8px 12px",
          background: "rgba(0,230,150,0.08)",
          border: `1px solid ${COLORS.border.light}`,
          borderRadius: "8px",
          color: COLORS.primary,
          fontSize: "11px",
          fontFamily: "'JetBrains Mono', monospace",
          cursor: "pointer",
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(0,230,150,0.15)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(0,230,150,0.08)";
        }}
      >
        📋 Copy Trade
      </button>
    </div>
  );
};

const MemoizedTradeCard = React.memo(TradeCard);

// ============================================================================
// LOADING & ERROR COMPONENTS
// ============================================================================

const LoadingIndicator = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "14px",
      background: "rgba(0,230,150,0.05)",
      border: `1px solid rgba(0,230,150,0.15)`,
      borderRadius: "14px",
      padding: "20px 24px",
      marginBottom: "16px",
    }}
  >
    <div style={{ display: "flex", gap: "5px" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: COLORS.primary,
            animation: `pulse 1.2s ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
    <span style={{ color: COLORS.primary, fontSize: "13px" }}>
      Scanning market structure...
    </span>
  </div>
);

interface ErrorMessageProps {
  message: string;
}

const ErrorMessage = ({ message }: ErrorMessageProps) => (
  <div
    style={{
      background: "rgba(255,70,90,0.08)",
      border: `1px solid rgba(255,70,90,0.2)`,
      borderRadius: "12px",
      padding: "14px 18px",
      color: "#FF6B7A",
      fontSize: "13px",
      marginBottom: "16px",
    }}
    role="alert"
  >
    ⚠ {message}
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CryptoTradeAgent() {
  const [input, setInput] = useState("");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [retryCount, setRetryCount] = useState(0);

  const generateIdeas = useCallback(async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    setError("");
    setRetryCount(0);

    const userMsg: Message = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");

    const attemptFetch = async (attempt = 0) => {
      try {
        // Call backend API instead of direct Anthropic API
        const response = await fetch("/api/generate-trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: newMessages }),
        });

        if (!response.ok) {
          const errorData = (await response.json()) as { error?: string };
          throw new Error(
            errorData.error || `API Error: ${response.status} ${response.statusText}`
          );
        }

        const data = (await response.json()) as { content?: { text?: string }[] };
        const raw =
          data.content?.map((b) => b.text || "").join("") || "";

        if (!raw) {
          throw new Error("Empty response from API");
        }

        // Parse JSON
        let parsed: unknown;
        try {
          const clean = raw.replace(/```json|```/g, "").trim();
          parsed = JSON.parse(clean);
        } catch {
          throw new Error("Couldn't parse trade idea. Try rephrasing.");
        }

        // Validate trades
        const rawTrades = Array.isArray(parsed) ? parsed : [parsed];
        const validTrades = rawTrades.filter(validateTrade);

        if (validTrades.length === 0) {
          throw new Error("No valid trades generated. Please try again.");
        }

        setTrades((prev) => [...validTrades, ...prev]);
        setMessages((prev) => [...prev, { role: "assistant", content: raw }]);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Something went wrong";

        // Retry logic for network errors
        if (attempt < 2 && errorMessage.includes("fetch")) {
          setTimeout(() => attemptFetch(attempt + 1), 1000 * (attempt + 1));
        } else {
          setError(errorMessage);
        }
      } finally {
        setLoading(false);
      }
    };

    await attemptFetch();
  }, [input, loading, messages]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        generateIdeas();
      }
    },
    [generateIdeas]
  );

  const clearTrades = useCallback(() => {
    setTrades([]);
    setMessages([]);
    setError("");
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg.dark,
        fontFamily: "'JetBrains Mono', monospace",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background grid */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage: `
            linear-gradient(rgba(0,230,150,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,230,150,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Radial glow */}
      <div
        style={{
          position: "fixed",
          top: "-20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "600px",
          height: "400px",
          zIndex: 0,
          background:
            "radial-gradient(ellipse, rgba(0,230,150,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "720px",
          margin: "0 auto",
          padding: "40px 20px 120px",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(0,230,150,0.08)",
              border: `1px solid rgba(0,230,150,0.2)`,
              borderRadius: "20px",
              padding: "5px 14px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: COLORS.primary,
                boxShadow: `0 0 8px ${COLORS.primary}`,
              }}
            />
            <span
              style={{
                fontSize: "11px",
                color: COLORS.primary,
                letterSpacing: "2px",
              }}
            >
              LIVE AGENT
            </span>
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "42px",
              fontWeight: "800",
              color: COLORS.text.primary,
              fontFamily: "'Syne', sans-serif",
              letterSpacing: "-2px",
              lineHeight: 1,
            }}
          >
            Crypto<span style={{ color: COLORS.primary }}>Edge</span>
          </h1>
          <p
            style={{
              color: COLORS.text.muted,
              fontSize: "13px",
              marginTop: "10px",
              letterSpacing: "0.5px",
            }}
          >
            AI-powered trade idea generation · Always DYOR · Not financial
            advice
          </p>
        </div>

        {/* Empty state */}
        {trades.length === 0 && !loading && (
          <div style={{ marginBottom: "32px" }}>
            <p
              style={{
                color: COLORS.text.muted,
                fontSize: "11px",
                letterSpacing: "1.5px",
                marginBottom: "12px",
                textAlign: "center",
              }}
            >
              TRY ASKING
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                justifyContent: "center",
              }}
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  style={{
                    background: COLORS.bg.input,
                    border: `1px solid ${COLORS.border.subtle}`,
                    borderRadius: "20px",
                    padding: "7px 14px",
                    color: "#6B7280",
                    fontSize: "12px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor =
                      "rgba(0,230,150,0.3)";
                    e.currentTarget.style.color = COLORS.primary;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = COLORS.border.subtle;
                    e.currentTarget.style.color = "#6B7280";
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Trade cards */}
        <div>
          {trades.map((trade, i) => (
            <MemoizedTradeCard key={`${trade.coin}-${i}`} trade={trade} index={i} />
          ))}
        </div>

        {/* Loading */}
        {loading && <LoadingIndicator />}

        {/* Error */}
        {error && <ErrorMessage message={error} />}

        {/* Clear button */}
        {trades.length > 0 && (
          <button
            onClick={clearTrades}
            aria-label="Clear all trades"
            style={{
              marginTop: "24px",
              width: "100%",
              padding: "12px",
              background: "rgba(255,70,90,0.08)",
              border: `1px solid rgba(255,70,90,0.15)`,
              borderRadius: "12px",
              color: "#FF6B7A",
              fontSize: "12px",
              fontFamily: "'JetBrains Mono', monospace",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,70,90,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,70,90,0.08)";
            }}
          >
            🗑️ Clear All Trades
          </button>
        )}
      </div>

      {/* Fixed input bar */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          background: "rgba(8,10,16,0.95)",
          borderTop: `1px solid ${COLORS.border.light}`,
          backdropFilter: "blur(20px)",
          padding: "16px 20px",
        }}
      >
        <div
          style={{
            maxWidth: "720px",
            margin: "0 auto",
            display: "flex",
            gap: "10px",
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Describe a coin or market setup... (e.g. 'BTC showing strength on 4H')"
            aria-label="Trade input"
            style={{
              flex: 1,
              background: COLORS.bg.input,
              border: `1px solid ${COLORS.border.light}`,
              borderRadius: "12px",
              padding: "14px 18px",
              color: COLORS.text.primary,
              fontSize: "13px",
              outline: "none",
              fontFamily: "'JetBrains Mono', monospace",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(0,230,150,0.4)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = COLORS.border.light;
            }}
          />
          <button
            onClick={generateIdeas}
            disabled={!input.trim() || loading}
            aria-label="Generate trade ideas"
            style={{
              background:
                input.trim() && !loading
                  ? COLORS.primary
                  : "rgba(0,230,150,0.2)",
              color: input.trim() && !loading ? COLORS.bg.dark : "#2A4A3A",
              border: "none",
              borderRadius: "12px",
              padding: "14px 22px",
              fontSize: "13px",
              fontWeight: "700",
              cursor: input.trim() && !loading ? "pointer" : "not-allowed",
              fontFamily: "'JetBrains Mono', monospace",
              transition: "all 0.2s",
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
