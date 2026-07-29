import { defineTool } from "@lovable.dev/mcp-js";
import { failure, ok, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "get_portfolio",
  title: "Get portfolio",
  description: "Get the signed-in investor's wallet balance, holdings and profit/loss summary.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);

    const [{ data: profile, error: pErr }, { data: investments, error: iErr }] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, kyc_status, wallet_balance")
        .eq("id", ctx.getUserId()!)
        .maybeSingle(),
      supabase
        .from("user_investments")
        .select("invested_amount, current_value, units_owned, investment_pools(name, pool_type, current_nav)")
        .eq("user_id", ctx.getUserId()!),
    ]);
    if (pErr) return failure(pErr.message);
    if (iErr) return failure(iErr.message);

    const rows = investments ?? [];
    const totalInvested = rows.reduce((s, r) => s + Number(r.invested_amount ?? 0), 0);
    const totalValue = rows.reduce((s, r) => s + Number(r.current_value ?? 0), 0);

    return ok({
      currency: "KES",
      full_name: profile?.full_name ?? null,
      kyc_status: profile?.kyc_status ?? null,
      wallet_balance: Number(profile?.wallet_balance ?? 0),
      total_invested: totalInvested,
      current_value: totalValue,
      profit_loss: totalValue - totalInvested,
      profit_loss_percent: totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0,
      holdings: rows,
    });
  },
});
