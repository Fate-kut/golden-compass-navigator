import { createFileRoute } from "@tanstack/react-router";
import { getQuote } from "@/lib/market.server";

export const Route = createFileRoute("/api/quote")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const symbol = url.searchParams.get("symbol");
        const exchange = url.searchParams.get("exchange") ?? "GLOBAL";
        if (!symbol) return Response.json({ error: "symbol required" }, { status: 400 });
        try {
          const quote = await getQuote(symbol, exchange);
          return Response.json(quote);
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "Quote failed" },
            { status: 502 },
          );
        }
      },
    },
  },
});
