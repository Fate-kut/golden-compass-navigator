// MOCK: replace with real broker integration once licensed.
// A self-contained simulated broker implementing the same surface that
// market.server.ts exposes (getQuote / placeOrder). It produces plausible
// prices with a random walk, delayed fills, and occasional realistic failures
// so the UI's error handling can be exercised end to end.
//
// NOTHING here touches a real market, real money, or a real order book.
import { getMockBrokerSettings } from "@/lib/config.server";

export interface MockQuote {
  symbol: string;
  price: number;
  change_pct: number;
  currency: "KES" | "USD";
  source: "NSE" | "GLOBAL";
  sandbox: boolean;
  simulated: true;
  /** True when the simulated price was anchored to a real live quote. */
  anchored?: boolean;
}


const AFRICAN = new Set(["NSE", "NGX", "JSE", "GSE"]);

/** Stable pseudo-random base price per symbol so quotes are consistent across calls. */
function seedFor(symbol: string): number {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 100000) / 100000;
}

// MOCK: in-memory last price per symbol. Resets on worker restart — fine for a PoC.
const lastPrice = new Map<string, number>();

/**
 * Simulated quote.
 *
 * When `anchor` (a real live price) is supplied the simulator walks around that
 * real price instead of a fabricated base, so sandbox mode still reflects true
 * market action — the OpenAlgo sandbox pattern.
 */
export async function mockGetQuote(
  symbol: string,
  exchange: string,
  anchor?: number,
): Promise<MockQuote> {
  const sym = symbol.toUpperCase();
  const african = AFRICAN.has(exchange.toUpperCase());
  const seed = seedFor(sym);
  const anchored = typeof anchor === "number" && Number.isFinite(anchor) && anchor > 0;
  const base = anchored ? anchor! : african ? 5 + seed * 495 : 20 + seed * 480;
  const { volatility_pct } = await getMockBrokerSettings();

  const prev = anchored ? anchor! : (lastPrice.get(sym) ?? base);
  const drift = (Math.random() - 0.5) * 2 * (volatility_pct / 100) * prev;
  const price = Math.max(0.5, Number((prev + drift).toFixed(2)));
  lastPrice.set(sym, price);

  return {
    symbol: sym,
    price,
    change_pct: Number((((price - base) / base) * 100).toFixed(2)),
    currency: african ? "KES" : "USD",
    source: african ? "NSE" : "GLOBAL",
    sandbox: true,
    simulated: true,
    anchored,
  };
}

/**
 * Stale/bad-tick guard (OpenAlgo `quote_looks_stale`). Rejects prices that are
 * non-finite, non-positive, outside the session high/low, or that jump
 * implausibly far from the last observed price for the symbol.
 */
export function quoteLooksStale(
  symbol: string,
  price: number,
  bounds?: { high?: number; low?: number },
): string | null {
  if (!Number.isFinite(price) || price <= 0) return "provider returned a non-positive price";
  if (bounds?.high && bounds?.low && (price > bounds.high * 1.001 || price < bounds.low * 0.999)) {
    return "price falls outside the session high/low range";
  }
  const prev = lastPrice.get(symbol.toUpperCase());
  if (prev && (price > prev * 1.5 || price < prev * 0.5)) {
    return "price moved implausibly far from the previous tick";
  }
  return null;
}


export interface MockOrderInput {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  accountId: string;
  exchange: string;
}

export interface MockOrderResult {
  id: string;
  status: "filled" | "pending";
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  simulated: true;
}

/** MOCK: replace with real broker integration once licensed. */
export async function mockPlaceOrder(input: MockOrderInput): Promise<MockOrderResult> {
  const { fill_delay_ms, failure_rate } = await getMockBrokerSettings();

  // Simulated latency before the "exchange" responds.
  await new Promise((r) => setTimeout(r, Math.min(3000, Math.max(0, fill_delay_ms))));

  if (Math.random() < failure_rate) {
    // MOCK: rotate through realistic broker rejection reasons.
    const reasons = [
      "SIMULATED: insufficient settled funds at broker",
      "SIMULATED: market closed for this exchange",
      "SIMULATED: symbol suspended from trading",
      "SIMULATED: order rejected by risk engine",
    ];
    throw new Error(reasons[Math.floor(Math.random() * reasons.length)]);
  }

  // ~15% of accepted orders sit as pending to exercise the pending UI state.
  const status: "filled" | "pending" = Math.random() < 0.15 ? "pending" : "filled";

  return {
    id: `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    status,
    symbol: input.symbol.toUpperCase(),
    side: input.side,
    quantity: input.quantity,
    simulated: true,
  };
}
