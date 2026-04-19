import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Public callback Safaricom POSTs to. No auth header — relies on CheckoutRequestID match.
// Body shape: { Body: { stkCallback: { ResultCode, CheckoutRequestID, CallbackMetadata? } } }
export const Route = createFileRoute("/api/mpesa-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
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
            await supabaseAdmin
              .from("transactions")
              .update({ status: "failed" })
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

          // Apply to user_investments (deposit only — withdrawals don't go through STK callback)
          if (tx.type === "deposit" && tx.pool_id) {
            const { data: pool } = await supabaseAdmin
              .from("investment_pools")
              .select("current_nav")
              .eq("id", tx.pool_id)
              .maybeSingle();
            const nav = Number(pool?.current_nav ?? 100);
            const units = Number(tx.amount) / nav;

            const { data: existing } = await supabaseAdmin
              .from("user_investments")
              .select("id, invested_amount, current_value, units_owned")
              .eq("user_id", tx.user_id)
              .eq("pool_id", tx.pool_id)
              .maybeSingle();

            if (existing) {
              await supabaseAdmin
                .from("user_investments")
                .update({
                  invested_amount: Number(existing.invested_amount ?? 0) + Number(tx.amount),
                  current_value: Number(existing.current_value ?? 0) + Number(tx.amount),
                  units_owned: Number(existing.units_owned ?? 0) + units,
                })
                .eq("id", existing.id);
            } else {
              await supabaseAdmin.from("user_investments").insert({
                user_id: tx.user_id,
                pool_id: tx.pool_id,
                invested_amount: Number(tx.amount),
                current_value: Number(tx.amount),
                units_owned: units,
              });
            }
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
  return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
