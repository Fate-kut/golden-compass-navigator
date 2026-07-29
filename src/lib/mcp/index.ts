import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listPools from "./tools/list-pools";
import getPortfolio from "./tools/get-portfolio";
import listTransactions from "./tools/list-transactions";
import getQuote from "./tools/get-quote";

// Must be the direct Supabase host: SUPABASE_URL is rewritten to a proxy on publish.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "golden-compass-mcp",
  title: "Golden Compass",
  version: "0.1.0",
  instructions:
    "Tools for Golden Compass, a Kenyan investment platform. Read the signed-in investor's wallet balance, holdings and transaction history, browse active investment pools, and fetch market quotes for NSE/NGX/JSE/GSE and global symbols. All amounts are in KES. Never give specific buy/sell financial advice.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listPools, getPortfolio, listTransactions, getQuote],
});
