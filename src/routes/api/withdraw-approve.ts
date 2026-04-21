import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Admin approves a withdrawal → automatically calls M-Pesa B2C to pay out.
// Body: { transaction_id: string, action: "approve" | "reject" }
// On approve: triggers B2C; the result callback (/api/mpesa-b2c-result) finalizes
// the transaction. If the B2C call itself fails, units are auto-refunded.
// On reject: refunds units, marks failed.
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
            {
              global: { headers: { Authorization: `Bearer ${token}` } },
              auth: { persistSession: false, autoRefreshToken: false },
            },
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
          };
          const txId = String(body.transaction_id ?? "");
          const action = body.action;
          if (!txId || (action !== "approve" && action !== "reject"))
            return json({ error: "Invalid input" }, 400);

          const { data: tx } = await supabaseAdmin
            .from("transactions")
            .select("id, user_id, pool_id, amount, status, type, payout_phone")
            .eq("id", txId)
            .maybeSingle();
          if (!tx) return json({ error: "Transaction not found" }, 404);
          if (tx.type !== "withdrawal") return json({ error: "Not a withdrawal" }, 400);
          if (tx.status !== "pending") return json({ error: "Already processed" }, 400);

          if (action === "reject") {
            await refundUnits(tx);
            await supabaseAdmin.from("transactions").update({ status: "failed" }).eq("id", txId);
            return json({ success: true, status: "failed" });
          }

          // ---- APPROVE → trigger B2C payout ----
          if (!tx.payout_phone) {
            return json({ error: "Missing payout phone on transaction" }, 400);
          }

          // Sandbox B2C defaults (override via env when going live)
          const initiator = process.env.MPESA_INITIATOR_NAME || "testapi";
          const securityCredential =
            process.env.MPESA_SECURITY_CREDENTIAL ||
            // Pre-encrypted "Safaricom999!*!" for the sandbox cert
            "VlmZbZ4HgZeC1qMXcMU2Z4f5o3vbHXSrMrEhlIEGu+Sx5TZkO+0rlT8I7HoIM2eoCK1m8r4rh8XmlKlhmZ9mTtxk8Q5dCJVvZBzNL2jBXf6cQB6/2XSgqXPgM7vUq+1WVoIqCNsFPvjjkkn4lwHB7GPV/3a4bTl4aCOaUqXr+5oVy7VlPCXOzCdVkzc9pSh+jcRLFLSnP4PZxKOIJsyMIQrEqTVj2N5K1CWl6Hbdh2T6c0bXhz2sxTV6HrhhzXIHGnj+MYEyKy1xAWBC8c3p0lH8oAZJSL4FtAcW7lEEMmENfP0+5pY1+1n0mlS8YjLqMeXFIkkRywrkMwZUySE5DA==";
          const b2cShortcode = process.env.MPESA_B2C_SHORTCODE || "600000";
          const consumerKey = process.env.MPESA_CONSUMER_KEY;
          const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
          const callbackBase = process.env.MPESA_CALLBACK_URL; // e.g. https://<host>/api/mpesa-callback

          if (!consumerKey || !consumerSecret || !callbackBase) {
            return json({ error: "M-Pesa credentials not configured" }, 500);
          }

          // Derive B2C result/timeout URLs from the existing callback URL host
          let resultUrl = "";
          let timeoutUrl = "";
          try {
            const u = new URL(callbackBase);
            resultUrl = `${u.origin}/api/mpesa-b2c-result`;
            timeoutUrl = `${u.origin}/api/mpesa-b2c-result`;
          } catch {
            return json({ error: "Invalid MPESA_CALLBACK_URL" }, 500);
          }

          // Mark processing so re-clicks don't double-fire
          await supabaseAdmin
            .from("transactions")
            .update({ status: "processing" })
            .eq("id", txId);

          // OAuth token
          const tokRes = await fetch(
            "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
            { headers: { Authorization: "Basic " + btoa(`${consumerKey}:${consumerSecret}`) } },
          );
          if (!tokRes.ok) {
            await refundAndFail(tx, "M-Pesa auth failed");
            return json({ error: "M-Pesa auth failed" }, 502);
          }
          const { access_token } = (await tokRes.json()) as { access_token: string };

          const b2cBody = {
            OriginatorConversationID: `GC-WD-${tx.id}`,
            InitiatorName: initiator,
            SecurityCredential: securityCredential,
            CommandID: "BusinessPayment",
            Amount: Math.floor(Number(tx.amount)),
            PartyA: b2cShortcode,
            PartyB: tx.payout_phone,
            Remarks: `Golden Compass withdrawal ${tx.id.slice(0, 8)}`,
            QueueTimeOutURL: timeoutUrl,
            ResultURL: resultUrl,
            Occasion: tx.id, // returned in result so we can match
          };

          const b2cRes = await fetch(
            "https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${access_token}`,
              },
              body: JSON.stringify(b2cBody),
            },
          );
          const b2cData = (await b2cRes.json()) as {
            ResponseCode?: string;
            ConversationID?: string;
            errorMessage?: string;
            ResponseDescription?: string;
          };

          if (!b2cRes.ok || b2cData.ResponseCode !== "0") {
            await refundAndFail(
              tx,
              b2cData.errorMessage || b2cData.ResponseDescription || "B2C request rejected",
            );
            return json(
              {
                error:
                  b2cData.errorMessage || b2cData.ResponseDescription || "B2C request rejected",
              },
              502,
            );
          }

          // Store conversation id so the result callback can match
          await supabaseAdmin
            .from("transactions")
            .update({ mpesa_checkout_id: b2cData.ConversationID ?? null })
            .eq("id", tx.id);

          return json({
            success: true,
            status: "processing",
            message: "Payout initiated. The user will be paid within seconds.",
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          return json({ error: msg }, 500);
        }
      },
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

async function refundAndFail(
  tx: { id: string; user_id: string; pool_id: string | null; amount: number },
  reason: string,
) {
  await refundUnits(tx);
  await supabaseAdmin
    .from("transactions")
    .update({ status: "failed", mpesa_reference: `FAIL: ${reason}`.slice(0, 200) })
    .eq("id", tx.id);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
