import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Admin marks a withdrawal as confirmed (paid out off-app) or failed (refund units).
// Body: { transaction_id: string, action: "approve" | "reject", mpesa_reference?: string }
export const Route = createFileRoute("/api/withdraw-approve")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
          if (!token) return json({ error: "Unauthorized" }, 401);

          const userClient = createClient<Database>(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
          );
          const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
          if (cErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
          const adminId = claims.claims.sub;

          const { data: roleRow } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", adminId)
            .eq("role", "admin")
            .maybeSingle();
          if (!roleRow) return json({ error: "Forbidden" }, 403);

          const body = (await request.json()) as {
            transaction_id?: string;
            action?: "approve" | "reject";
            mpesa_reference?: string;
          };
          const txId = String(body.transaction_id ?? "");
          const action = body.action;
          if (!txId || (action !== "approve" && action !== "reject"))
            return json({ error: "Invalid input" }, 400);

          const { data: tx } = await supabaseAdmin
            .from("transactions")
            .select("id, user_id, pool_id, amount, status, type")
            .eq("id", txId)
            .maybeSingle();
          if (!tx) return json({ error: "Transaction not found" }, 404);
          if (tx.type !== "withdrawal") return json({ error: "Not a withdrawal" }, 400);
          if (tx.status !== "pending") return json({ error: "Already processed" }, 400);

          if (action === "approve") {
            await supabaseAdmin
              .from("transactions")
              .update({
                status: "confirmed",
                confirmed_at: new Date().toISOString(),
                mpesa_reference: body.mpesa_reference ?? null,
              })
              .eq("id", txId);
            return json({ success: true, status: "confirmed" });
          }

          // Reject → refund units back to user_investments
          if (tx.pool_id) {
            const [{ data: pool }, { data: inv }] = await Promise.all([
              supabaseAdmin
                .from("investment_pools")
                .select("current_nav")
                .eq("id", tx.pool_id)
                .maybeSingle(),
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
          await supabaseAdmin.from("transactions").update({ status: "failed" }).eq("id", txId);
          return json({ success: true, status: "failed" });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          return json({ error: msg }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
