import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { failure, ok, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_transactions",
  title: "List transactions",
  description: "List the signed-in investor's most recent deposits, investments and withdrawals.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(10).describe("How many recent transactions to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("transactions")
      .select("id, type, amount, status, created_at, pool_id")
      .eq("user_id", ctx.getUserId()!)
      .order("created_at", { ascending: false })
      .limit(limit ?? 10);
    if (error) return failure(error.message);
    return ok(data ?? []);
  },
});
