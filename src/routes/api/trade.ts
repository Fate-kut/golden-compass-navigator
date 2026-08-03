import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest, json } from "@/lib/auth.server";
import { rateLimit } from "@/lib/rate-limit.server";
import { requireFreshAal2 } from "@/lib/mfa.server";
import { placeOrder, getQuote, isSimulatedTrading } from "@/lib/market.server";
import { estimateFees } from "@/lib/fees.server";

export const Route = createFileRoute("/api/trade")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authResult = await authenticateRequest(request);
        if (authResult instanceof Response) return authResult;
        const { userId, claims } = authResult;
        if (!rateLimit(userId, 10, 60_000)) return json({ error: "Too many requests" }, 429);

        // Step-up auth for MFA-enrolled users (opt-in; no-op otherwise).
        const mfaBlock = await requireFreshAal2(userId, claims);
        if (mfaBlock) return mfaBlock;

        const body = (await request.json()) as {
          symbol?: string;
          side?: "buy" | "sell";
          quantity?: number;
          account_id?: string;
          exchange?: string;
        };
        const symbol = String(body.symbol ?? "").trim().toUpperCase();
        const side = body.side;
        const quantity = Number(body.quantity);
        const accountId = String(body.account_id ?? "").trim();
        const exchange = String(body.exchange ?? "NSE").trim().toUpperCase();
        if (!symbol) return json({ error: "symbol required" }, 400);
        if (side !== "buy" && side !== "sell") return json({ error: "side must be buy or sell" }, 400);
        if (!quantity || quantity <= 0) return json({ error: "quantity must be > 0" }, 400);
        if (!accountId) return json({ error: "account_id required" }, 400);

        const { recordOrder, applyFillToHolding } = await import("@/lib/orders.server");
        const simulated = await isSimulatedTrading();

        // Best-effort reference price for the order record / cost basis.
        let price: number | null = null;
        let currency = "KES";
        try {
          const q = await getQuote(symbol, exchange);
          price = q.price;
          currency = q.currency;
        } catch {
          /* price stays null; order still recorded */
        }

        // MOCK: illustrative commission/tax — TBD pending broker agreement.
        let commission = 0;
        let taxWithheld = 0;
        if (price !== null) {
          try {
            const fees = await estimateFees({ market: exchange, side, quantity, price });
            commission = fees.commission;
            taxWithheld = fees.tax_withheld;
            currency = fees.currency as typeof currency;
          } catch {
            /* fees stay zero */
          }
        }

        try {
          const result = await placeOrder({ symbol, side, quantity, accountId, exchange });
          const brokerOrderId =
            (result?.id as string | undefined) ?? (result?.order_id as string | undefined) ?? null;
          const brokerStatus = String(result?.status ?? "filled");
          const status = brokerStatus === "pending" ? "pending" : "filled";

          await recordOrder({
            userId,
            symbol,
            exchange,
            side,
            quantity,
            price,
            status,
            accountId,
            brokerOrderId,
            commission: status === "filled" ? commission : 0,
            taxWithheld: status === "filled" ? taxWithheld : 0,
            currency,
            isSimulated: simulated,
          });

          if (status === "filled" && price !== null) {
            await applyFillToHolding({
              userId,
              symbol,
              exchange,
              side,
              quantity,
              price,
              currency,
            });
          }

          return json({ success: true, simulated, order: result, fees: { commission, tax_withheld: taxWithheld } });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Order failed";
          await recordOrder({
            userId,
            symbol,
            exchange,
            side,
            quantity,
            price,
            status: "failed",
            accountId,
            errorMessage: message,
            currency,
            isSimulated: simulated,
          });
          return json({ error: message, simulated }, 502);
        }
      },
    },
  },
});
