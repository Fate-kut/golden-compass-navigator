import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  pool: { id: string; name: string; min_investment: number | null };
  onClose: () => void;
  onSuccess?: () => void;
}

// "Invest into pool" — moves funds from the user wallet into the selected pool.
// M-Pesa top-ups are handled separately by WalletDepositModal.
export function DepositModal({ pool, onClose, onSuccess }: Props) {
  const [amount, setAmount] = useState(String(pool.min_investment ?? 1));
  const [busy, setBusy] = useState(false);
  const [walletBal, setWalletBal] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("profiles")
        .select("wallet_balance")
        .eq("id", uid)
        .maybeSingle();
      setWalletBal(Number(data?.wallet_balance ?? 0));
    })();
  }, []);

  const submit = async () => {
    if (busy) return;
    const amt = Number(amount);
    if (!amt || amt < 1) {
      toast.error("Enter a valid amount");
      return;
    }
    if (walletBal !== null && amt > walletBal) {
      toast.error("Insufficient wallet balance. Top up first.");
      return;
    }
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        toast.error("Please log in again");
        setBusy(false);
        return;
      }
      const res = await fetch("/api/wallet-invest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: amt, pool_id: pool.id }),
      });
      const data = (await res.json()) as {
        error?: string;
        success?: boolean;
        new_balance?: number;
      };
      if (!res.ok || !data.success) {
        toast.error(data.error || "Investment failed");
        setBusy(false);
        return;
      }
      toast.success(`Invested KES ${amt.toLocaleString()} into ${pool.name} ✓`);
      if (typeof data.new_balance === "number") setWalletBal(data.new_balance);
      onSuccess?.();
      setTimeout(onClose, 800);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
      setBusy(false);
    }
  };

  const insufficient = walletBal !== null && Number(amount) > walletBal;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="glass-gold w-full max-w-[430px] rounded-t-3xl p-6 anim-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.18em" }}>
              INVEST FROM WALLET INTO
            </p>
            <h2 className="t-display t-gold mt-1" style={{ fontSize: 18 }}>
              {pool.name}
            </h2>
          </div>
          <button onClick={onClose} className="t-gold" style={{ fontSize: 22 }}>
            ×
          </button>
        </div>

        <div className="glass rounded-lg p-3 mb-4 flex items-center justify-between">
          <span className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.14em" }}>
            WALLET BALANCE
          </span>
          <span className="t-display t-gold" style={{ fontSize: 16 }}>
            KES {(walletBal ?? 0).toLocaleString()}
          </span>
        </div>

        <label className="t-mono t-sec block mb-1" style={{ fontSize: 9, letterSpacing: "0.14em" }}>
          AMOUNT (KES)
        </label>
        <input
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={pool.min_investment ?? 1}
          className="w-full glass rounded-lg px-3 py-3 t-display t-parch mb-3"
          style={{ fontSize: 18 }}
        />

        <p className="t-mono t-muted mb-4" style={{ fontSize: 9 }}>
          Min: KES {pool.min_investment ?? 1}. Funds debited from your wallet instantly.
          {insufficient && (
            <span className="block mt-1" style={{ color: "#e85d3a" }}>
              ⚠ Not enough in wallet — top up via Deposit on Home.
            </span>
          )}
        </p>

        <button
          onClick={submit}
          disabled={busy || insufficient}
          className="btn-brass w-full"
          style={{
            padding: "14px 16px",
            fontSize: 12,
            opacity: busy || insufficient ? 0.6 : 1,
          }}
        >
          {busy ? "INVESTING…" : "INVEST FROM WALLET"}
        </button>
      </div>
    </div>
  );
}
