import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();

    // Gather portfolio context
    const [{ data: profile }, { data: investments }, { data: pools }, { data: txs }] = await Promise.all([
      supabase.from("profiles").select("full_name, kyc_status").eq("id", user.id).maybeSingle(),
      supabase
        .from("user_investments")
        .select("invested_amount, current_value, units_owned, pool_id, investment_pools(name, pool_type, current_nav)")
        .eq("user_id", user.id),
      supabase.from("investment_pools").select("name, pool_type, current_nav, min_investment, holding_period_days, exit_fee_percent").eq("is_active", true),
      supabase.from("transactions").select("type, amount, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    ]);

    const totalInvested = (investments ?? []).reduce((s, i) => s + Number(i.invested_amount ?? 0), 0);
    const totalValue = (investments ?? []).reduce((s, i) => s + Number(i.current_value ?? 0), 0);
    const pnl = totalValue - totalInvested;
    const pnlPct = totalInvested > 0 ? ((pnl / totalInvested) * 100).toFixed(2) : "0";

    const portfolioContext = `
INVESTOR PROFILE:
- Name: ${profile?.full_name ?? "Investor"}
- KYC Status: ${profile?.kyc_status ?? "unverified"}

PORTFOLIO SUMMARY:
- Total Invested: KES ${totalInvested.toLocaleString()}
- Current Value: KES ${totalValue.toLocaleString()}
- P&L: KES ${pnl.toLocaleString()} (${pnlPct}%)

HOLDINGS:
${(investments ?? []).map((i: any) => `- ${i.investment_pools?.name}: KES ${Number(i.current_value ?? 0).toLocaleString()} (${i.units_owned} units)`).join("\n") || "- No active investments yet"}

AVAILABLE POOLS:
${(pools ?? []).map((p) => `- ${p.name} (${p.pool_type}): NAV KES ${p.current_nav}, min KES ${p.min_investment}, lock ${p.holding_period_days}d, exit fee ${p.exit_fee_percent}%`).join("\n")}

RECENT ACTIVITY:
${(txs ?? []).map((t) => `- ${t.type} KES ${t.amount} (${t.status})`).join("\n") || "- No recent transactions"}
`.trim();

    const systemPrompt = `You are the Golden Compass Navigator, an AI investment guide with a calm, nautical voice. Use brief sailing/compass metaphors sparingly. You help investors understand their portfolio, explain pool mechanics, and answer questions about their holdings.

RULES:
- Keep responses concise (2-4 short paragraphs max)
- Use the investor's actual data below — never invent numbers
- Never give specific buy/sell financial advice; offer educational guidance only
- If asked about something outside the data, say so honestly
- Format with markdown when helpful (bullet lists, **bold** key numbers)

CURRENT INVESTOR DATA:
${portfolioContext}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits depleted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiRes.text();
      console.error("AI gateway error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(aiRes.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-navigator error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
