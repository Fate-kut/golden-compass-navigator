import { createFileRoute } from "@tanstack/react-router";
import { rateLimit } from "@/lib/rate-limit.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateRequest, json } from "@/lib/auth.server";

// Move funds from user wallet into a pool. Body: { pool_id, amount }
export const Route = createFileRoute("/api/wallet-invest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authResult = await authenticateRequest(request);
          if (authResult instanceof Response) return authResult;
          const { userId } = authResult;
          if (!rateLimit(userId, 10, 60_000)) return json({ error: "Too many requests" }, 429);

          const body = (await request.json()) as { pool_id?: string; amount?: number };
          const pool_id = String(body.pool_id ?? "");
          const amount = Math.floor(Number(body.amount));
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pool_id)) return json({ error: "Invalid pool_id format" }, 400);
          if (amount > 10_000_000) return json({ error: "Amount exceeds maximum limit of KES 10,000,000" }, 400);
          if (!pool_id) return json({ error: "pool_id required" }, 400);
          if (!amount || amount < 1) return json({ error: "Amount must be at least KES 1" }, 400);

          const { data: pool } = await supabaseAdmin
            .from("investment_pools")
            .select("id, name, current_nav, min_investment, is_active")
            .eq("id", pool_id)
            .maybeSingle();
          if (!pool || !pool.is_active) return json({ error: "Pool not available" }, 400);
          if (amount < Number(pool.min_investment ?? 0))
            return json({ error: `Minimum investment is KES ${pool.min_investment}` }, 400);

          const { data: new_balance, error: debitError } = await supabaseAdmin.rpc('debit_wallet', { p_user_id: userId, p_amount: amount });
          if (debitError) return json({ error: debitError.message }, 400);

          // Credit investment
          const nav = Number(pool.current_nav ?? 100);
          const units = Math.round((amount / nav) * 1_000_000) / 1_000_000;
          const { data: existing } = await supabaseAdmin
            .from("user_investments")
            .select("id, invested_amount, current_value, units_owned")
            .eq("user_id", userId)
            .eq("pool_id", pool_id)
            .maybeSingle();
          if (existing) {
            await supabaseAdmin
              .from("user_investments")
              .update({
                invested_amount: Number(existing.invested_amount ?? 0) + amount,
                current_value: Number(existing.current_value ?? 0) + amount,
                units_owned: Number(existing.units_owned ?? 0) + units,
              })
              .eq("id", existing.id);
          } else {
            await supabaseAdmin.from("user_investments").insert({
              user_id: userId,
              pool_id,
              invested_amount: amount,
              current_value: amount,
              units_owned: units,
            });
          }

          // Record transaction (already-confirmed wallet transfer)
          await supabaseAdmin.from("transactions").insert({
            user_id: userId,
            pool_id,
            amount,
            type: "invest",
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
          });

          return json({ success: true, new_balance });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
        }
      },
    },
  },
});


