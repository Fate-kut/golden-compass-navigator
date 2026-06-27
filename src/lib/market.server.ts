// Market data service: routes African exchanges to mystocks.africa, global to Finnhub.
const AFRICAN_EXCHANGES = ["NSE", "NGX", "JSE", "GSE"] as const;
type AfricanExchange = (typeof AFRICAN_EXCHANGES)[number];

export interface NormalizedQuote {
  symbol: string;
  price: number;
  change_pct: number;
  currency: "KES" | "USD";
  source: "NSE" | "GLOBAL";
  sandbox: boolean;
}

function isAfrican(exchange: string): exchange is AfricanExchange {
  return (AFRICAN_EXCHANGES as readonly string[]).includes(exchange);
}

export async function getQuote(symbol: string, exchange: string): Promise<NormalizedQuote> {
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
  };
}

export interface PlaceOrderInput {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  accountId: string;
}

export async function placeOrder(input: PlaceOrderInput) {
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
  const data = await res.json();
  if (!res.ok) throw new Error(`mystocks order ${res.status}: ${JSON.stringify(data)}`);
  return data;
}
