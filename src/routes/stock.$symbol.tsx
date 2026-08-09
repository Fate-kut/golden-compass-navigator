import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useWatchlist } from "@/components/Watchlist";
import { CandlestickChart } from "@/components/CandlestickChart";
import { useCandles, type CandleRange } from "@/lib/candles-client";
import { fetchQuote, type ClientQuote } from "@/lib/quote-client";
import { lookupSymbol } from "@/lib/symbols";

interface CompanyInfo {
  available: boolean;
  unavailable_reason?: string;
  name?: string;
  country?: string;
  industry?: string;
  exchange_name?: string;
  market_cap?: number;
  weburl?: string;
  metrics?: {
    week52_high?: number;
    week52_low?: number;
    pe_ratio?: number;
    dividend_yield?: number;
    beta?: number;
  };
}


export const Route = createFileRoute("/stock/$symbol")({
  validateSearch: (search: Record<string, unknown>) => ({
    exchange: typeof search['exchange'] === "string" ? search['exchange'] : undefined,
  }),
  head: ({ params }) => {
    const sym = params.symbol.toUpperCase();
    const entry = lookupSymbol(sym);
    const title = `${sym}${entry ? ` · ${entry.name}` : ""} — Golden Compass`;
    const description = `Live price, candlestick chart and key stats for ${entry?.name ?? sym} on Golden Compass.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: StockDetail,
});

function StockDetail() {
  const { symbol } = Route.useParams();
  const { exchange: exchangeParam } = Route.useSearch();
  const { user, loading: authLoading } = useAuth();
  const sym = symbol.toUpperCase();
  const exchange = exchangeParam ?? lookupSymbol(sym)?.exchange ?? "GLOBAL";

  const { items: watchlist, add, remove } = useWatchlist(user?.id);
  const [quote, setQuote] = useState<ClientQuote | null>(null);
  const [range, setRange] = useState<Range>("3M");
  const [data, setData] = useState<CandlesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchQuote(sym, exchange)
      .then((q) => active && setQuote(q))
      .catch(() => active && toast.error("Could not load quote"));
    return () => {
      active = false;
    };
  }, [sym, exchange]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/candles?symbol=${encodeURIComponent(sym)}&exchange=${exchange}&range=${range}&info=1`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d?.error) throw new Error(d.error);
        setData(d as CandlesResponse);
      })
      .catch(() => active && toast.error("Could not load chart"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [sym, exchange, range]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" />;

  const watched = watchlist.find((w) => w.symbol.toUpperCase() === sym && w.exchange === exchange);
  const bars = data?.bars ?? [];
  const dayHigh = bars.length ? Math.max(...bars.slice(-1).map((b) => b.h)) : null;
  const dayLow = bars.length ? Math.min(...bars.slice(-1).map((b) => b.l)) : null;
  const volume = bars.length ? bars[bars.length - 1].v : null;
  const seriesHigh = bars.length ? Math.max(...bars.map((b) => b.h)) : null;
  const seriesLow = bars.length ? Math.min(...bars.map((b) => b.l)) : null;
  const info = data?.info;
  const cur = quote?.currency ?? data?.currency ?? "";
  const fmt = (v?: number | null) =>
    v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const card: React.CSSProperties = {
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(201,168,76,0.22)",
    background: "rgba(255,255,255,0.04)",
  };

  return (
    <div className="flex flex-col" style={{ minHeight: "100%" }}>
      <header style={{ padding: "20px 20px 10px" }}>
        <Link to="/trade" className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.12em" }}>
          ← BACK TO TRADE
        </Link>
        <div className="flex items-start justify-between" style={{ marginTop: 10 }}>
          <div>
            <h1 className="t-display t-gold" style={{ fontSize: 22 }}>{sym}</h1>
            <p className="t-serif t-muted" style={{ fontSize: 12 }}>
              {info?.name ?? lookupSymbol(sym)?.name ?? "—"}
            </p>
            <span className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.12em" }}>
              {exchange}
            </span>
          </div>
          <button
            onClick={() => (watched ? remove(watched.id) : add(sym, exchange))}
            aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
            className="t-gold"
            style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", opacity: watched ? 1 : 0.5 }}
          >
            {watched ? "★" : "☆"}
          </button>
        </div>

        {quote && (
          <div className="flex items-baseline gap-3" style={{ marginTop: 8 }}>
            <span className="t-serif t-parch" style={{ fontSize: 28 }}>
              {quote.currency} {fmt(quote.price)}
            </span>
            <span
              className="t-mono"
              style={{ fontSize: 13, color: quote.change_pct >= 0 ? "rgb(120,200,140)" : "rgb(220,120,120)" }}
            >
              {quote.change_pct >= 0 ? "+" : ""}
              {quote.change_pct.toFixed(2)}%
            </span>
            <span
              className="t-mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.12em",
                padding: "3px 7px",
                borderRadius: 999,
                border: `1px solid ${quote.simulated ? "rgba(220,170,90,0.45)" : "rgba(120,200,140,0.45)"}`,
                background: quote.simulated ? "rgba(220,170,90,0.12)" : "rgba(120,200,140,0.12)",
                color: quote.simulated ? "rgb(235,200,130)" : "rgb(150,220,170)",
              }}
            >
              {quote.simulated ? "SIMULATED" : "LIVE"}
            </span>
          </div>
        )}
      </header>

      <div className="flex flex-col gap-3" style={{ padding: "6px 16px 24px" }}>
        <div style={card}>
          <div className="flex gap-2" style={{ marginBottom: 10 }}>
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className="t-mono"
                style={{
                  flex: 1,
                  padding: "6px 0",
                  borderRadius: 999,
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  cursor: "pointer",
                  border: `1px solid ${r === range ? "rgba(201,168,76,0.5)" : "rgba(201,168,76,0.18)"}`,
                  background: r === range ? "rgba(201,168,76,0.14)" : "transparent",
                  color: r === range ? "rgb(235,215,165)" : "rgba(200,175,130,0.6)",
                }}
              >
                {r}
              </button>
            ))}
          </div>
          {loading ? <div className="skeleton w-full rounded-2xl" style={{ height: 240 }} /> : (
            <CandleChart candles={bars} currency={cur} />
          )}
          {data?.simulated && (
            <p className="t-mono" style={{ marginTop: 8, fontSize: 9, color: "rgb(235,200,130)" }}>
              Simulated price history{data.fallback_reason ? ` — ${data.fallback_reason}` : ""}.
            </p>
          )}
        </div>

        <div style={card}>
          <p className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.18em", marginBottom: 10 }}>
            TECHNICALS
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Day range" value={`${fmt(dayLow)} – ${fmt(dayHigh)}`} />
            <Stat label={`${range} range`} value={`${fmt(seriesLow)} – ${fmt(seriesHigh)}`} />
            <Stat
              label="52w range"
              value={
                info?.metrics?.week52_low != null
                  ? `${fmt(info.metrics.week52_low)} – ${fmt(info.metrics.week52_high)}`
                  : "Not available"
              }
            />
            <Stat label="Volume" value={volume != null ? volume.toLocaleString() : "—"} />
          </div>
        </div>

        <div style={card}>
          <p className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.18em", marginBottom: 10 }}>
            COMPANY PROFILE
          </p>
          {info?.available ? (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Industry" value={info.industry ?? "—"} />
              <Stat label="Country" value={info.country ?? "—"} />
              <Stat label="Listed on" value={info.exchange_name ?? exchange} />
              <Stat
                label="Market cap"
                value={info.market_cap != null ? `${fmt(info.market_cap)}M` : "—"}
              />
              <Stat label="P/E (TTM)" value={fmt(info.metrics?.pe_ratio)} />
              <Stat label="Dividend yield" value={info.metrics?.dividend_yield != null ? `${fmt(info.metrics.dividend_yield)}%` : "—"} />
            </div>
          ) : (
            <p className="t-serif t-muted" style={{ fontSize: 12 }}>
              {info?.unavailable_reason ?? "Fundamentals are not available for this exchange yet."}
            </p>
          )}
        </div>

        <Link
          to="/trade"
          className="btn-brass"
          style={{ textAlign: "center", padding: "12px 16px", fontSize: 11, textDecoration: "none" }}
        >
          Trade {sym}
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="t-mono t-muted" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {label}
      </p>
      <p className="t-serif t-parch" style={{ fontSize: 13 }}>{value}</p>
    </div>
  );
}
