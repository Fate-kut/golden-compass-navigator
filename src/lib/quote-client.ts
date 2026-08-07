// Small client-side helpers for hitting /api/quote without duplicating fetch
// plumbing across the search dialog, watchlist, markets dashboard and stock page.
import { useCallback, useEffect, useRef, useState } from "react";

export interface ClientQuote {
  symbol: string;
  price: number;
  change_pct: number;
  currency: "KES" | "USD";
  source: "NSE" | "GLOBAL";
  sandbox: boolean;
  simulated?: boolean;
  fallback_reason?: string;
  anchored?: boolean;
  stale_reason?: string;
}

export async function fetchQuote(symbol: string, exchange: string): Promise<ClientQuote> {
  const res = await fetch(
    `/api/quote?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}`,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Quote failed");
  return data as ClientQuote;
}

export interface QuoteState {
  quote: ClientQuote;
  /** Rolling price history built from successive polls, seeded from change_pct. */
  history: number[];
}

/** Seeds a plausible mini-series so a sparkline has shape before polls accumulate. */
function seedHistory(price: number, changePct: number, points = 12): number[] {
  const start = changePct === 0 ? price * 0.995 : price / (1 + changePct / 100);
  return Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1);
    return start + (price - start) * t + Math.sin(i * 1.7) * price * 0.0025;
  });
}

/**
 * Polls quotes for a set of symbol/exchange pairs and keeps a short rolling
 * price history per symbol for sparklines.
 */
export function useQuotes(pairs: { symbol: string; exchange: string }[], intervalMs = 30_000) {
  const [map, setMap] = useState<Record<string, QuoteState>>({});
  const [loading, setLoading] = useState(true);
  const historyRef = useRef<Record<string, number[]>>({});
  const key = pairs.map((p) => `${p.symbol}|${p.exchange}`).join(",");

  const load = useCallback(async () => {
    if (pairs.length === 0) {
      setMap({});
      setLoading(false);
      return;
    }
    const results = await Promise.all(
      pairs.map(async (p) => {
        try {
          return { p, quote: await fetchQuote(p.symbol, p.exchange) };
        } catch {
          return null;
        }
      }),
    );
    const next: Record<string, QuoteState> = {};
    for (const r of results) {
      if (!r) continue;
      const k = r.p.symbol.toUpperCase();
      const prior = historyRef.current[k] ?? seedHistory(r.quote.price, r.quote.change_pct);
      const history = [...prior, r.quote.price].slice(-24);
      historyRef.current[k] = history;
      next[k] = { quote: r.quote, history };
    }
    setMap(next);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    let active = true;
    void load();
    const id = setInterval(() => {
      if (active) void load();
    }, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [load, intervalMs]);

  return { quotes: map, loading, refresh: load };
}
