import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/transactions")({
  head: () => ({ meta: [{ title: "Transactions — Admin" }] }),
  component: AdminTxPage,
});

interface TxRow {
  id: string;
  user_id: string;
  type: string | null;
  amount: number;
  status: string | null;
  created_at: string | null;
  mpesa_reference: string | null;
  investment_pools: { name: string } | null;
}

const KES = (n: number) => "KES " + Number(n).toLocaleString("en-KE", { maximumFractionDigits: 2 });

function AdminTxPage() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin) navigate({ to: "/home" });
  }, [isAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, user_id, type, amount, status, created_at, mpesa_reference, investment_pools(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      const list = (data as unknown as TxRow[]) ?? [];
      setRows(list);
      const ids = Array.from(new Set(list.map((r) => r.user_id)));
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const m: Record<string, string> = {};
        (profs ?? []).forEach((p) => (m[p.id] = p.full_name));
        setProfiles(m);
      }
      setLoading(false);
    })();
  }, [isAdmin, reloadTick]);

  const handleAction = async (txId: string, action: "approve" | "reject") => {
    setBusyId(txId);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        toast.error("Session expired");
        return;
      }
      const res = await fetch("/api/withdraw-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ transaction_id: txId, action }),
      });
      const data = await res.json();
      if (!res.ok || data.error) toast.error(data.error || "Failed");
      else {
        toast.success(action === "approve" ? "Withdrawal approved" : "Withdrawal rejected");
        setReloadTick((t) => t + 1);
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-5 pt-6 pb-28 anim-fade-up">
      <header className="flex items-center justify-between">
        <div>
          <p className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.18em" }}>THE LEDGER</p>
          <h1 className="t-display t-gold mt-1" style={{ fontSize: 20 }}>All Transactions</h1>
        </div>
        <Link to="/admin" className="t-mono t-muted" style={{ fontSize: 10, textDecoration: "none" }}>← Back</Link>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16 w-full rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center">
          <p className="t-serif t-parch" style={{ fontSize: 14 }}>No transactions yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((tx) => {
            const isDep = tx.type === "deposit";
            const color = tx.status === "confirmed" ? "var(--gc-success)" :
              tx.status === "failed" ? "var(--gc-danger)" : "var(--gc-warning)";
            const showActions = tx.type === "withdrawal" && tx.status === "pending";
            return (
              <div key={tx.id} className="glass rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="t-serif t-parch truncate" style={{ fontSize: 13 }}>
                      {isDep ? "↓" : "↑"} {profiles[tx.user_id] || "—"}
                    </p>
                    <p className="t-mono t-muted mt-0.5" style={{ fontSize: 9 }}>
                      {tx.created_at ? new Date(tx.created_at).toLocaleString("en-KE") : ""}
                      {tx.investment_pools?.name ? ` · ${tx.investment_pools.name}` : ""}
                    </p>
                  </div>
                  <div className="text-right ml-2">
                    <p className="t-serif t-gold" style={{ fontSize: 13 }}>{KES(Number(tx.amount))}</p>
                    <span className="t-mono" style={{ fontSize: 8, letterSpacing: "0.12em", color }}>
                      {(tx.status ?? "").toUpperCase()}
                    </span>
                  </div>
                </div>
                {showActions && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={() => handleAction(tx.id, "approve")}
                      disabled={busyId === tx.id}
                      className="btn-brass"
                      style={{ padding: "8px 10px", fontSize: 10, opacity: busyId === tx.id ? 0.5 : 1 }}
                    >
                      APPROVE
                    </button>
                    <button
                      onClick={() => handleAction(tx.id, "reject")}
                      disabled={busyId === tx.id}
                      className="glass rounded-lg t-danger"
                      style={{ fontFamily: "var(--font-display)", letterSpacing: "0.08em", fontSize: 10, padding: "8px 10px" }}
                    >
                      REJECT
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
