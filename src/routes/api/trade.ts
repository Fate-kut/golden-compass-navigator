import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest, json } from "@/lib/auth.server";
import { rateLimit } from "@/lib/rate-limit.server";
import { placeOrder, getQuote } from "@/lib/market.server";

export const Route = createFileRoute("/api/trade")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authResult = await authenticateRequest(request);
        if (authResult instanceof Response) return authResult;
        const { userId } = authResult;
        if (!rateLimit(userId, 10, 60_000)) return json({ error: "Too many requests" }, 429);

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

        try {
          const result = await placeOrder({ symbol, side, quantity, accountId });
          const brokerOrderId =
            (result as { id?: string; order_id?: string })?.id ??
            (result as { order_id?: string })?.order_id ??
            null;
          const brokerStatus = String((result as { status?: string })?.status ?? "filled");
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

          return json({ success: true, order: result });
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
          });
          return json({ error: message }, 502);
        }
      },
    },
  },
});
