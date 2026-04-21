import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Move funds from user wallet into a pool. Body: { pool_id, amount }
export const Route = createFileRoute("/api/wallet-invest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
          if (!token) return json({ error: "Unauthorized" }, 401);

          const SUPABASE_URL = process.env.SUPABASE_URL!;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
          if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
          const userId = claims.claims.sub;

          const body = (await request.json()) as { pool_id?: string; amount?: number };
          const pool_id = String(body.pool_id ?? "");
          const amount = Math.floor(Number(body.amount));
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

          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("wallet_balance")
            .eq("id", userId)
            .maybeSingle();
          const bal = Number(prof?.wallet_balance ?? 0);
          if (bal < amount) return json({ error: "Insufficient wallet balance" }, 400);

          // Debit wallet
          await supabaseAdmin
            .from("profiles")
            .update({ wallet_balance: bal - amount })
            .eq("id", userId);

          // Credit investment
          const nav = Number(pool.current_nav ?? 100);
          const units = amount / nav;
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

          return json({ success: true, new_balance: bal - amount });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
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
