import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  holding: {
    pool_id: string;
    pool_name: string;
    current_value: number;
    exit_fee_percent: number;
    holding_period_days: number;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export function WithdrawModal({ holding, onClose, onSuccess }: Props) {
  const [amount, setAmount] = useState(String(Math.floor(holding.current_value)));
  const [busy, setBusy] = useState(false);

  const amt = Number(amount) || 0;
  const fee = (amt * holding.exit_fee_percent) / 100;
  const net = amt - fee;

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        toast.error("Please log in again");
        setBusy(false);
        return;
      }
      const res = await fetch("/api/withdraw-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pool_id: holding.pool_id, amount: amt }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || "Withdrawal failed");
      } else {
        toast.success(data.message || "Withdrawal requested");
        onSuccess();
        onClose();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

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
              WITHDRAW
            </p>
            <h2 className="t-display t-gold mt-1" style={{ fontSize: 18 }}>
              {holding.pool_name}
            </h2>
          </div>
          <button onClick={onClose} className="t-gold" style={{ fontSize: 22 }}>
            ×
          </button>
        </div>

        <label className="t-mono t-sec block mb-1" style={{ fontSize: 9, letterSpacing: "0.14em" }}>
          AMOUNT (KES)
        </label>
        <input
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          max={holding.current_value}
          className="w-full glass rounded-lg px-3 py-3 t-display t-parch mb-3"
          style={{ fontSize: 18 }}
        />

        <div className="glass rounded-lg p-3 mb-4 space-y-1">
          <Row label="Available" value={`KES ${holding.current_value.toFixed(2)}`} />
          <Row label={`Exit fee (${holding.exit_fee_percent}%)`} value={`− KES ${fee.toFixed(2)}`} />
          <div className="border-t border-white/10 my-1" />
          <Row label="You receive" value={`KES ${net.toFixed(2)}`} bold />
          {holding.holding_period_days > 0 && (
            <p className="t-mono t-muted mt-2" style={{ fontSize: 9 }}>
              Lock period: {holding.holding_period_days} days from first deposit.
            </p>
          )}
        </div>

        <button
          onClick={submit}
          disabled={busy || amt <= 0 || amt > holding.current_value}
          className="btn-brass w-full"
          style={{
            padding: "14px 16px",
            fontSize: 12,
            opacity: busy || amt <= 0 || amt > holding.current_value ? 0.5 : 1,
          }}
        >
          {busy ? "REQUESTING…" : "REQUEST WITHDRAWAL"}
        </button>
        <p className="t-mono t-muted mt-3 text-center" style={{ fontSize: 9 }}>
          Withdrawals are paid out within 24 hours after admin approval.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="t-mono t-sec" style={{ fontSize: 10 }}>
        {label}
      </span>
      <span
        className={bold ? "t-display t-gold" : "t-serif t-parch"}
        style={{ fontSize: bold ? 14 : 12 }}
      >
        {value}
      </span>
    </div>
  );
}
