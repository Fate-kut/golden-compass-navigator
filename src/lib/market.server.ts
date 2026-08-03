// Market data + order execution service — the ONLY module that talks to a
// market/broker provider. Every call site (trade.tsx via /api/quote and
// /api/trade, portfolio.tsx, MCP tools) must go through getQuote/placeOrder here.
//
// Provider routing:
//   BROKER_MODE = 'mock' (config row `app_config.broker_mode`) -> MockBrokerProvider
//   BROKER_MODE = 'live'                                       -> mystocks.africa (African) / Finnhub (global)
//
// MOCK: replace with real broker integration once licensed. We currently run in
// 'mock' by default because we have neither broker API access nor a CMA licence.
import { getBrokerMode } from "@/lib/config.server";
import { mockGetQuote, mockPlaceOrder } from "@/lib/broker/mock-provider.server";

const AFRICAN_EXCHANGES = ["NSE", "NGX", "JSE", "GSE"] as const;
type AfricanExchange = (typeof AFRICAN_EXCHANGES)[number];

export interface NormalizedQuote {
  symbol: string;
  price: number;
  change_pct: number;
  currency: "KES" | "USD";
  source: "NSE" | "GLOBAL";
  sandbox: boolean;
  /** True when the quote came from the simulated broker rather than a live feed. */
  simulated: boolean;
}

function isAfrican(exchange: string): exchange is AfricanExchange {
  return (AFRICAN_EXCHANGES as readonly string[]).includes(exchange);
}

export async function getQuote(symbol: string, exchange: string): Promise<NormalizedQuote> {
  if ((await getBrokerMode()) === "mock") {
    // MOCK: replace with real broker integration once licensed.
    return mockGetQuote(symbol, exchange);
  }
  if (isAfrican(exchange)) return getMyStocksQuote(symbol);
  return getFinnhubQuote(symbol);
}

async function getMyStocksQuote(symbol: string): Promise<NormalizedQuote> {
  const key = process.env.MYSTOCKS_API_KEY;
  if (!key) throw new Error("MYSTOCKS_API_KEY not configured");
  const res = await fetch(`https://api.mystocks.africa/v1/quotes/${encodeURIComponent(symbol)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`mystocks ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { price: number; change_pct: number };
  return {
    symbol,
    price: Number(data.price),
    change_pct: Number(data.change_pct),
    currency: "KES",
    source: "NSE",
    sandbox: key.startsWith("sk_sandbox_"),
    simulated: false,
  };
}

async function getFinnhubQuote(symbol: string): Promise<NormalizedQuote> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("FINNHUB_API_KEY not configured");
  const res = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`,
  );
  if (!res.ok) throw new Error(`finnhub ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { c: number; pc: number };
  const changePct = data.pc ? ((data.c - data.pc) / data.pc) * 100 : 0;
  return {
    symbol,
    price: Number(data.c),
    change_pct: Number(changePct.toFixed(2)),
    currency: "USD",
    source: "GLOBAL",
    sandbox: false,
    simulated: false,
  };
}

export interface PlaceOrderInput {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  accountId: string;
  exchange?: string;
}

export interface PlacedOrder {
  id?: string;
  order_id?: string;
  status?: string;
  simulated?: boolean;
  [k: string]: unknown;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  if ((await getBrokerMode()) === "mock") {
    // MOCK: replace with real broker integration once licensed.
    return mockPlaceOrder({ ...input, exchange: input.exchange ?? "NSE" });
  }

  const key = process.env.MYSTOCKS_API_KEY;
  if (!key) throw new Error("MYSTOCKS_API_KEY not configured");
  const res = await fetch("https://api.mystocks.africa/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      symbol: input.symbol,
      side: input.side,
      quantity: input.quantity,
      account_id: input.accountId,
    }),
  });
  const data = (await res.json()) as PlacedOrder;
  if (!res.ok) throw new Error(`mystocks order ${res.status}: ${JSON.stringify(data)}`);
  return { ...data, simulated: false };
}

/** Exposed so the UI can label simulated surfaces. */
export async function isSimulatedTrading(): Promise<boolean> {
  return (await getBrokerMode()) === "mock";
}
