import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Initiate an M-Pesa STK Push for a deposit. Authenticated users only.
// Body: { amount: number, pool_id: string, phone: string }
export const Route = createFileRoute("/api/mpesa-stk")({
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

          const body = (await request.json()) as { amount?: number; pool_id?: string; phone?: string };
          const amount = Math.floor(Number(body.amount));
          const pool_id = String(body.pool_id ?? "");
          const phoneRaw = String(body.phone ?? "").replace(/\D/g, "");

          if (!amount || amount < 1) return json({ error: "Amount must be at least KES 1" }, 400);
          if (!pool_id) return json({ error: "pool_id required" }, 400);
          // Normalize phone: 07XX → 2547XX, 7XX → 2547XX, +2547XX → 2547XX
          let phone = phoneRaw;
          if (phone.startsWith("0")) phone = "254" + phone.slice(1);
          else if (phone.startsWith("7") || phone.startsWith("1")) phone = "254" + phone;
          if (!/^254(7|1)\d{8}$/.test(phone)) return json({ error: "Invalid Kenyan phone number" }, 400);

          // Verify pool & min investment
          const { data: pool } = await supabaseAdmin
            .from("investment_pools")
            .select("id, min_investment, is_active, name")
            .eq("id", pool_id)
            .maybeSingle();
          if (!pool || !pool.is_active) return json({ error: "Pool not available" }, 400);
          if (amount < Number(pool.min_investment ?? 0))
            return json({ error: `Minimum investment is KES ${pool.min_investment}` }, 400);

          // Daraja credentials
          const consumerKey = process.env.MPESA_CONSUMER_KEY;
          const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
          const shortcode = process.env.MPESA_SHORTCODE;
          const passkey = process.env.MPESA_PASSKEY;
          const callbackUrl = process.env.MPESA_CALLBACK_URL;
          if (!consumerKey || !consumerSecret || !shortcode || !passkey || !callbackUrl) {
            return json({ error: "M-Pesa credentials not configured" }, 500);
          }

          // OAuth token (sandbox)
          const tokenRes = await fetch(
            "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
            { headers: { Authorization: "Basic " + btoa(`${consumerKey}:${consumerSecret}`) } }
          );
          if (!tokenRes.ok) return json({ error: "M-Pesa auth failed" }, 502);
          const { access_token } = (await tokenRes.json()) as { access_token: string };

          const ts = new Date()
            .toISOString()
            .replace(/[-:T.Z]/g, "")
            .slice(0, 14);
          const password = btoa(`${shortcode}${passkey}${ts}`);

          // Create pending transaction first so callback can find it
          const { data: tx, error: txErr } = await supabaseAdmin
            .from("transactions")
            .insert({
              user_id: userId,
              pool_id,
              amount,
              type: "deposit",
              status: "pending",
            })
            .select("id")
            .single();
          if (txErr || !tx) return json({ error: "Failed to record transaction" }, 500);

          const stkBody = {
            BusinessShortCode: shortcode,
            Password: password,
            Timestamp: ts,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: phone,
            PartyB: shortcode,
            PhoneNumber: phone,
            CallBackURL: callbackUrl,
            AccountReference: `GC-${tx.id.slice(0, 8)}`,
            TransactionDesc: `Deposit to ${pool.name}`,
          };

          const stkRes = await fetch("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${access_token}`,
            },
            body: JSON.stringify(stkBody),
          });
          const stkData = (await stkRes.json()) as {
            ResponseCode?: string;
            CheckoutRequestID?: string;
            errorMessage?: string;
            ResponseDescription?: string;
          };

          if (!stkRes.ok || stkData.ResponseCode !== "0") {
            await supabaseAdmin
              .from("transactions")
              .update({ status: "failed" })
              .eq("id", tx.id);
            return json(
              { error: stkData.errorMessage || stkData.ResponseDescription || "STK Push failed" },
              502
            );
          }

          await supabaseAdmin
            .from("transactions")
            .update({ mpesa_checkout_id: stkData.CheckoutRequestID ?? null })
            .eq("id", tx.id);

          return json({
            success: true,
            transaction_id: tx.id,
            checkout_id: stkData.CheckoutRequestID,
            message: "Check your phone for the M-Pesa prompt",
          });
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
