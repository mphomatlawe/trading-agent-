import type { NextApiRequest, NextApiResponse } from "next";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicResponse {
  content: Array<{ text: string }>;
  error?: { message: string };
}

interface ApiResponse {
  content?: Array<{ text: string }>;
  error?: string;
}

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

const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

async function callAnthropicAPI(
  messages: Message[],
  attempt = 0
): Promise<AnthropicResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    // Handle non-OK responses
    if (!response.ok) {
      const errorData = (await response.json()) as { error?: { message: string } };

      // 429 = Rate limited, 5xx = Server error (retry-able)
      if (
        (response.status === 429 || response.status >= 500) &&
        attempt < MAX_RETRIES
      ) {
        const delay = RETRY_DELAY * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return callAnthropicAPI(messages, attempt + 1);
      }

      throw new Error(
        errorData.error?.message ||
          `Anthropic API Error: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as AnthropicResponse;

    if (data.error) {
      throw new Error(data.error.message || "Unknown API error");
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.message.includes("fetch")) {
      // Network error, retry if allowed
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return callAnthropicAPI(messages, attempt + 1);
      }
    }
    throw error;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages } = req.body as { messages?: unknown };

    // Validate input
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid messages format" });
    }

    if (messages.length === 0) {
      return res.status(400).json({ error: "Messages cannot be empty" });
    }

    // Type-check messages
    const validMessages: Message[] = messages.filter(
      (msg): msg is Message =>
        typeof msg === "object" &&
        msg !== null &&
        "role" in msg &&
        "content" in msg &&
        typeof msg.content === "string" &&
        (msg.role === "user" || msg.role === "assistant")
    );

    if (validMessages.length === 0) {
      return res.status(400).json({ error: "No valid messages provided" });
    }

    // Call Anthropic API
    const response = await callAnthropicAPI(validMessages);

    return res.status(200).json(response);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";

    console.error("API Error:", errorMessage);

    // Return appropriate status code
    if (errorMessage.includes("not configured")) {
      return res.status(500).json({ error: "API key not configured" });
    }

    if (errorMessage.includes("429")) {
      return res
        .status(429)
        .json({ error: "Rate limited. Please try again later." });
    }

    if (errorMessage.includes("401")) {
      return res.status(401).json({ error: "Invalid API credentials" });
    }

    return res
      .status(500)
      .json({ error: errorMessage || "Failed to generate trades" });
  }
}
