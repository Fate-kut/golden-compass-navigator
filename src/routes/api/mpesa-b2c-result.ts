import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Public B2C result callback. Safaricom POSTs the payout outcome here.
// Body: { Result: { ResultCode, ResultDesc, ConversationID, OriginatorConversationID, ResultParameters?, ReferenceData? } }
export const Route = createFileRoute("/api/mpesa-b2c-result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = (await request.json()) as {
            Result?: {
              ResultCode?: number;
              ResultDesc?: string;
              ConversationID?: string;
              OriginatorConversationID?: string;
              ResultParameters?: { ResultParameter?: Array<{ Key: string; Value?: string | number }> };
              ReferenceData?: { ReferenceItem?: { Key: string; Value?: string } };
            };
          };

          const result = payload?.Result;
          if (!result) return ack();

          // Match by Conversation ID (saved on tx.mpesa_checkout_id) or by Occasion (tx.id) in ReferenceData
          let tx: { id: string; user_id: string; pool_id: string | null; amount: number; status: string | null } | null = null;

          if (result.ConversationID) {
            const { data } = await supabaseAdmin
              .from("transactions")
              .select("id, user_id, pool_id, amount, status")
              .eq("mpesa_checkout_id", result.ConversationID)
              .maybeSingle();
            tx = data ?? null;
          }
          if (!tx && result.OriginatorConversationID) {
            // Originator id is "GC-WD-<tx.id>"
            const m = result.OriginatorConversationID.match(/^GC-WD-(.+)$/);
            if (m) {
              const { data } = await supabaseAdmin
                .from("transactions")
                .select("id, user_id, pool_id, amount, status")
                .eq("id", m[1])
                .maybeSingle();
              tx = data ?? null;
            }
          }

          if (!tx) return ack();
          if (tx.status === "confirmed" || tx.status === "failed") return ack(); // idempotent

          if (result.ResultCode === 0) {
            // Success — extract receipt
            const items = result.ResultParameters?.ResultParameter ?? [];
            const receipt = items.find((i) => i.Key === "TransactionReceipt")?.Value as
              | string
              | undefined;

            await supabaseAdmin
              .from("transactions")
              .update({
                status: "confirmed",
                confirmed_at: new Date().toISOString(),
                mpesa_reference: receipt ?? null,
              })
              .eq("id", tx.id);
            return ack();
          }

          // Failure → refund units, mark failed
          await refundUnits(tx);
          await supabaseAdmin
            .from("transactions")
            .update({
              status: "failed",
              mpesa_reference: `B2C failed: ${result.ResultDesc ?? "unknown"}`.slice(0, 200),
            })
            .eq("id", tx.id);

          return ack();
        } catch {
          return ack(); // Always 200 to Safaricom
        }
      },
      GET: async () => ack(),
    },
  },
});

async function refundUnits(tx: {
  user_id: string;
  pool_id: string | null;
  amount: number;
}) {
  if (!tx.pool_id) return;
  const [{ data: pool }, { data: inv }] = await Promise.all([
    supabaseAdmin.from("investment_pools").select("current_nav").eq("id", tx.pool_id).maybeSingle(),
    supabaseAdmin
      .from("user_investments")
      .select("id, current_value, units_owned, invested_amount")
      .eq("user_id", tx.user_id)
      .eq("pool_id", tx.pool_id)
      .maybeSingle(),
  ]);
  const nav = Number(pool?.current_nav ?? 100);
  const units = Number(tx.amount) / nav;
  if (inv) {
    await supabaseAdmin
      .from("user_investments")
      .update({
        current_value: Number(inv.current_value ?? 0) + Number(tx.amount),
        units_owned: Number(inv.units_owned ?? 0) + units,
        invested_amount: Number(inv.invested_amount ?? 0) + Number(tx.amount),
      })
      .eq("id", inv.id);
  } else {
    await supabaseAdmin.from("user_investments").insert({
      user_id: tx.user_id,
      pool_id: tx.pool_id,
      current_value: Number(tx.amount),
      units_owned: units,
      invested_amount: Number(tx.amount),
    });
  }
}

function ack() {
  return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
