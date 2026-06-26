import { createFileRoute } from "@tanstack/react-router";
import { rateLimit } from "@/lib/rate-limit.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateRequest, json } from "@/lib/auth.server";
import { getMpesaUrls } from "@/lib/mpesa-config.server";

// Initiate an M-Pesa STK Push for a deposit. Authenticated users only.
// Body: { amount: number, pool_id: string, phone: string }
export const Route = createFileRoute("/api/mpesa-stk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authResult = await authenticateRequest(request);
          if (authResult instanceof Response) return authResult;
          const { userId } = authResult;
          if (!rateLimit(userId, 5, 60_000)) return json({ error: "Too many requests" }, 429);

          const body = (await request.json()) as { amount?: number; phone?: string };
          const amount = Math.floor(Number(body.amount));
          // Deposits ALWAYS go to wallet — pool_id is ignored on the server.
          const pool_id: string | null = null;
          const phoneRaw = String(body.phone ?? "").replace(/\D/g, "");

          if (!amount || amount < 1) return json({ error: "Amount must be at least KES 1" }, 400);
          if (amount > 150_000) return json({ error: "Amount exceeds M-Pesa limit of KES 150,000" }, 400);
          // Normalize phone
          let phone = phoneRaw;
          if (phone.startsWith("0")) phone = "254" + phone.slice(1);
          else if (phone.startsWith("7") || phone.startsWith("1")) phone = "254" + phone;
          if (!/^254(7|1)\d{8}$/.test(phone)) return json({ error: "Invalid Kenyan phone number" }, 400);

          // Daraja credentials
          const consumerKey = process.env.MPESA_CONSUMER_KEY;
          const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
          const shortcode = process.env.MPESA_SHORTCODE;
          const passkey = process.env.MPESA_PASSKEY;
          const callbackUrl = process.env.MPESA_CALLBACK_URL;
          if (!consumerKey || !consumerSecret || !shortcode || !passkey || !callbackUrl) {
            return json({ error: "M-Pesa credentials not configured" }, 500);
          }

          // OAuth token
          const mpesaUrls = getMpesaUrls();
          const tokenRes = await fetch(
            mpesaUrls.oauth,
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
            TransactionDesc: `Wallet top-up`,
          };

          const stkRes = await fetch(mpesaUrls.stkPush, {
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
            const reason =
              stkData.errorMessage || stkData.ResponseDescription || "STK Push failed";
            console.error("[mpesa-stk] failure", { status: stkRes.status, body: stkData });
            await supabaseAdmin
              .from("transactions")
              .update({ status: "failed", mpesa_reference: `STK: ${reason}`.slice(0, 200) })
              .eq("id", tx.id);
            return json({ error: reason }, 502);
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


