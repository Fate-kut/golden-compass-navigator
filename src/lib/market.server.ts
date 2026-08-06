// Market data + order execution service — the ONLY module that talks to a
// market/broker provider. Every call site (trade.tsx via /api/quote and
// /api/trade, portfolio.tsx, MCP tools) must go through getQuote/placeOrder here.
//
// Provider routing:
//   BROKER_MODE = 'mock' (config row `app_config.broker_mode`) -> MockBrokerProvider
//   BROKER_MODE = 'live'                                       -> mystocks.africa (African) / Finnhub (global)
//
// In 'live' mode, a missing provider API key does NOT 500 the app: that single
// call falls back to the simulated broker and the response is tagged with
// `fallback_reason` so the UI can show why.
import { getBrokerMode } from "@/lib/config.server";
import { mockGetQuote, mockPlaceOrder, quoteLooksStale } from "@/lib/broker/mock-provider.server";


const AFRICAN_EXCHANGES = ["NSE", "NGX", "JSE", "GSE"] as const;
type AfricanExchange = (typeof AFRICAN_EXCHANGES)[number];

/** Exchange -> mystocks.africa ticker suffix. */
const EXCHANGE_SUFFIX: Record<AfricanExchange, string> = {
  NSE: ".KE",
  NGX: ".NG",
  JSE: ".ZA",
  GSE: ".GH",
};

export interface NormalizedQuote {
  symbol: string;
  price: number;
  change_pct: number;
  currency: "KES" | "USD";
  source: "NSE" | "GLOBAL";
  sandbox: boolean;
  /** True when the quote came from the simulated broker rather than a live feed. */
  simulated: boolean;
  /** Set when broker_mode is 'live' but this call had to fall back to the mock. */
  fallback_reason?: string;
  /** True when a simulated price was anchored to a real live quote. */
  anchored?: boolean;
  /** Set when a live tick was rejected by the stale-quote guard. */
  stale_reason?: string;
}


/** Thrown when a live provider cannot run because its API key is not configured. */
class MissingProviderKeyError extends Error {
  constructor(envVar: string, whereRead: string) {
    super(
      `${envVar} is not configured. It is read in ${whereRead}. ` +
        `Add it in Project Settings → Secrets, or set app_config.broker_mode back to "mock".`,
    );
    this.name = "MissingProviderKeyError";
  }
}

function isAfrican(exchange: string): exchange is AfricanExchange {
  return (AFRICAN_EXCHANGES as readonly string[]).includes(exchange);
}

/** Appends the mystocks.africa exchange suffix when the symbol doesn't already carry one. */
export function withExchangeSuffix(symbol: string, exchange: AfricanExchange): string {
  const sym = symbol.trim().toUpperCase();
  const suffix = EXCHANGE_SUFFIX[exchange];
  if (/\.[A-Z]{2}$/.test(sym)) return sym;
  return `${sym}${suffix}`;
}

function isSandboxKey(key: string): boolean {
  return key.startsWith("sk_sandbox_");
}

/** mystocks.africa base URL, chosen from the key prefix (sk_sandbox_ vs pk_live_). */
function myStocksBase(key: string): string {
  return isSandboxKey(key)
    ? "https://mystocks.africa/api/sandbox/v1/partner"
    : "https://mystocks.africa/api/v1/partner";
}

/** Redacts anything key-shaped from a URL before logging. */
function redact(url: string): string {
  return url.replace(/(token|api_?key)=[^&]+/gi, "$1=REDACTED");
}

function requireKey(name: "MYSTOCKS_API_KEY" | "FINNHUB_API_KEY", whereRead: string): string {
  const key = process.env[name];
  if (!key || key.trim() === "") throw new MissingProviderKeyError(name, whereRead);
  return key;
}

/** Fetches a real live quote, or null when no provider key / provider fails. */
async function tryLiveQuote(symbol: string, exchange: string): Promise<NormalizedQuote | null> {
  try {
    return isAfrican(exchange)
      ? await getMyStocksQuote(symbol, exchange)
      : await getFinnhubQuote(symbol);
  } catch (e) {
    if (!(e instanceof MissingProviderKeyError)) {
      console.warn(`[market] live quote failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return null;
  }
}

export async function getQuote(symbol: string, exchange: string): Promise<NormalizedQuote> {
  const mode = await getBrokerMode();

  if (mode === "mock") {
    // Sandbox mode is a deliberate simulator, not a blind stub: when a live
    // provider key exists we anchor the simulated price to the real market.
    const live = await tryLiveQuote(symbol, exchange);
    return mockGetQuote(symbol, exchange, live?.price);
  }

  try {
    const q = isAfrican(exchange)
      ? await getMyStocksQuote(symbol, exchange)
      : await getFinnhubQuote(symbol);

    const stale = quoteLooksStale(q.symbol, q.price);
    if (stale) {
      console.warn(`[market] rejected live tick for ${q.symbol}: ${stale}`);
      const m = await mockGetQuote(symbol, exchange);
      return { ...m, stale_reason: stale };
    }
    return q;
  } catch (e) {
    if (e instanceof MissingProviderKeyError) {
      console.warn(`[market] live quote unavailable, falling back to mock: ${e.message}`);
      const q = await mockGetQuote(symbol, exchange);
      return { ...q, fallback_reason: e.message };
    }
    throw e;
  }
}


async function getMyStocksQuote(
  symbol: string,
  exchange: AfricanExchange,
): Promise<NormalizedQuote> {
  const key = requireKey("MYSTOCKS_API_KEY", "src/lib/market.server.ts → getMyStocksQuote()");
  const base = myStocksBase(key);
  const ticker = withExchangeSuffix(symbol, exchange);
  const url = `${base}/quote/${encodeURIComponent(ticker)}`;

  console.info(`[market] mystocks GET ${redact(url)} (base=${base}, sandbox=${isSandboxKey(key)})`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  console.info(`[market] mystocks GET ${redact(url)} -> ${res.status}`);

  if (!res.ok) throw new Error(`mystocks ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { price: number; change_pct: number };
  return {
    symbol: ticker,
    price: Number(data.price),
    change_pct: Number(data.change_pct),
    currency: "KES",
    source: "NSE",
    sandbox: isSandboxKey(key),
    simulated: false,
  };
}

async function getFinnhubQuote(symbol: string): Promise<NormalizedQuote> {
  const key = requireKey("FINNHUB_API_KEY", "src/lib/market.server.ts → getFinnhubQuote()");
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`;

  console.info(`[market] finnhub GET ${redact(url)}`);
  const res = await fetch(url);
  console.info(`[market] finnhub GET ${redact(url)} -> ${res.status}`);

  if (!res.ok) throw new Error(`finnhub ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { c: number; pc: number };
  const changePct = data.pc ? ((data.c - data.pc) / data.pc) * 100 : 0;
  return {
    symbol: symbol.toUpperCase(),
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
  fallback_reason?: string;
  [k: string]: unknown;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  const exchange = input.exchange ?? "NSE";
  if ((await getBrokerMode()) === "mock") {
    return (await mockPlaceOrder({ ...input, exchange })) as unknown as PlacedOrder;
  }

  try {
    const key = requireKey("MYSTOCKS_API_KEY", "src/lib/market.server.ts → placeOrder()");
    const base = myStocksBase(key);
    const url = `${base}/trade`;
    const ticker = isAfrican(exchange)
      ? withExchangeSuffix(input.symbol, exchange)
      : input.symbol.trim().toUpperCase();

    console.info(`[market] mystocks POST ${url} (sandbox=${isSandboxKey(key)}, symbol=${ticker})`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: ticker,
        type: input.side.toUpperCase(),
        quantity: input.quantity,
      }),
    });
    console.info(`[market] mystocks POST ${url} -> ${res.status}`);

    const data = (await res.json()) as PlacedOrder;
    if (!res.ok) throw new Error(`mystocks trade ${res.status}: ${JSON.stringify(data)}`);
    return { ...data, simulated: false };
  } catch (e) {
    if (e instanceof MissingProviderKeyError) {
      console.warn(`[market] live order unavailable, falling back to mock: ${e.message}`);
      const order = (await mockPlaceOrder({ ...input, exchange })) as unknown as PlacedOrder;
      return { ...order, fallback_reason: e.message };
    }
    throw e;
  }
}

/** Exposed so the UI can label simulated surfaces. */
export async function isSimulatedTrading(): Promise<boolean> {
  return (await getBrokerMode()) === "mock";
}
