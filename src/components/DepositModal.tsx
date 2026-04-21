import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  pool: { id: string; name: string; min_investment: number | null };
  onClose: () => void;
  onSuccess?: () => void;
}

export function DepositModal({ pool, onClose, onSuccess }: Props) {
  const [amount, setAmount] = useState(String(pool.min_investment ?? 1000));
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"wallet" | "mpesa">("wallet");
  const [walletBal, setWalletBal] = useState<number | null>(null);
  const [polling, setPolling] = useState<null | "waiting" | "confirmed" | "failed" | "cancelled">(null);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) return;
      const { data } = await supabase.from("profiles").select("wallet_balance").eq("id", uid).maybeSingle();
      setWalletBal(Number(data?.wallet_balance ?? 0));
    })();
  }, []);

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
          onSuccess?.();
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
      if (mode === "wallet") {
        const res = await fetch("/api/wallet-invest", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ amount: Number(amount), pool_id: pool.id }),
        });
        const data = (await res.json()) as { error?: string; success?: boolean; new_balance?: number };
        if (!res.ok || !data.success) {
          toast.error(data.error || "Investment failed");
          setBusy(false);
          return;
        }
        toast.success("Invested from wallet ✓");
        if (typeof data.new_balance === "number") setWalletBal(data.new_balance);
        onSuccess?.();
        setTimeout(onClose, 800);
        return;
      }
      const res = await fetch("/api/mpesa-stk", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: Number(amount), phone, pool_id: pool.id }),
      });
      const data = (await res.json()) as { error?: string; message?: string; transaction_id?: string };
      if (!res.ok || data.error || !data.transaction_id) {
        toast.error(data.error || "STK Push failed");
        setBusy(false);
        return;
      }
      toast.success(data.message || "Check your phone");
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
              INVEST INTO
            </p>
            <h2 className="t-display t-gold mt-1" style={{ fontSize: 18 }}>
              {pool.name}
            </h2>
          </div>
          <button onClick={onClose} className="t-gold" style={{ fontSize: 22 }}>×</button>
        </div>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => setMode("wallet")}
            className={mode === "wallet" ? "btn-brass" : "glass rounded-lg t-gold"}
            style={{ padding: "10px 8px", fontSize: 10, letterSpacing: "0.1em" }}
          >
            FROM WALLET
            {walletBal !== null && (
              <span className="block t-mono" style={{ fontSize: 8, opacity: 0.8 }}>
                KES {walletBal.toLocaleString()}
              </span>
            )}
          </button>
          <button
            onClick={() => setMode("mpesa")}
            className={mode === "mpesa" ? "btn-brass" : "glass rounded-lg t-gold"}
            style={{ padding: "10px 8px", fontSize: 10, letterSpacing: "0.1em" }}
          >
            M-PESA STK
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

        {mode === "mpesa" && (
          <>
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
          </>
        )}
        <p className="t-mono t-muted mb-4" style={{ fontSize: 9 }}>
          Min: KES {pool.min_investment ?? 1}.{" "}
          {mode === "mpesa" ? "You'll receive an STK prompt." : "Funds debited from your wallet instantly."}
        </p>

        {polling === "waiting" && (
          <div className="glass rounded-lg p-3 mb-3 text-center">
            <p className="t-mono t-gold animate-pulse" style={{ fontSize: 11, letterSpacing: "0.14em" }}>
              ⏳ AWAITING M-PESA PIN…
            </p>
            <p className="t-mono t-muted mt-1" style={{ fontSize: 9 }}>
              Enter your PIN on the prompt. We're checking every few seconds.
            </p>
          </div>
        )}
        {polling === "confirmed" && (
          <div className="glass rounded-lg p-3 mb-3 text-center">
            <p className="t-mono t-gold" style={{ fontSize: 11, letterSpacing: "0.14em" }}>
              ✅ PAYMENT CONFIRMED
            </p>
          </div>
        )}
        {(polling === "failed" || polling === "cancelled") && (
          <div className="glass rounded-lg p-3 mb-3 text-center">
            <p className="t-mono" style={{ fontSize: 11, letterSpacing: "0.14em", color: "#e85d3a" }}>
              {polling === "cancelled" ? "✗ PAYMENT CANCELLED" : "✗ PAYMENT FAILED"}
            </p>
          </div>
        )}

        <button
          onClick={submit}
          disabled={busy || polling === "waiting" || polling === "confirmed"}
          className="btn-brass w-full"
          style={{
            padding: "14px 16px",
            fontSize: 12,
            opacity: busy || polling === "waiting" || polling === "confirmed" ? 0.6 : 1,
          }}
        >
          {polling === "waiting"
            ? "WAITING FOR PAYMENT…"
            : polling === "confirmed"
              ? "DONE"
              : busy
                ? "SENDING…"
                : polling === "failed" || polling === "cancelled"
                  ? "TRY AGAIN"
                  : "SEND STK PUSH"}
        </button>
      </div>
    </div>
  );
}
