import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { TiltCard } from "@/components/TiltCard";
import { Sparkline } from "@/components/Sparkline";
import { useQuotes } from "@/lib/quote-client";
import { symbolsByCategory, type SymbolEntry } from "@/lib/symbols";

export const Route = createFileRoute("/markets")({
  head: () => ({
    meta: [
      { title: "Markets — NSE & Global Movers | Golden Compass" },
      {
        name: "description",
        content:
          "Track NSE Kenya movers, global indices and global tech equities at a glance on Golden Compass.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Markets — NSE & Global Movers | Golden Compass" },
      {
        property: "og:description",
        content: "NSE Kenya movers, global indices and global tech equities in one compass view.",
      },
    ],
  }),
  component: MarketsPage,
});

const GROUPS: { title: string; caption: string; entries: SymbolEntry[] }[] = [
  { title: "NSE MOVERS", caption: "Nairobi Securities Exchange", entries: symbolsByCategory("nse").slice(0, 8) },
  { title: "GLOBAL INDICES", caption: "Broad-market equity ETFs", entries: symbolsByCategory("index") },
  { title: "GLOBAL TECH", caption: "Large-cap technology", entries: symbolsByCategory("tech") },
  { title: "AFRICAN BLUE CHIPS", caption: "NGX · JSE · GSE", entries: symbolsByCategory("africa").slice(0, 8) },
];

function MarketsPage() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;

  return (
    <div className="flex flex-col" style={{ minHeight: "100%" }}>
      <header style={{ padding: "20px 20px 8px" }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 28 }}>🌍</span>
          <div>
            <h1 className="t-display t-gold" style={{ fontSize: 18 }}>Markets</h1>
            <p className="t-mono t-muted" style={{ fontSize: 9, letterSpacing: "0.1em" }}>
              AFRICAN &amp; GLOBAL EQUITIES
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-5" style={{ padding: "8px 0 24px" }}>
        <p
          className="t-mono"
          style={{
            margin: "0 16px",
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(220,170,90,0.35)",
            background: "rgba(220,170,90,0.10)",
            color: "rgb(235,200,130)",
            fontSize: 9,
            letterSpacing: "0.08em",
          }}
        >
          SIMULATED TRADING — PRICES MAY BE SANDBOX DATA
        </p>

        {GROUPS.map((g) => (
          <MarketRow key={g.title} title={g.title} caption={g.caption} entries={g.entries} />
        ))}
      </div>
    </div>
  );
}

function MarketRow({
  title,
  caption,
  entries,
}: {
  title: string;
  caption: string;
  entries: SymbolEntry[];
}) {
  const { quotes } = useQuotes(entries.map((e) => ({ symbol: e.symbol, exchange: e.exchange })), 45_000);

  return (
    <section className="flex flex-col gap-2">
      <div style={{ padding: "0 16px" }}>
        <h2 className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.18em" }}>{title}</h2>
        <p className="t-serif t-muted" style={{ fontSize: 11 }}>{caption}</p>
      </div>
      <div
        className="flex gap-3 overflow-x-auto"
        style={{ padding: "4px 16px 8px", scrollSnapType: "x mandatory" }}
      >
        {entries.map((e) => {
          const state = quotes[e.symbol.toUpperCase()];
          const q = state?.quote;
          const up = (q?.change_pct ?? 0) >= 0;
          const color = up ? "rgb(120,200,140)" : "rgb(220,120,120)";
          return (
            <TiltCard key={`${e.symbol}-${e.exchange}`} className="shrink-0" max={6}>
              <Link
                to="/stock/$symbol"
                params={{ symbol: e.symbol }}
                search={{ exchange: e.exchange }}
                className="glass-gold flex flex-col rounded-2xl"
                style={{ width: 156, padding: 12, textDecoration: "none", scrollSnapAlign: "start" }}
              >
                <span className="t-display t-gold" style={{ fontSize: 14 }}>{e.symbol}</span>
                <span
                  className="t-serif t-muted"
                  style={{ fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {e.name}
                </span>
                <div style={{ margin: "8px 0 4px", height: 30 }}>
                  {state && state.history.length > 1 ? (
                    <Sparkline data={state.history} width={132} height={30} color={color} />
                  ) : (
                    <div className="skeleton w-full h-full rounded-lg" />
                  )}
                </div>
                <span className="t-serif t-parch" style={{ fontSize: 13 }}>
                  {q ? `${q.currency} ${q.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                </span>
                <span className="t-mono" style={{ fontSize: 10, color }}>
                  {q ? `${up ? "+" : ""}${q.change_pct.toFixed(2)}%` : "loading…"}
                </span>
              </Link>
            </TiltCard>
          );
        })}
      </div>
    </section>
  );
}
