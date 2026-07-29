import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { failure, ok, unauthenticated } from "../supabase";

export default defineTool({
  name: "get_quote",
  title: "Get market quote",
  description: "Fetch a live market quote for a stock symbol on NSE, NGX, JSE, GSE or global exchanges.",
  inputSchema: {
    symbol: z.string().trim().min(1).describe("Ticker symbol, e.g. SCOM or AAPL."),
    exchange: z
      .enum(["NSE", "NGX", "JSE", "GSE", "GLOBAL"])
      .default("NSE")
      .describe("Exchange the symbol trades on."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async ({ symbol, exchange }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    try {
      const { getQuote } = await import("@/lib/market.server");
      const quote = await getQuote(symbol.toUpperCase(), exchange ?? "NSE");
      return ok(quote);
    } catch (e) {
      return failure(e instanceof Error ? e.message : "Quote lookup failed");
    }
  },
});
