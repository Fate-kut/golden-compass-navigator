import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
}

export function Watchlist({ items, loading, onSelect, onRemove }: Props) {
  if (loading) return <div className="skeleton h-16 w-full rounded-2xl" />;
  if (items.length === 0) {
    return (
      <p className="t-mono t-muted" style={{ fontSize: 10 }}>
        No symbols yet — fetch a quote and tap “Add to watchlist”.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => (
        <div
          key={it.id}
          className="flex items-center justify-between"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(201,168,76,0.18)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
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
          <button
            onClick={() => onRemove(it.id)}
            aria-label={`Remove ${it.symbol} from watchlist`}
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
