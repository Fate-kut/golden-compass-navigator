import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface BrokerageAccount {
  id: string;
  account_id: string;
  label: string;
  is_default: boolean;
  created_at: string;
}

/** Linked brokerage accounts — entered once, then reused for every trade. */
export function useBrokerageAccounts(userId?: string) {
  const [accounts, setAccounts] = useState<BrokerageAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("brokerage_accounts")
      .select("id, account_id, label, is_default, created_at")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (!error) {
      const rows = (data ?? []) as BrokerageAccount[];
      setAccounts(rows);
      setSelectedId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : (rows[0]?.id ?? null)));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const link = useCallback(
    async (accountId: string, label: string) => {
      if (!userId) return;
      const { error } = await supabase.from("brokerage_accounts").insert({
        user_id: userId,
        account_id: accountId.trim(),
        label: label.trim() || "Brokerage account",
        is_default: accounts.length === 0,
      });
      if (error) {
        toast.error(error.code === "23505" ? "That account is already linked" : error.message);
        return;
      }
      toast.success("Brokerage account linked");
      await refresh();
    },
    [userId, accounts.length, refresh],
  );

  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  return { accounts, selected, selectedId, setSelectedId, loading, link, refresh };
}

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

/** One-time glass modal for linking a brokerage account. */
export function LinkAccountModal({
  open,
  onClose,
  onLink,
}: {
  open: boolean;
  onClose: () => void;
  onLink: (accountId: string, label: string) => Promise<void> | void;
}) {
  const [accountId, setAccountId] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setAccountId("");
      setLabel("");
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!accountId.trim()) {
      toast.error("Enter your brokerage account ID");
      return;
    }
    setSaving(true);
    try {
      await onLink(accountId, label);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Link brokerage account"
    >
      <div
        className="glass-gold w-full max-w-[430px] rounded-t-3xl anim-fade-up"
        style={{ padding: "20px 16px 28px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.18em" }}>
            LINK BROKERAGE ACCOUNT
          </p>
          <button onClick={onClose} className="t-gold" style={{ fontSize: 22, background: "none", border: "none" }} aria-label="Close">
            ×
          </button>
        </div>

        <p className="t-serif t-muted" style={{ fontSize: 12, marginBottom: 14 }}>
          Enter it once — we&apos;ll use it automatically for every future order.
        </p>

        <label style={labelStyle} htmlFor="brokerage-account-id">Account ID</label>
        <input
          id="brokerage-account-id"
          autoFocus
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          placeholder="acc_…"
          style={inputStyle}
        />

        <label style={{ ...labelStyle, marginTop: 12 }} htmlFor="brokerage-account-label">Label</label>
        <input
          id="brokerage-account-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Main account"
          style={inputStyle}
        />

        <button
          onClick={submit}
          disabled={saving}
          className="btn-brass"
          style={{ marginTop: 16, width: "100%", padding: "12px 16px", fontSize: 11, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Linking…" : "Link account"}
        </button>
      </div>
    </div>
  );
}

/** Tappable chip row for switching between linked accounts. */
export function AccountChips({
  accounts,
  selectedId,
  onSelect,
  onAdd,
}: {
  accounts: BrokerageAccount[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto" style={{ paddingBottom: 2 }}>
      {accounts.map((a) => {
        const active = a.id === selectedId;
        return (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            className="t-mono"
            style={{
              flexShrink: 0,
              padding: "7px 12px",
              borderRadius: 999,
              border: `1px solid rgba(201,168,76,${active ? 0.55 : 0.2})`,
              background: active ? "rgba(201,168,76,0.16)" : "rgba(255,255,255,0.03)",
              color: active ? "rgb(235,215,165)" : "rgba(200,175,130,0.75)",
              fontSize: 10,
              letterSpacing: "0.08em",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {a.label} · {a.account_id}
          </button>
        );
      })}
      <button
        onClick={onAdd}
        className="t-mono"
        style={{
          flexShrink: 0,
          padding: "7px 12px",
          borderRadius: 999,
          border: "1px dashed rgba(201,168,76,0.35)",
          background: "none",
          color: "rgba(200,175,130,0.75)",
          fontSize: 10,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        + Add
      </button>
    </div>
  );
}
