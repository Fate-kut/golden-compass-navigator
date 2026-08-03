import { createFileRoute } from "@tanstack/react-router";
import { rateLimit } from "@/lib/rate-limit.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateRequest, json } from "@/lib/auth.server";
import { requireFreshAal2 } from "@/lib/mfa.server";
import { checkTransactionLimit } from "@/lib/limits.server";
import { screenTransaction } from "@/lib/aml.server";

// Body: { pool_id: string, amount: number }
// Enforces holding period & exit fee. Creates a 'pending' withdrawal transaction
// that admins approve from /admin/transactions (off-app B2C payout).
export const Route = createFileRoute("/api/withdraw-request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authResult = await authenticateRequest(request);
          if (authResult instanceof Response) return authResult;
          const { userId, claims } = authResult;
          if (!rateLimit(userId, 5, 60_000)) return json({ error: "Too many requests" }, 429);

          const mfaBlock = await requireFreshAal2(userId, claims);
          if (mfaBlock) return mfaBlock;

          const body = (await request.json()) as { pool_id?: string; amount?: number; phone?: string };
          const pool_id = String(body.pool_id ?? "");
          const amount = Number(body.amount);
          if (amount <= 0) return json({ error: "Amount must be greater than 0" }, 400);
          const phoneRaw = String(body.phone ?? "").replace(/\D/g, "");
          let phone = phoneRaw;
          if (phone.startsWith("0")) phone = "254" + phone.slice(1);
          else if (phone.startsWith("7") || phone.startsWith("1")) phone = "254" + phone;
          if (!pool_id || !amount || amount <= 0) return json({ error: "Invalid input" }, 400);
          if (!/^254(7|1)\d{8}$/.test(phone)) return json({ error: "Invalid M-Pesa phone number" }, 400);

          // Compliance caps (placeholder thresholds — TBD).
          const limit = await checkTransactionLimit(userId, "withdrawal", amount);
          if (!limit.ok) return json({ error: limit.error }, 400);

          const [{ data: pool }, { data: inv }] = await Promise.all([
            supabaseAdmin
              .from("investment_pools")
              .select("id, name, exit_fee_percent, holding_period_days")
              .eq("id", pool_id)
              .maybeSingle(),
            supabaseAdmin
              .from("user_investments")
              .select("id, current_value, units_owned, invested_amount, created_at")
              .eq("user_id", userId)
              .eq("pool_id", pool_id)
              .maybeSingle(),
          ]);
          if (!pool) return json({ error: "Pool not found" }, 404);
          if (!inv) return json({ error: "You have no holdings in this pool" }, 400);

          const currentValue = Number(inv.current_value ?? 0);
          if (amount > currentValue)
            return json({ error: `Maximum withdrawable: KES ${currentValue.toFixed(2)}` }, 400);

          // Holding period
          const lockDays = Number(pool.holding_period_days ?? 0);
          if (lockDays > 0 && inv.created_at) {
            const ageMs = Date.now() - new Date(inv.created_at).getTime();
            const daysHeld = ageMs / (1000 * 60 * 60 * 24);
            if (daysHeld < lockDays) {
              const remaining = Math.ceil(lockDays - daysHeld);
              return json(
                { error: `Locked for ${remaining} more day${remaining === 1 ? "" : "s"}` },
                400
              );
            }
          }

          // Exit fee
          const feePct = Number(pool.exit_fee_percent ?? 0);
          const fee = (amount * feePct) / 100;
          const net = amount - fee;

          // Create pending withdrawal — admin approves from /admin/transactions
          const { data: tx, error: txErr } = await supabaseAdmin
            .from("transactions")
            .insert({
              user_id: userId,
              pool_id,
              amount: net, // net amount paid out
              type: "withdrawal",
              status: "pending",
              payout_phone: phone,
            })
            .select("id")
            .single();
          if (txErr || !tx) return json({ error: "Failed to record request" }, 500);

          await screenTransaction({ userId, transactionId: tx.id, amount, kind: "withdrawal" });

          // Reserve units immediately so balance can't be double-spent
          const ratio = currentValue > 0 ? amount / currentValue : 0;
          const unitsBurned = Math.round((Number(inv.units_owned ?? 0) * ratio) * 1_000_000) / 1_000_000;
          await supabaseAdmin
            .from("user_investments")
            .update({
              current_value: currentValue - amount,
              units_owned: Number(inv.units_owned ?? 0) - unitsBurned,
              invested_amount: Math.max(0, Number(inv.invested_amount ?? 0) - amount),
            })
            .eq("id", inv.id);

          return json({
            success: true,
            transaction_id: tx.id,
            gross: amount,
            fee,
            net,
            message: `Withdrawal of KES ${net.toFixed(2)} requested (KES ${fee.toFixed(2)} exit fee). Pending admin approval.`,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          return json({ error: msg }, 500);
        }
      },
    },
  },
});


