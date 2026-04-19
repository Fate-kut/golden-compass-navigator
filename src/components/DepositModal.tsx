import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  pool: { id: string; name: string; min_investment: number | null };
  onClose: () => void;
}

export function DepositModal({ pool, onClose }: Props) {
  const [amount, setAmount] = useState(String(pool.min_investment ?? 1000));
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

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
      const res = await fetch("/api/mpesa-stk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: Number(amount), phone, pool_id: pool.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || "STK Push failed");
      } else {
        toast.success(data.message || "Check your phone");
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
              DEPOSIT VIA M-PESA
            </p>
            <h2 className="t-display t-gold mt-1" style={{ fontSize: 18 }}>
              {pool.name}
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
          min={pool.min_investment ?? 1}
          className="w-full glass rounded-lg px-3 py-3 t-display t-parch mb-3"
          style={{ fontSize: 18 }}
        />

        <label className="t-mono t-sec block mb-1" style={{ fontSize: 9, letterSpacing: "0.14em" }}>
          M-PESA PHONE
        </label>
        <input
          type="tel"
          inputMode="numeric"
          placeholder="07XX XXX XXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full glass rounded-lg px-3 py-3 t-mono t-parch mb-2"
          style={{ fontSize: 14 }}
        />
        <p className="t-mono t-muted mb-4" style={{ fontSize: 9 }}>
          Min: KES {pool.min_investment ?? 1}. You'll receive an STK prompt to enter your PIN.
        </p>

        <button
          onClick={submit}
          disabled={busy}
          className="btn-brass w-full"
          style={{ padding: "14px 16px", fontSize: 12, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "SENDING…" : "SEND STK PUSH"}
        </button>
      </div>
    </div>
  );
}
