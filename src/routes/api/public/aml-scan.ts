import { createFileRoute } from "@tanstack/react-router";
import { runVelocityScan } from "@/lib/aml.server";

// Scheduled AML velocity sweep. Call on a cron (e.g. pg_cron / external scheduler):
//   POST https://project--<id>.lovable.app/api/public/aml-scan
//   header: x-aml-scan-secret: <AML_SCAN_SECRET>
// Public prefix bypasses site auth, so the shared secret is verified here.
export const Route = createFileRoute("/api/public/aml-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.AML_SCAN_SECRET;
        if (!secret) return Response.json({ error: "Scanner not configured" }, { status: 503 });
        const provided = request.headers.get("x-aml-scan-secret") ?? "";
        if (provided.length !== secret.length || provided !== secret) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        try {
          const result = await runVelocityScan();
          return Response.json({ ok: true, ...result, ran_at: new Date().toISOString() });
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "Scan failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
