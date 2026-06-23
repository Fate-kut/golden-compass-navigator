import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateRequest, json } from "@/lib/auth.server";
import { getMpesaUrls } from "@/lib/mpesa-config.server";

// Query M-Pesa STK Push status for a transaction.
// Body: { transaction_id: string }
// Returns: { status: "pending" | "confirmed" | "failed" | "cancelled", result_desc?: string }
export const Route = createFileRoute("/api/mpesa-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authResult = await authenticateRequest(request);
          if (authResult instanceof Response) return authResult;
          const { userId } = authResult;

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
          const mpesaUrls = getMpesaUrls();
          const tokenRes = await fetch(
            mpesaUrls.oauth,
            { headers: { Authorization: "Basic " + btoa(`${consumerKey}:${consumerSecret}`) } },
          );
          if (!tokenRes.ok) return json({ status: "pending" });
          const { access_token } = (await tokenRes.json()) as { access_token: string };

          const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
          const password = btoa(`${shortcode}${passkey}${ts}`);

          const queryRes = await fetch(
            mpesaUrls.stkQuery,
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


