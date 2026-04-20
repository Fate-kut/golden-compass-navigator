import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Query M-Pesa STK Push status for a transaction.
// Body: { transaction_id: string }
// Returns: { status: "pending" | "confirmed" | "failed" | "cancelled", result_desc?: string }
export const Route = createFileRoute("/api/mpesa-status")({
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

          const body = (await request.json()) as { transaction_id?: string };
          const txId = String(body.transaction_id ?? "");
          if (!txId) return json({ error: "transaction_id required" }, 400);

          const { data: tx } = await supabaseAdmin
            .from("transactions")
            .select("id, user_id, pool_id, amount, status, type, mpesa_checkout_id")
            .eq("id", txId)
            .maybeSingle();

          if (!tx || tx.user_id !== userId) return json({ error: "Not found" }, 404);

          // Already settled — return current state
          if (tx.status === "confirmed" || tx.status === "failed" || tx.status === "cancelled") {
            return json({ status: tx.status });
          }

          if (!tx.mpesa_checkout_id) {
            return json({ status: "pending" });
          }

          // Daraja credentials
          const consumerKey = process.env.MPESA_CONSUMER_KEY;
          const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
          const shortcode = process.env.MPESA_SHORTCODE;
          const passkey = process.env.MPESA_PASSKEY;
          if (!consumerKey || !consumerSecret || !shortcode || !passkey) {
            return json({ status: "pending" });
          }

          // OAuth token
          const tokenRes = await fetch(
            "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
            { headers: { Authorization: "Basic " + btoa(`${consumerKey}:${consumerSecret}`) } },
          );
          if (!tokenRes.ok) return json({ status: "pending" });
          const { access_token } = (await tokenRes.json()) as { access_token: string };

          const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
          const password = btoa(`${shortcode}${passkey}${ts}`);

          const queryRes = await fetch(
            "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${access_token}`,
              },
              body: JSON.stringify({
                BusinessShortCode: shortcode,
                Password: password,
                Timestamp: ts,
                CheckoutRequestID: tx.mpesa_checkout_id,
              }),
            },
          );

          const queryData = (await queryRes.json()) as {
            ResultCode?: string;
            ResultDesc?: string;
            errorCode?: string;
            errorMessage?: string;
          };

          // ResultCode "0" = success; "1032" = cancelled by user; "1037" = timeout; others = failed
          // errorCode "500.001.1001" = still processing
          if (queryData.errorCode === "500.001.1001") {
            return json({ status: "pending", result_desc: "Awaiting user PIN" });
          }

          const code = queryData.ResultCode;
          if (code === "0") {
            // Success — callback should also fire, but mark confirmed if not already
            // (Don't credit units here; callback handles unit math with receipt)
            return json({ status: "confirmed", result_desc: queryData.ResultDesc });
          }

          // Cancelled or failed
          const isCancelled = code === "1032";
          const newStatus = isCancelled ? "cancelled" : "failed";
          await supabaseAdmin
            .from("transactions")
            .update({ status: newStatus })
            .eq("id", tx.id)
            .eq("status", "pending"); // only if still pending

          return json({ status: newStatus, result_desc: queryData.ResultDesc });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          return json({ error: msg, status: "pending" }, 500);
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
