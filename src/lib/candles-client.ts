// Client-side candle fetching with an in-memory cache so switching timeframes
// (or revisiting a symbol) renders instantly and revalidates in the background.
import { useCallback, useEffect, useState } from "react";

export interface ClientBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type CandleRange = "1D" | "1W" | "1M" | "3M" | "1Y";
export const CANDLE_RANGES: CandleRange[] = ["1D", "1W", "1M", "3M", "1Y"];

export interface CandlesPayload {
  symbol: string;
  exchange: string;
  currency: string;
  range: CandleRange;
  bars: ClientBar[];
  simulated: boolean;
  unavailable_reason?: string;
  info?: unknown;
}

interface Entry {
  data: CandlesPayload;
  at: number;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<CandlesPayload>>();

const ttl = (range: CandleRange) => (range === "1D" || range === "1W" ? 30_000 : 300_000);
const keyOf = (s: string, e: string, r: CandleRange, info: boolean) =>
  `${s.toUpperCase()}|${e}|${r}|${info ? 1 : 0}`;

/** Cached payload for a key, if any — used for optimistic first paint. */
export function peekCandles(
  symbol: string,
  exchange: string,
  range: CandleRange,
  withInfo = false,
): CandlesPayload | null {
  return cache.get(keyOf(symbol, exchange, range, withInfo))?.data ?? null;
}

export async function fetchCandles(
  symbol: string,
  exchange: string,
  range: CandleRange,
  withInfo = false,
): Promise<CandlesPayload> {
  const k = keyOf(symbol, exchange, range, withInfo);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < ttl(range)) return hit.data;

  const existing = inflight.get(k);
  if (existing) return existing;

  const req = (async () => {
    const res = await fetch(
      `/api/candles?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}` +
        `&range=${range}${withInfo ? "&info=1" : ""}`,
    );
    const data = await res.json();
    if (!res.ok || data?.error) throw new Error(data?.error ?? "Could not load chart");
    cache.set(k, { data: data as CandlesPayload, at: Date.now() });
    return data as CandlesPayload;
  })().finally(() => inflight.delete(k));

  inflight.set(k, req);
  return req;
}

/**
 * Candles for a symbol/range. Renders cached data immediately (optimistic) and
 * only shows the skeleton when there is nothing cached to paint.
 */
export function useCandles(
  symbol: string,
  exchange: string,
  range: CandleRange,
  withInfo = false,
) {
  const [data, setData] = useState<CandlesPayload | null>(() =>
    peekCandles(symbol, exchange, range, withInfo),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!data);

  const load = useCallback(
    async (signalActive: () => boolean) => {
      const cached = peekCandles(symbol, exchange, range, withInfo);
      if (cached) {
        setData(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      try {
        const fresh = await fetchCandles(symbol, exchange, range, withInfo);
        if (!signalActive()) return;
        setData(fresh);
        setError(null);
      } catch (e) {
        if (!signalActive()) return;
        if (!cached) setData(null);
        setError(e instanceof Error ? e.message : "Could not load chart");
      } finally {
        if (signalActive()) setLoading(false);
      }
    },
    [symbol, exchange, range, withInfo],
  );

  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);

  /** Warm neighbouring timeframes so pill taps are instant. */
  useEffect(() => {
    const others = CANDLE_RANGES.filter((r) => r !== range);
    const id = setTimeout(() => {
      others.forEach((r) => void fetchCandles(symbol, exchange, r).catch(() => undefined));
    }, 600);
    return () => clearTimeout(id);
  }, [symbol, exchange, range]);

  return { data, bars: data?.bars ?? [], loading, error };
}
