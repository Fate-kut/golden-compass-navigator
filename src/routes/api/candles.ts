import { createFileRoute } from "@tanstack/react-router";
import { getHistoricalBars, getCompanyInfo, type BarRange } from "@/lib/market.server";

const RANGES: BarRange[] = ["1D", "1W", "1M", "3M", "1Y"];

export const Route = createFileRoute("/api/candles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const symbol = url.searchParams.get("symbol");
        const exchange = url.searchParams.get("exchange") ?? "GLOBAL";
        const rangeParam = (url.searchParams.get("range") ?? "3M") as BarRange;
        const range = RANGES.includes(rangeParam) ? rangeParam : "3M";
        const withInfo = url.searchParams.get("info") === "1";
        if (!symbol) return Response.json({ error: "symbol required" }, { status: 400 });

        try {
          const [bars, info] = await Promise.all([
            getHistoricalBars(symbol, exchange, range),
            withInfo ? getCompanyInfo(symbol, exchange) : Promise.resolve(null),
          ]);
          return Response.json(info ? { ...bars, info } : bars);
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "Candles failed" },
            { status: 502 },
          );
        }
      },
    },
  },
});
