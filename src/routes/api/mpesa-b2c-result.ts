import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { json } from "@/lib/auth.server";
import { verifySafaricomOrigin } from "@/lib/mpesa-security.server";
import { refundUnits } from "@/lib/investment-utils.server";

// Public B2C result callback. Safaricom POSTs the payout outcome here.
// Body: { Result: { ResultCode, ResultDesc, ConversationID, OriginatorConversationID, ResultParameters?, ReferenceData? } }
export const Route = createFileRoute("/api/mpesa-b2c-result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!verifySafaricomOrigin(request)) {
            return new Response("Forbidden", { status: 403 });
          }

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


function ack() {
  return json({ ResultCode: 0, ResultDesc: "Accepted" });
}
