import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { json } from "@/lib/auth.server";
import { verifySafaricomOrigin } from "@/lib/mpesa-security.server";

// Public callback Safaricom POSTs to. No auth header — relies on CheckoutRequestID match.
// Body shape: { Body: { stkCallback: { ResultCode, CheckoutRequestID, CallbackMetadata? } } }
export const Route = createFileRoute("/api/mpesa-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!verifySafaricomOrigin(request)) {
            return new Response("Forbidden", { status: 403 });
          }

          const payload = (await request.json()) as {
            Body?: {
              stkCallback?: {
                ResultCode?: number;
                ResultDesc?: string;
                CheckoutRequestID?: string;
                CallbackMetadata?: { Item?: Array<{ Name: string; Value?: string | number }> };
              };
            };
          };

          const cb = payload?.Body?.stkCallback;
          if (!cb?.CheckoutRequestID) {
            return ack();
          }

          // Locate transaction
          const { data: tx } = await supabaseAdmin
            .from("transactions")
            .select("id, user_id, pool_id, amount, status, type")
            .eq("mpesa_checkout_id", cb.CheckoutRequestID)
            .maybeSingle();

          if (!tx) return ack();
          if (tx.status === "confirmed") return ack(); // idempotent

          if (cb.ResultCode !== 0) {
            // 1032 = user cancelled; otherwise generic failure
            const newStatus = cb.ResultCode === 1032 ? "cancelled" : "failed";
            await supabaseAdmin
              .from("transactions")
              .update({ status: newStatus })
              .eq("id", tx.id);
            return ack();
          }

          // Extract M-Pesa receipt
          const items = cb.CallbackMetadata?.Item ?? [];
          const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value as
            | string
            | undefined;

          // Mark transaction confirmed
          await supabaseAdmin
            .from("transactions")
            .update({
              status: "confirmed",
              confirmed_at: new Date().toISOString(),
              mpesa_reference: receipt ?? null,
            })
            .eq("id", tx.id);

          // Deposits ALWAYS credit the wallet — never touch user_investments here.
          // Pool investing happens separately via /api/wallet-invest.
          if (tx.type === "deposit") {
            const { error: creditErr } = await (supabaseAdmin.rpc as any)("credit_wallet", {
              p_user_id: tx.user_id,
              p_amount: Number(tx.amount),
            });
            if (creditErr) {
              console.error("[mpesa-callback] credit_wallet failed", creditErr);
            }
            await supabaseAdmin.from("notifications").insert({
              user_id: tx.user_id,
              type: "deposit",
              title: "Wallet credited",
              body: `KES ${Number(tx.amount).toLocaleString()} added to your wallet.`,
            });
          }

          return ack();
        } catch {
          return ack(); // Always 200 to Safaricom
        }
      },
      // Safaricom may probe with GET
      GET: async () => ack(),
    },
  },
});

function ack() {
  return json({ ResultCode: 0, ResultDesc: "Accepted" });
}
