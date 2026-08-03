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

export async function mockGetQuote(symbol: string, exchange: string): Promise<MockQuote> {
  const sym = symbol.toUpperCase();
  const african = AFRICAN.has(exchange.toUpperCase());
  const seed = seedFor(sym);
  const base = african ? 5 + seed * 495 : 20 + seed * 480; // KES 5–500 / USD 20–500
  const { volatility_pct } = await getMockBrokerSettings();

  const prev = lastPrice.get(sym) ?? base;
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
  };
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
