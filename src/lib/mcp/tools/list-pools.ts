import { defineTool } from "@lovable.dev/mcp-js";
import { failure, ok, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_pools",
  title: "List investment pools",
  description: "List the active Golden Compass investment pools with NAV, minimums and fees.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("investment_pools")
      .select("id, name, slug, description, pool_type, current_nav, min_investment, holding_period_days, exit_fee_percent")
      .eq("is_active", true);
    if (error) return failure(error.message);
    return ok(data ?? []);
  },
});
