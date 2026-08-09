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

/* ────────────────────────────────────────────────────────────────────────────
   Historical OHLC bars
   ──────────────────────────────────────────────────────────────────────────── */

export type BarRange = "1D" | "1W" | "1M" | "3M" | "1Y";

export interface Bar {
  /** Unix seconds, start of the bar. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface BarsResult {
  symbol: string;
  exchange: string;
  currency: "KES" | "USD";
  range: BarRange;
  bars: Bar[];
  /** Always false — no synthesized candles are ever returned. */
  simulated: boolean;
  /** Set when the provider could not supply this range; UI shows an empty state. */
  unavailable_reason?: string;
}

/** Finnhub resolution + lookback window per range. */
const RANGE_SPEC: Record<BarRange, { resolution: string; seconds: number }> = {
  "1D": { resolution: "5", seconds: 2 * 86_400 },
  "1W": { resolution: "30", seconds: 8 * 86_400 },
  "1M": { resolution: "D", seconds: 35 * 86_400 },
  "3M": { resolution: "D", seconds: 100 * 86_400 },
  "1Y": { resolution: "D", seconds: 375 * 86_400 },
};

async function getFinnhubBars(symbol: string, range: BarRange): Promise<Bar[]> {
  const key = requireKey("FINNHUB_API_KEY", "src/lib/market.server.ts → getFinnhubBars()");
  const spec = RANGE_SPEC[range];
  const to = Math.floor(Date.now() / 1000);
  const from = to - spec.seconds;
  const url =
    `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}` +
    `&resolution=${spec.resolution}&from=${from}&to=${to}&token=${key}`;

  console.info(`[market] finnhub GET ${redact(url)}`);
  const res = await fetch(url);
  console.info(`[market] finnhub GET ${redact(url)} -> ${res.status}`);
  if (!res.ok) throw new Error(`finnhub candles ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    s?: string;
    t?: number[];
    o?: number[];
    h?: number[];
    l?: number[];
    c?: number[];
    v?: number[];
  };
  if (data.s !== "ok" || !data.t?.length) throw new Error("finnhub returned no candle data");
  return data.t.map((t, i) => ({
    t,
    o: Number(data.o![i]),
    h: Number(data.h![i]),
    l: Number(data.l![i]),
    c: Number(data.c![i]),
    v: Number(data.v?.[i] ?? 0),
  }));
}

/** mystocks.africa historical series, when the partner API exposes it. */
async function getMyStocksBars(
  symbol: string,
  exchange: AfricanExchange,
  range: BarRange,
): Promise<Bar[]> {
  const key = requireKey("MYSTOCKS_API_KEY", "src/lib/market.server.ts → getMyStocksBars()");
  const base = myStocksBase(key);
  const ticker = withExchangeSuffix(symbol, exchange);
  const url = `${base}/history/${encodeURIComponent(ticker)}?range=${range}`;

  console.info(`[market] mystocks GET ${redact(url)}`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  console.info(`[market] mystocks GET ${redact(url)} -> ${res.status}`);
  if (!res.ok) throw new Error(`mystocks history ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as
    | { bars?: unknown[]; data?: unknown[] }
    | unknown[];
  const rows = (Array.isArray(data) ? data : (data.bars ?? data.data ?? [])) as Array<
    Record<string, unknown>
  >;
  const bars = rows
    .map((r) => {
      const rawT = r['t'] ?? r['time'] ?? r['date'] ?? r['timestamp'];
      const t =
        typeof rawT === "number"
          ? rawT > 1e11
            ? Math.floor(rawT / 1000)
            : rawT
          : Math.floor(new Date(String(rawT)).getTime() / 1000);
      return {
        t,
        o: Number(r['o'] ?? r['open']),
        h: Number(r['h'] ?? r['high']),
        l: Number(r['l'] ?? r['low']),
        c: Number(r['c'] ?? r['close']),
        v: Number(r['v'] ?? r['volume'] ?? 0),
      };
    })
    .filter((b) => Number.isFinite(b.t) && Number.isFinite(b.c))
    .sort((a, b) => a.t - b.t);

  if (bars.length === 0) throw new Error("mystocks returned no historical bars");
  return bars;
}

/**
 * Real OHLC bars only: Finnhub for global symbols, mystocks.africa for African
 * exchanges. When a provider cannot serve the requested range the result is an
 * empty series with `unavailable_reason` — never synthesized candles.
 */
export async function getHistoricalBars(
  symbol: string,
  exchange: string,
  range: BarRange = "3M",
): Promise<BarsResult> {
  const ex = exchange.toUpperCase();
  const african = isAfrican(ex);
  const base: Omit<BarsResult, "bars" | "simulated"> = {
    symbol: african ? withExchangeSuffix(symbol, ex) : symbol.toUpperCase(),
    exchange: ex,
    currency: african ? "KES" : "USD",
    range,
  };

  try {
    const bars = african
      ? await getMyStocksBars(symbol, ex, range)
      : await getFinnhubBars(symbol, range);
    return { ...base, bars, simulated: false };
  } catch (e) {
    const reason =
      e instanceof MissingProviderKeyError
        ? african
          ? "NSE market data is not configured yet."
          : "Global market data is not configured yet."
        : `No ${range} price history available for this symbol right now.`;
    console.warn(
      `[market] historical bars unavailable (${ex} ${symbol} ${range}): ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return { ...base, bars: [], simulated: false, unavailable_reason: reason };
  }
}


/* ────────────────────────────────────────────────────────────────────────────
   Company profile + key metrics
   ──────────────────────────────────────────────────────────────────────────── */

export interface CompanyInfo {
  symbol: string;
  available: boolean;
  /** Set when `available` is false, explaining the coverage gap. */
  unavailable_reason?: string;
  name?: string;
  country?: string;
  industry?: string;
  exchange_name?: string;
  currency?: string;
  logo?: string;
  weburl?: string;
  market_cap?: number;
  metrics?: {
    week52_high?: number;
    week52_low?: number;
    pe_ratio?: number;
    dividend_yield?: number;
    beta?: number;
  };
}

/** Finnhub profile2 + metric. Only covers GLOBAL symbols today. */
export async function getCompanyInfo(symbol: string, exchange: string): Promise<CompanyInfo> {
  const sym = symbol.trim().toUpperCase();
  if (isAfrican(exchange)) {
    return {
      symbol: sym,
      available: false,
      unavailable_reason: `Company fundamentals are not available for ${exchange.toUpperCase()} yet — pending mystocks.africa coverage.`,
    };
  }

  try {
    const key = requireKey("FINNHUB_API_KEY", "src/lib/market.server.ts → getCompanyInfo()");
    const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${key}`;
    const metricUrl = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(sym)}&metric=all&token=${key}`;
    console.info(`[market] finnhub GET ${redact(profileUrl)}`);

    const [pRes, mRes] = await Promise.all([fetch(profileUrl), fetch(metricUrl)]);
    console.info(`[market] finnhub profile2 -> ${pRes.status}, metric -> ${mRes.status}`);
    if (!pRes.ok) throw new Error(`finnhub profile2 ${pRes.status}`);

    const p = (await pRes.json()) as Record<string, unknown>;
    const m = mRes.ok
      ? ((await mRes.json()) as { metric?: Record<string, number> }).metric ?? {}
      : {};

    if (!p || Object.keys(p).length === 0) {
      return { symbol: sym, available: false, unavailable_reason: "No profile data returned for this symbol." };
    }

    return {
      symbol: sym,
      available: true,
      name: p['name'] as string | undefined,
      country: p['country'] as string | undefined,
      industry: p['finnhubIndustry'] as string | undefined,
      exchange_name: p['exchange'] as string | undefined,
      currency: p['currency'] as string | undefined,
      logo: p['logo'] as string | undefined,
      weburl: p['weburl'] as string | undefined,
      market_cap: p['marketCapitalization'] as number | undefined,
      metrics: {
        week52_high: m['52WeekHigh'],
        week52_low: m['52WeekLow'],
        pe_ratio: m['peBasicExclExtraTTM'],
        dividend_yield: m['dividendYieldIndicatedAnnual'],
        beta: m['beta'],
      },
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`[market] company info unavailable: ${reason}`);
    return {
      symbol: sym,
      available: false,
      unavailable_reason:
        e instanceof MissingProviderKeyError
          ? "Fundamentals need a market-data key — not configured yet."
          : "Fundamentals are temporarily unavailable for this symbol.",
    };
  }
}

