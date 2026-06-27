import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest, json } from "@/lib/auth.server";
import { rateLimit } from "@/lib/rate-limit.server";
import { placeOrder } from "@/lib/market.server";

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
        };
        const symbol = String(body.symbol ?? "").trim();
        const side = body.side;
        const quantity = Number(body.quantity);
        const accountId = String(body.account_id ?? "").trim();
        if (!symbol) return json({ error: "symbol required" }, 400);
        if (side !== "buy" && side !== "sell") return json({ error: "side must be buy or sell" }, 400);
        if (!quantity || quantity <= 0) return json({ error: "quantity must be > 0" }, 400);
        if (!accountId) return json({ error: "account_id required" }, 400);

        try {
          const result = await placeOrder({ symbol, side, quantity, accountId });
          return json({ success: true, order: result });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "Order failed" }, 502);
        }
      },
    },
  },
});
