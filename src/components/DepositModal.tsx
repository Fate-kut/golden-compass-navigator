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
  const [polling, setPolling] = useState<null | "waiting" | "confirmed" | "failed" | "cancelled">(
    null,
  );

  const pollStatus = async (transactionId: string, token: string) => {
    setPolling("waiting");
    // Poll every 4s for up to ~2 minutes (30 attempts)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        const res = await fetch("/api/mpesa-status", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ transaction_id: transactionId }),
        });
        const data = (await res.json()) as { status?: string; result_desc?: string };
        if (data.status === "confirmed") {
          setPolling("confirmed");
          toast.success("Deposit confirmed ✓");
          setTimeout(onClose, 1200);
          return;
        }
        if (data.status === "failed" || data.status === "cancelled") {
          setPolling(data.status);
          toast.error(
            data.status === "cancelled"
              ? "Payment cancelled"
              : data.result_desc || "Payment failed",
          );
          return;
        }
      } catch {
        // Ignore transient errors and keep polling
      }
    }
    // Timed out — leave as pending; callback may still settle
    setPolling(null);
    toast.message("Still waiting for M-Pesa. We'll notify you when it confirms.");
    onClose();
  };

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
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        transaction_id?: string;
      };
      if (!res.ok || data.error || !data.transaction_id) {
        toast.error(data.error || "STK Push failed");
        setBusy(false);
        return;
      }
      toast.success(data.message || "Check your phone");
      // Start polling — keep modal open so the user sees status updates
      pollStatus(data.transaction_id, token);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
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
