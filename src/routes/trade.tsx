import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { OrderList, useOrders } from "@/components/OrderHistory";

export const Route = createFileRoute("/trade")({
  head: () => ({
    meta: [
      { title: "Trade Stocks — Golden Compass" },
      { name: "description", content: "Buy and sell NSE and global stocks from your Golden Compass account." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Trade Stocks — Golden Compass" },
      { property: "og:description", content: "Place buy and sell orders on NSE Kenya and global markets." },
      { property: "og:url", content: "/trade" },
    ],
    links: [{ rel: "canonical", href: "/trade" }],
  }),
  component: TradePage,
});

interface Quote {
  symbol: string;
  price: number;
  change_pct: number;
  currency: "KES" | "USD";
  source: "NSE" | "GLOBAL";
  sandbox: boolean;
}

const EXCHANGES = ["NSE", "NGX", "JSE", "GSE", "GLOBAL"] as const;

function TradePage() {
  const { user, loading: authLoading } = useAuth();
  const [symbol, setSymbol] = useState("");
  const [exchange, setExchange] = useState<(typeof EXCHANGES)[number]>("NSE");
  const [accountId, setAccountId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [placing, setPlacing] = useState<"buy" | "sell" | null>(null);
  const { orders, loading: ordersLoading, refresh: refreshOrders } = useOrders(user?.id);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" />;

  const fetchQuote = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) {
      toast.error("Enter a symbol");
      return;
    }
    setQuoteLoading(true);
    setQuote(null);
    try {
      const res = await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}&exchange=${exchange}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Quote failed");
      setQuote(data as Quote);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Quote failed");
    } finally {
      setQuoteLoading(false);
    }
  };

  const placeOrder = async (side: "buy" | "sell") => {
    const sym = symbol.trim().toUpperCase();
    const qty = Number(quantity);
    const acct = accountId.trim();
    if (!sym) return toast.error("Enter a symbol");
    if (!acct) return toast.error("Enter your brokerage account ID");
    if (!qty || qty <= 0) return toast.error("Quantity must be > 0");

    setPlacing(side);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");

      const res = await fetch("/api/trade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ symbol: sym, side, quantity: qty, account_id: acct, exchange }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Order failed");
      toast.success(`${side === "buy" ? "Buy" : "Sell"} order placed for ${qty} ${sym}`);
      await refreshOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Order failed");
      await refreshOrders();
    } finally {
      setPlacing(null);
    }
  };

  const cardStyle: React.CSSProperties = {
    padding: 16,
    borderRadius: 16,
    border: "1px solid rgba(201,168,76,0.22)",
    background: "rgba(255,255,255,0.04)",
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "rgba(200,175,130,0.7)",
    marginBottom: 6,
    display: "block",
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
    <div className="flex flex-col" style={{ minHeight: "100%" }}>
      <header style={{ padding: "20px 20px 12px" }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 28 }}>📈</span>
          <div>
            <h1 className="t-display t-gold" style={{ fontSize: 18 }}>Trade Stocks</h1>
            <p className="t-mono t-muted" style={{ fontSize: 9, letterSpacing: "0.1em" }}>
              NSE KENYA · GLOBAL MARKETS
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3" style={{ padding: "8px 16px 24px" }}>
        <div style={cardStyle}>
          <div className="flex gap-2">
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Symbol</label>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="SCOM, AAPL…"
                style={inputStyle}
              />
            </div>
            <div style={{ width: 110 }}>
              <label style={labelStyle}>Exchange</label>
              <select
                value={exchange}
                onChange={(e) => setExchange(e.target.value as typeof exchange)}
                style={inputStyle}
              >
                {EXCHANGES.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={fetchQuote}
            disabled={quoteLoading}
            className="btn-brass"
            style={{ marginTop: 12, width: "100%", padding: "10px 16px", fontSize: 11, opacity: quoteLoading ? 0.6 : 1 }}
          >
            {quoteLoading ? "Fetching…" : "Get Quote"}
          </button>

          {quote && (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 12,
                background: "rgba(7,12,22,0.45)",
                border: "1px solid rgba(201,168,76,0.18)",
              }}
            >
              <div className="flex items-baseline justify-between">
                <span className="t-display t-gold" style={{ fontSize: 16 }}>{quote.symbol}</span>
                <span className="t-mono t-muted" style={{ fontSize: 9 }}>
                  {quote.source}{quote.sandbox ? " · SANDBOX" : ""}
                </span>
              </div>
              <div className="flex items-baseline justify-between" style={{ marginTop: 6 }}>
                <span className="t-serif" style={{ fontSize: 22, color: "var(--parchment)" }}>
                  {quote.currency} {quote.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span
                  className="t-mono"
                  style={{
                    fontSize: 12,
                    color: quote.change_pct >= 0 ? "rgb(120,200,140)" : "rgb(220,120,120)",
                  }}
                >
                  {quote.change_pct >= 0 ? "+" : ""}
                  {quote.change_pct.toFixed(2)}%
                </span>
              </div>
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <label style={labelStyle}>Brokerage Account ID</label>
          <input
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="acc_…"
            style={inputStyle}
          />
          <label style={{ ...labelStyle, marginTop: 12 }}>Quantity</label>
          <input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={inputStyle}
          />
          {quote && Number(quantity) > 0 && (
            <p className="t-mono t-muted" style={{ marginTop: 8, fontSize: 11 }}>
              Est. total: {quote.currency}{" "}
              {(quote.price * Number(quantity)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          )}

          <div className="flex gap-2" style={{ marginTop: 14 }}>
            <button
              onClick={() => placeOrder("buy")}
              disabled={placing !== null}
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: 12,
                border: "1px solid rgba(120,200,140,0.4)",
                background: "linear-gradient(180deg, rgba(120,200,140,0.22), rgba(120,200,140,0.08))",
                color: "rgb(180,235,195)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: placing ? "wait" : "pointer",
                opacity: placing && placing !== "buy" ? 0.5 : 1,
              }}
            >
              {placing === "buy" ? "Placing…" : "Buy"}
            </button>
            <button
              onClick={() => placeOrder("sell")}
              disabled={placing !== null}
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: 12,
                border: "1px solid rgba(220,120,120,0.4)",
                background: "linear-gradient(180deg, rgba(220,120,120,0.22), rgba(220,120,120,0.08))",
                color: "rgb(245,190,190)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: placing ? "wait" : "pointer",
                opacity: placing && placing !== "sell" ? 0.5 : 1,
              }}
            >
              {placing === "sell" ? "Placing…" : "Sell"}
            </button>
          </div>
        </div>

        <section className="flex flex-col gap-2" style={{ marginTop: 8 }}>
          <div className="flex items-baseline justify-between">
            <h2 className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.18em" }}>
              RECENT ORDERS
            </h2>
            <Link to="/orders" className="t-mono t-sec" style={{ fontSize: 9, textDecoration: "underline" }}>
              View all →
            </Link>
          </div>
          {ordersLoading ? (
            <div className="skeleton h-20 w-full rounded-2xl" />
          ) : (
            <OrderList orders={orders.slice(0, 5)} />
          )}
        </section>
      </div>
    </div>
  );
}
