import { createFileRoute } from "@tanstack/react-router";
import { runPriceAlertScan } from "@/lib/alerts.server";

// Scheduled price-alert sweep. Call on a cron:
//   POST https://project--<id>.lovable.app/api/public/check-price-alerts
//   header: apikey: <publishable key>
// The public prefix bypasses site auth, so the caller is verified here.
export const Route = createFileRoute("/api/public/check-price-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env['SUPABASE_ANON_KEY'] ?? process.env['SUPABASE_PUBLISHABLE_KEY'] ?? "";
        const provided = request.headers.get("apikey") ?? "";
        if (!expected) return Response.json({ error: "Scanner not configured" }, { status: 503 });
        if (provided.length !== expected.length || provided !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          const result = await runPriceAlertScan();
          return Response.json({ ok: true, ...result, ran_at: new Date().toISOString() });
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "Alert scan failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
