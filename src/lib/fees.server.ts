// Fee & tax estimation.
// MOCK: rates come from the `fee_config` table and are ILLUSTRATIVE ONLY —
// replace with contractual broker rates + KRA-confirmed withholding once licensed.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface FeeBreakdown {
  market: string;
  currency: string;
  gross: number;
  commission: number;
  tax_withheld: number;
  total: number;
  commission_percent: number;
  tax_percent: number;
  label: string;
  simulated: true;
}

const FALLBACK = {
  commission_percent: 1.78,
  tax_percent: 5,
  min_commission: 0,
  currency: "KES",
  label: "illustrative rate — TBD pending broker agreement",
};

export async function getFeeConfig(market: string) {
  const { data } = await supabaseAdmin
    .from("fee_config")
    .select("market, commission_percent, tax_percent, min_commission, currency, label")
    .eq("market", market.toUpperCase())
    .eq("is_active", true)
    .maybeSingle();
  return data ?? { market: market.toUpperCase(), ...FALLBACK };
}

export async function estimateFees(params: {
  market: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
}): Promise<FeeBreakdown> {
  const cfg = await getFeeConfig(params.market);
  const gross = params.quantity * params.price;
  const commission = round2(
    Math.max(Number(cfg.min_commission ?? 0), (gross * Number(cfg.commission_percent)) / 100),
  );
  // MOCK: withholding modelled as a percentage of commission. Confirm treatment with a tax adviser.
  const tax = round2((commission * Number(cfg.tax_percent)) / 100);
  const total = params.side === "buy" ? round2(gross + commission + tax) : round2(gross - commission - tax);

  return {
    market: String(cfg.market),
    currency: String(cfg.currency ?? "KES"),
    gross: round2(gross),
    commission,
    tax_withheld: tax,
    total,
    commission_percent: Number(cfg.commission_percent),
    tax_percent: Number(cfg.tax_percent),
    label: String(cfg.label ?? FALLBACK.label),
    simulated: true,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
