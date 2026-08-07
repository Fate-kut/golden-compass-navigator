// Price-alert evaluation. Runs server-side (cron sweep) with the admin client
// so it can read every user's active alerts and write notifications for them.
//
// Alerts are evaluated against getQuote(), so they inherit the same
// live/simulated transparency contract as the rest of the app: a simulated
// quote produces a notification that says so.
import { getQuote } from "@/lib/market.server";

export interface AlertRow {
  id: string;
  user_id: string;
  symbol: string;
  exchange: string;
  name: string | null;
  condition: "greater" | "less";
  threshold_price: number;
}

export interface AlertScanResult {
  checked: number;
  triggered: number;
  errors: number;
}

export async function runPriceAlertScan(): Promise<AlertScanResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data, error } = await supabaseAdmin
    .from("price_alerts")
    .select("id, user_id, symbol, exchange, name, condition, threshold_price")
    .is("triggered_at", null)
    .limit(500);

  if (error) throw new Error(error.message);
  const alerts = (data ?? []) as unknown as AlertRow[];
  if (alerts.length === 0) return { checked: 0, triggered: 0, errors: 0 };

  // One quote per unique symbol/exchange pair, not per alert.
  const pairs = new Map<string, { symbol: string; exchange: string }>();
  for (const a of alerts) {
    pairs.set(`${a.symbol}|${a.exchange}`, { symbol: a.symbol, exchange: a.exchange });
  }

  const quotes = new Map<string, { price: number; currency: string; simulated: boolean }>();
  let errors = 0;
  for (const [key, p] of pairs) {
    try {
      const q = await getQuote(p.symbol, p.exchange);
      quotes.set(key, { price: q.price, currency: q.currency, simulated: q.simulated });
    } catch (e) {
      errors++;
      console.warn(`[alerts] quote failed for ${key}: ${e instanceof Error ? e.message : e}`);
    }
  }

  let triggered = 0;
  for (const a of alerts) {
    const q = quotes.get(`${a.symbol}|${a.exchange}`);
    if (!q) continue;
    const threshold = Number(a.threshold_price);
    const hit = a.condition === "greater" ? q.price >= threshold : q.price <= threshold;
    if (!hit) continue;

    const direction = a.condition === "greater" ? "rose above" : "fell below";
    const { error: notifyError } = await supabaseAdmin.from("notifications").insert({
      user_id: a.user_id,
      type: "price_alert",
      title: `🔔 ${a.symbol} ${direction} ${q.currency} ${threshold.toLocaleString()}`,
      body:
        `${a.name ?? a.symbol} is trading at ${q.currency} ${q.price.toLocaleString()} on ${a.exchange}.` +
        (q.simulated ? " (Simulated price — sandbox trading.)" : ""),
      metadata: {
        alert_id: a.id,
        symbol: a.symbol,
        exchange: a.exchange,
        price: q.price,
        threshold,
        simulated: q.simulated,
      },
    });
    if (notifyError) {
      errors++;
      console.warn(`[alerts] notification insert failed for ${a.id}: ${notifyError.message}`);
      continue;
    }

    await supabaseAdmin
      .from("price_alerts")
      .update({ triggered_at: new Date().toISOString() })
      .eq("id", a.id);
    triggered++;
  }

  return { checked: alerts.length, triggered, errors };
}
