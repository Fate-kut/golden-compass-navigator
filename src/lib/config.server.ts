// Config-driven runtime settings, read from the `app_config` table so switching
// behaviour (e.g. broker mock -> live) is a data change, not a code change.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CACHE_MS = 30_000;
const cache = new Map<string, { value: unknown; at: number }>();

export async function getConfig<T>(key: string, fallback: T): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  try {
    const { data } = await supabaseAdmin
      .from("app_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const value = (data?.value ?? fallback) as T;
    cache.set(key, { value, at: Date.now() });
    return value;
  } catch {
    return fallback;
  }
}

export type BrokerMode = "mock" | "live";

/** MOCK: defaults to the simulated broker until a licensed integration exists. */
export async function getBrokerMode(): Promise<BrokerMode> {
  const mode = await getConfig<string>("broker_mode", "mock");
  return mode === "live" ? "live" : "mock";
}

export interface MockBrokerSettings {
  fill_delay_ms: number;
  failure_rate: number;
  volatility_pct: number;
}

export async function getMockBrokerSettings(): Promise<MockBrokerSettings> {
  return getConfig<MockBrokerSettings>("mock_broker", {
    fill_delay_ms: 1200,
    failure_rate: 0.12,
    volatility_pct: 0.8,
  });
}
