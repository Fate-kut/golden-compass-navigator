import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface PriceAlert {
  id: string;
  symbol: string;
  exchange: string;
  name: string | null;
  condition: "greater" | "less";
  threshold_price: number;
  triggered_at: string | null;
  created_at: string;
}

export function usePriceAlerts(userId?: string) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("price_alerts")
      .select("id, symbol, exchange, name, condition, threshold_price, triggered_at, created_at")
      .order("created_at", { ascending: false });
    if (!error) setAlerts((data ?? []) as unknown as PriceAlert[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: {
      symbol: string;
      exchange: string;
      name?: string | null;
      condition: "greater" | "less";
      threshold_price: number;
    }) => {
      if (!userId) return false;
      const { error } = await supabase.from("price_alerts").insert({
        user_id: userId,
        symbol: input.symbol.toUpperCase(),
        exchange: input.exchange,
        name: input.name ?? null,
        condition: input.condition,
        threshold_price: input.threshold_price,
      } as never);
      if (error) {
        toast.error(error.message);
        return false;
      }
      toast.success(`Alert set for ${input.symbol.toUpperCase()}`);
      await refresh();
      return true;
    },
    [userId, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("price_alerts").delete().eq("id", id);
      if (error) return toast.error(error.message);
      await refresh();
    },
    [refresh],
  );

  return { alerts, loading, create, remove, refresh };
}

interface ModalProps {
  open: boolean;
  symbol: string;
  exchange: string;
  currentPrice?: number;
  currency?: string;
  onClose: () => void;
  onCreate: (input: {
    symbol: string;
    exchange: string;
    condition: "greater" | "less";
    threshold_price: number;
  }) => Promise<boolean> | boolean;
}

export function AlertModal({
  open,
  symbol,
  exchange,
  currentPrice,
  currency = "",
  onClose,
  onCreate,
}: ModalProps) {
  const [condition, setCondition] = useState<"greater" | "less">("greater");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setPrice(currentPrice ? String(Number(currentPrice.toFixed(2))) : "");
  }, [open, currentPrice]);

  if (!open) return null;

  const submit = async () => {
    const threshold = Number(price);
    if (!threshold || threshold <= 0) return toast.error("Enter a target price above 0");
    setSaving(true);
    const ok = await onCreate({ symbol, exchange, condition, threshold_price: threshold });
    setSaving(false);
    if (ok) onClose();
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(201,168,76,0.22)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--parchment)",
    fontFamily: "var(--font-serif)",
    fontSize: 14,
    outline: "none",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Create price alert for ${symbol}`}
    >
      <div
        className="glass-gold w-full max-w-[430px] rounded-t-3xl anim-fade-up"
        style={{ padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.18em" }}>
            PRICE ALERT · {symbol}
          </p>
          <button onClick={onClose} className="t-gold" style={{ fontSize: 22 }} aria-label="Close">
            ×
          </button>
        </div>

        <div className="flex gap-2" style={{ marginBottom: 12 }}>
          {(["greater", "less"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCondition(c)}
              className="t-mono"
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 12,
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
                border: `1px solid ${condition === c ? "rgba(201,168,76,0.5)" : "rgba(201,168,76,0.18)"}`,
                background: condition === c ? "rgba(201,168,76,0.14)" : "transparent",
                color: condition === c ? "rgb(235,215,165)" : "rgba(200,175,130,0.6)",
              }}
            >
              {c === "greater" ? "Rises above" : "Falls below"}
            </button>
          ))}
        </div>

        <label className="t-mono t-muted" style={{ fontSize: 10, letterSpacing: "0.1em" }}>
          TARGET PRICE {currency && `(${currency})`}
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          style={{ ...inputStyle, marginTop: 6 }}
          aria-label="Target price"
        />
        {currentPrice != null && (
          <p className="t-mono t-muted" style={{ fontSize: 10, marginTop: 6 }}>
            Now: {currency} {currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        )}

        <button
          onClick={submit}
          disabled={saving}
          className="btn-brass"
          style={{ marginTop: 16, width: "100%", padding: "12px 16px", fontSize: 11, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Setting…" : "Set alert"}
        </button>
        <p className="t-mono t-muted" style={{ marginTop: 8, fontSize: 9 }}>
          Alerts are checked against sandbox/simulated prices while simulated trading is on.
        </p>
      </div>
    </div>
  );
}

export function AlertsPanel({
  alerts,
  loading,
  onRemove,
}: {
  alerts: PriceAlert[];
  loading: boolean;
  onRemove: (id: string) => void;
}) {
  if (loading) return <div className="skeleton h-12 w-full rounded-2xl" />;
  const active = alerts.filter((a) => !a.triggered_at);
  if (active.length === 0) {
    return (
      <p className="t-mono t-muted" style={{ fontSize: 10 }}>
        No active alerts — tap “+ Alert” on a watchlist row.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {active.map((a) => (
        <div
          key={a.id}
          className="flex items-center justify-between"
          style={{
            padding: "8px 12px",
            borderRadius: 12,
            border: "1px solid rgba(201,168,76,0.18)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <span className="t-serif t-parch" style={{ fontSize: 12 }}>
            <span className="t-gold">{a.symbol}</span>{" "}
            {a.condition === "greater" ? "≥" : "≤"}{" "}
            {Number(a.threshold_price).toLocaleString()}
          </span>
          <button
            onClick={() => onRemove(a.id)}
            aria-label={`Delete alert for ${a.symbol}`}
            className="t-mono t-muted"
            style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer" }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
