import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { searchSymbols, type SymbolEntry } from "@/lib/symbols";
import type { WatchlistItem } from "@/components/Watchlist";

interface Props {
  open: boolean;
  onClose: () => void;
  watchlist: WatchlistItem[];
  onAdd: (symbol: string, exchange: string) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
  /** When provided, selecting a result picks it for trading instead of navigating. */
  onPick?: (entry: SymbolEntry) => void;
}

/**
 * Global symbol search. Full-screen glass sheet on mobile, Cmd/Ctrl+K on desktop.
 * Filtering is client-side against the seeded directory in src/lib/symbols.ts.
 */
export function SearchDialog({ open, onClose, watchlist, onAdd, onRemove, onPick }: Props) {
  const navigate = useNavigate();
  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState("");

  // Debounced filter input.
  useEffect(() => {
    const id = setTimeout(() => setQuery(raw), 160);
    return () => clearTimeout(id);
  }, [raw]);

  useEffect(() => {
    if (!open) setRaw("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const results = useMemo(() => searchSymbols(query), [query]);
  const watched = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of watchlist) m.set(`${w.symbol.toUpperCase()}|${w.exchange}`, w.id);
    return m;
  }, [watchlist]);

  if (!open) return null;

  const go = (s: SymbolEntry) => {
    onClose();
    if (onPick) {
      onPick(s);
      return;
    }
    void navigate({ to: "/stock/$symbol", params: { symbol: s.symbol }, search: { exchange: s.exchange } });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search symbols"
    >
      <div
        className="glass-gold w-full max-w-[430px] rounded-b-3xl anim-fade-up flex flex-col"
        style={{ maxHeight: "88vh", padding: "20px 16px 16px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.18em" }}>
            SEARCH MARKETS
          </p>
          <button onClick={onClose} className="t-gold" style={{ fontSize: 22 }} aria-label="Close search">
            ×
          </button>
        </div>

        <input
          autoFocus
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Symbol or company…"
          aria-label="Search by symbol or company name"
          className="w-full glass rounded-lg px-3 py-3 t-serif t-parch"
          style={{ fontSize: 15, outline: "none" }}
        />

        <p className="t-mono t-muted mt-2" style={{ fontSize: 9, letterSpacing: "0.08em" }}>
          {results.length} MATCH{results.length === 1 ? "" : "ES"} · NSE · NGX · JSE · GSE · GLOBAL
        </p>

        <div className="flex flex-col gap-2 mt-3 overflow-y-auto" style={{ paddingBottom: 8 }}>
          {results.length === 0 && (
            <p className="t-serif t-muted text-center" style={{ fontSize: 13, padding: "20px 0" }}>
              No symbols match “{query}”.
            </p>
          )}
          {results.map((s) => {
            const wid = watched.get(`${s.symbol}|${s.exchange}`);
            return (
              <div
                key={`${s.symbol}-${s.exchange}`}
                className="flex items-center justify-between"
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(201,168,76,0.18)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <button
                  onClick={() => go(s)}
                  className="flex flex-col flex-1"
                  style={{ background: "none", border: "none", textAlign: "left", cursor: "pointer" }}
                >
                  <span className="t-display t-gold" style={{ fontSize: 14 }}>
                    {s.symbol}
                  </span>
                  <span className="t-serif t-muted" style={{ fontSize: 11 }}>
                    {s.name}
                  </span>
                </button>
                <span className="flex items-center gap-2">
                  <span className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.1em" }}>
                    {s.exchange}
                  </span>
                  <button
                    onClick={() => (wid ? onRemove(wid) : onAdd(s.symbol, s.exchange))}
                    aria-label={wid ? `Remove ${s.symbol} from watchlist` : `Add ${s.symbol} to watchlist`}
                    className="t-gold"
                    style={{
                      background: "none",
                      border: "none",
                      fontSize: 16,
                      cursor: "pointer",
                      opacity: wid ? 1 : 0.45,
                    }}
                  >
                    {wid ? "★" : "☆"}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Registers Cmd/Ctrl+K to open the search dialog. */
export function useSearchHotkey(onOpen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);
}

/** Compass-styled search trigger for page headers. */
export function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Search symbols"
      className="glass w-11 h-11 rounded-full flex items-center justify-center t-gold"
      style={{ fontSize: 16, border: "none", cursor: "pointer" }}
    >
      🔍
    </button>
  );
}
