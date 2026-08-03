import { createFileRoute } from "@tanstack/react-router";
import { estimateFees } from "@/lib/fees.server";

// Public read-only fee/tax estimate.
// MOCK: rates are illustrative placeholders — TBD pending broker agreement.
export const Route = createFileRoute("/api/fees")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const market = (url.searchParams.get("market") ?? "NSE").toUpperCase();
        const side = url.searchParams.get("side") === "sell" ? "sell" : "buy";
        const quantity = Number(url.searchParams.get("quantity") ?? 0);
        const price = Number(url.searchParams.get("price") ?? 0);
        if (!(quantity > 0) || !(price > 0)) {
          return Response.json({ error: "quantity and price must be > 0" }, { status: 400 });
        }
        try {
          const fees = await estimateFees({ market, side, quantity, price });
          return Response.json(fees);
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "Fee estimate failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
