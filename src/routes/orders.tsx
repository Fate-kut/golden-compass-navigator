import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Order History — Golden Compass" },
      { name: "description", content: "Every buy and sell order placed from your Golden Compass account, with live status." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Order History — Golden Compass" },
      { property: "og:description", content: "Track the status of your stock orders." },
      { property: "og:url", content: "/orders" },
    ],
    links: [{ rel: "canonical", href: "/orders" }],
  }),
  component: OrdersPage,
});

interface OrderRow {
  id: string;
  symbol: string;
  exchange: string;
  side: string;
  quantity: number;
  price: number | null;
  status: string;
  broker_order_id: string | null;
  error_message: string | null;
  created_at: string;
}

export function statusColor(status: string) {
  if (status === "filled") return "var(--gc-success)";
  if (status === "failed" || status === "cancelled") return "var(--gc-danger)";
  return "var(--gc-warning)";
}

export function OrderList({ orders }: { orders: OrderRow[] }) {
  if (orders.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 text-center">
        <p className="text-3xl mb-3">🧾</p>
        <p className="t-serif t-parch" style={{ fontSize: 15 }}>No orders yet.</p>
        <p className="t-mono t-muted mt-2" style={{ fontSize: 10 }}>
          Your buy and sell orders will be logged here.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {orders.map((o) => (
        <div key={o.id} className="glass rounded-2xl p-4 flex items-center justify-between">
          <div style={{ minWidth: 0 }}>
            <div className="flex items-center gap-2">
              <span
                className="t-mono"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  padding: "2px 8px",
                  borderRadius: 999,
                  color: o.side === "buy" ? "var(--gc-success)" : "var(--gc-danger)",
                  background: o.side === "buy" ? "rgba(120,200,140,0.12)" : "rgba(220,120,120,0.12)",
                }}
              >
                {o.side.toUpperCase()}
              </span>
              <span className="t-display t-parch" style={{ fontSize: 15 }}>{o.symbol}</span>
              <span className="t-mono t-muted" style={{ fontSize: 9 }}>{o.exchange}</span>
            </div>
            <p className="t-mono t-muted mt-1" style={{ fontSize: 9 }}>
              {Number(o.quantity)} @ {o.price != null ? Number(o.price).toLocaleString() : "—"} ·{" "}
              {new Date(o.created_at).toLocaleString("en-KE")}
            </p>
            {o.error_message && (
              <p className="t-mono mt-1" style={{ fontSize: 9, color: "var(--gc-danger)" }}>
                {o.error_message}
              </p>
            )}
          </div>
          <span
            className="t-mono shrink-0"
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              padding: "4px 10px",
              borderRadius: 999,
              color: statusColor(o.status),
              background: `${statusColor(o.status)}1A`,
              border: `1px solid ${statusColor(o.status)}55`,
            }}
          >
            {o.status.toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function useOrders(userId?: string) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, symbol, exchange, side, quantity, price, status, broker_order_id, error_message, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      setOrders((data ?? []) as OrderRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return { orders, loading };
}

function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { orders, loading } = useOrders(user?.id);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" />;

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-28 anim-fade-up">
      <header>
        <p className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.18em" }}>
          THE SHIP'S LEDGER
        </p>
        <h1 className="t-display t-gold mt-1" style={{ fontSize: 22 }}>
          Order History
        </h1>
        <Link to="/trade" className="t-mono t-sec" style={{ fontSize: 10, textDecoration: "underline" }}>
          Place a new order →
        </Link>
      </header>

      {loading ? <div className="skeleton h-24 w-full rounded-2xl" /> : <OrderList orders={orders} />}
    </div>
  );
}
