// Broker adapter manifest registry (OpenAlgo-style plugin manifests).
//
// Adding Alpaca / DriveWealth / Genghis Capital later is a matter of adding a
// manifest entry + an adapter module — not new `if (broker === ...)` branches
// scattered across call sites.

export type BrokerType = "KE_stock" | "AF_stock" | "US_stock" | "GLOBAL_stock";

export interface BrokerManifest {
  /** Stable id used in app_config / order records. */
  id: string;
  name: string;
  broker_type: BrokerType;
  /** Exchanges this adapter can route. */
  exchanges: string[];
  currency: "KES" | "USD";
  /** Env var holding the API key, if any. */
  api_key_env?: string;
  /** Whether the adapter can place orders (vs quotes only). */
  supports_orders: boolean;
  /** True when no real money/market is involved. */
  simulated: boolean;
  status: "active" | "planned";
}

export const BROKER_MANIFESTS: BrokerManifest[] = [
  {
    id: "mock",
    name: "Golden Compass Sandbox",
    broker_type: "GLOBAL_stock",
    exchanges: ["NSE", "NGX", "JSE", "GSE", "GLOBAL"],
    currency: "KES",
    supports_orders: true,
    simulated: true,
    status: "active",
  },
  {
    id: "mystocks",
    name: "mystocks.africa",
    broker_type: "AF_stock",
    exchanges: ["NSE", "NGX", "JSE", "GSE"],
    currency: "KES",
    api_key_env: "MYSTOCKS_API_KEY",
    supports_orders: true,
    simulated: false,
    status: "active",
  },
  {
    id: "finnhub",
    name: "Finnhub",
    broker_type: "US_stock",
    exchanges: ["GLOBAL"],
    currency: "USD",
    api_key_env: "FINNHUB_API_KEY",
    supports_orders: false,
    simulated: false,
    status: "active",
  },
  {
    id: "genghis",
    name: "Genghis Capital",
    broker_type: "KE_stock",
    exchanges: ["NSE"],
    currency: "KES",
    api_key_env: "GENGHIS_API_KEY",
    supports_orders: true,
    simulated: false,
    status: "planned",
  },
];

export function manifestForExchange(exchange: string): BrokerManifest | undefined {
  const ex = exchange.toUpperCase();
  return BROKER_MANIFESTS.find((m) => m.status === "active" && !m.simulated && m.exchanges.includes(ex));
}

export function manifestById(id: string): BrokerManifest | undefined {
  return BROKER_MANIFESTS.find((m) => m.id === id);
}
