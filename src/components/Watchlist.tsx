import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sparkline } from "@/components/Sparkline";
import { useQuotes } from "@/lib/quote-client";

export interface WatchlistItem {
  id: string;
  symbol: string;
  exchange: string;
  company: string | null;
  added_at: string;
}

export function useWatchlist(userId?: string) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("watchlists")
      .select("id, symbol, exchange, company, added_at")
      .order("added_at", { ascending: false });
    if (!error) setItems((data ?? []) as WatchlistItem[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(
    async (symbol: string, exchange: string) => {
      if (!userId) return;
      const { error } = await supabase
        .from("watchlists")
        .insert({ user_id: userId, symbol: symbol.toUpperCase(), exchange });
      if (error) {
        toast.error(error.code === "23505" ? "Already on your watchlist" : error.message);
        return;
      }
      toast.success(`${symbol.toUpperCase()} added to watchlist`);
      await refresh();
    },
    [userId, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("watchlists").delete().eq("id", id);
      if (error) return toast.error(error.message);
      await refresh();
    },
    [refresh],
  );

  return { items, loading, add, remove, refresh };
}

interface Props {
  items: WatchlistItem[];
  loading: boolean;
  onSelect: (item: WatchlistItem) => void;
  onRemove: (id: string) => void;
  /** Opens the price-alert modal for a row. */
  onAlert?: (item: WatchlistItem, price?: number, currency?: string) => void;
  /** Inline quick trade — resolves when the order attempt finishes. */
  onTrade?: (item: WatchlistItem, side: "buy" | "sell", quantity: number) => Promise<void> | void;
}

export function Watchlist({ items, loading, onSelect, onRemove, onAlert, onTrade }: Props) {
  const { quotes } = useQuotes(items.map((i) => ({ symbol: i.symbol, exchange: i.exchange })));
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);

  if (loading) return <div className="skeleton h-16 w-full rounded-2xl" />;
  if (items.length === 0) {
    return (
      <p className="t-mono t-muted" style={{ fontSize: 10 }}>
        No symbols yet — fetch a quote and tap “Add to watchlist”.
      </p>
    );
  }

  const step = (id: string, delta: number) =>
    setQty((q) => ({ ...q, [id]: Math.max(1, (q[id] ?? 1) + delta) }));

  const trade = async (it: WatchlistItem, side: "buy" | "sell") => {
    if (!onTrade) return;
    setBusy(`${it.id}-${side}`);
    try {
      await onTrade(it, side, qty[it.id] ?? 1);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => {
        const state = quotes[it.symbol.toUpperCase()];
        const q = state?.quote;
        const up = (q?.change_pct ?? 0) >= 0;
        const color = up ? "rgb(120,200,140)" : "rgb(220,120,120)";
        return (
          <div
            key={it.id}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(201,168,76,0.18)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => onSelect(it)}
                className="flex flex-col"
                style={{ background: "none", border: "none", textAlign: "left", cursor: "pointer" }}
              >
                <span className="t-display t-gold" style={{ fontSize: 14 }}>{it.symbol}</span>
                <span className="t-mono t-muted" style={{ fontSize: 9, letterSpacing: "0.1em" }}>
                  {it.exchange}
                </span>
              </button>

              <div style={{ flex: 1, maxWidth: 90, opacity: 0.9 }}>
                {state && state.history.length > 1 && (
                  <Sparkline data={state.history} width={90} height={26} color={color} />
                )}
              </div>

              <div className="flex flex-col items-end">
                <span className="t-serif t-parch" style={{ fontSize: 13 }}>
                  {q ? `${q.currency} ${q.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                </span>
                <span className="t-mono" style={{ fontSize: 10, color }}>
                  {q ? `${up ? "+" : ""}${q.change_pct.toFixed(2)}%` : ""}
                </span>
              </div>

              <button
                onClick={() => onRemove(it.id)}
                aria-label={`Remove ${it.symbol} from watchlist`}
                className="t-mono t-muted"
                style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer" }}
              >
                ×
              </button>
            </div>

            {(onTrade || onAlert) && (
              <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
                {onTrade && (
                  <>
                    <div className="flex items-center" style={{ gap: 4 }}>
                      <StepBtn label="Decrease quantity" onClick={() => step(it.id, -1)}>−</StepBtn>
                      <span className="t-mono t-parch" style={{ fontSize: 11, minWidth: 18, textAlign: "center" }}>
                        {qty[it.id] ?? 1}
                      </span>
                      <StepBtn label="Increase quantity" onClick={() => step(it.id, 1)}>+</StepBtn>
                    </div>
                    <QuickBtn
                      tone="buy"
                      disabled={busy !== null}
                      onClick={() => trade(it, "buy")}
                    >
                      {busy === `${it.id}-buy` ? "…" : "Buy"}
                    </QuickBtn>
                    <QuickBtn
                      tone="sell"
                      disabled={busy !== null}
                      onClick={() => trade(it, "sell")}
                    >
                      {busy === `${it.id}-sell` ? "…" : "Sell"}
                    </QuickBtn>
                  </>
                )}
                {onAlert && (
                  <button
                    onClick={() => onAlert(it, q?.price, q?.currency)}
                    className="t-mono"
                    style={{
                      marginLeft: "auto",
                      padding: "5px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(201,168,76,0.35)",
                      background: "rgba(201,168,76,0.10)",
                      color: "rgb(235,215,165)",
                      fontSize: 9,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    + Alert
                  </button>
                )}
              </div>
            )}

            <Link
              to="/stock/$symbol"
              params={{ symbol: it.symbol }}
              search={{ exchange: it.exchange }}
              className="t-mono t-sec"
              style={{ display: "inline-block", marginTop: 6, fontSize: 9, letterSpacing: "0.1em" }}
            >
              VIEW CHART →
            </Link>
          </div>
        );
      })}
    </div>
  );
}

function StepBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="t-mono t-gold"
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        border: "1px solid rgba(201,168,76,0.28)",
        background: "rgba(255,255,255,0.04)",
        cursor: "pointer",
        fontSize: 12,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

function QuickBtn({
  children,
  tone,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  tone: "buy" | "sell";
  disabled?: boolean;
  onClick: () => void;
}) {
  const buy = tone === "buy";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="t-mono"
      style={{
        padding: "6px 12px",
        borderRadius: 10,
        border: `1px solid ${buy ? "rgba(120,200,140,0.4)" : "rgba(220,120,120,0.4)"}`,
        background: buy
          ? "linear-gradient(180deg, rgba(120,200,140,0.22), rgba(120,200,140,0.08))"
          : "linear-gradient(180deg, rgba(220,120,120,0.22), rgba(220,120,120,0.08))",
        color: buy ? "rgb(180,235,195)" : "rgb(245,190,190)",
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}
