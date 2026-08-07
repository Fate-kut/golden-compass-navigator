// Static symbol directory used by the global search dialog.
// Client-safe (no secrets, no server imports). This is a seed list — once a
// provider exposes a symbol-search endpoint this can be swapped for a query.

export interface SymbolEntry {
  symbol: string;
  name: string;
  exchange: "NSE" | "NGX" | "JSE" | "GSE" | "GLOBAL";
  /** Loose grouping used by the markets dashboard. */
  category?: "nse" | "index" | "tech" | "africa";
}

export const SYMBOLS: SymbolEntry[] = [
  // ── Nairobi Securities Exchange (NSE Kenya) ──
  { symbol: "SCOM", name: "Safaricom PLC", exchange: "NSE", category: "nse" },
  { symbol: "EQTY", name: "Equity Group Holdings", exchange: "NSE", category: "nse" },
  { symbol: "KCB", name: "KCB Group PLC", exchange: "NSE", category: "nse" },
  { symbol: "COOP", name: "Co-operative Bank of Kenya", exchange: "NSE", category: "nse" },
  { symbol: "ABSA", name: "Absa Bank Kenya PLC", exchange: "NSE", category: "nse" },
  { symbol: "SCBK", name: "Standard Chartered Bank Kenya", exchange: "NSE", category: "nse" },
  { symbol: "NCBA", name: "NCBA Group PLC", exchange: "NSE", category: "nse" },
  { symbol: "SBIC", name: "Stanbic Holdings PLC", exchange: "NSE", category: "nse" },
  { symbol: "DTK", name: "Diamond Trust Bank Kenya", exchange: "NSE", category: "nse" },
  { symbol: "EABL", name: "East African Breweries", exchange: "NSE", category: "nse" },
  { symbol: "BAT", name: "British American Tobacco Kenya", exchange: "NSE", category: "nse" },
  { symbol: "KEGN", name: "KenGen PLC", exchange: "NSE", category: "nse" },
  { symbol: "KPLC", name: "Kenya Power & Lighting", exchange: "NSE", category: "nse" },
  { symbol: "BAMB", name: "Bamburi Cement PLC", exchange: "NSE", category: "nse" },
  { symbol: "JUB", name: "Jubilee Holdings", exchange: "NSE", category: "nse" },
  { symbol: "CTUM", name: "Centum Investment Company", exchange: "NSE", category: "nse" },
  { symbol: "KNRE", name: "Kenya Re-Insurance Corporation", exchange: "NSE", category: "nse" },
  { symbol: "UMME", name: "Umeme Limited", exchange: "NSE", category: "nse" },
  { symbol: "TOTL", name: "TotalEnergies Marketing Kenya", exchange: "NSE", category: "nse" },
  { symbol: "CARB", name: "Carbacid Investments", exchange: "NSE", category: "nse" },

  // ── Nigerian Exchange (NGX) ──
  { symbol: "DANGCEM", name: "Dangote Cement PLC", exchange: "NGX", category: "africa" },
  { symbol: "MTNN", name: "MTN Nigeria Communications", exchange: "NGX", category: "africa" },
  { symbol: "GTCO", name: "Guaranty Trust Holding", exchange: "NGX", category: "africa" },
  { symbol: "ZENITHBANK", name: "Zenith Bank PLC", exchange: "NGX", category: "africa" },
  { symbol: "AIRTELAFRI", name: "Airtel Africa PLC", exchange: "NGX", category: "africa" },

  // ── Johannesburg Stock Exchange (JSE) ──
  { symbol: "NPN", name: "Naspers Limited", exchange: "JSE", category: "africa" },
  { symbol: "SOL", name: "Sasol Limited", exchange: "JSE", category: "africa" },
  { symbol: "SBK", name: "Standard Bank Group", exchange: "JSE", category: "africa" },
  { symbol: "MTN", name: "MTN Group Limited", exchange: "JSE", category: "africa" },
  { symbol: "SHP", name: "Shoprite Holdings", exchange: "JSE", category: "africa" },

  // ── Ghana Stock Exchange (GSE) ──
  { symbol: "MTNGH", name: "MTN Ghana", exchange: "GSE", category: "africa" },
  { symbol: "GCB", name: "GCB Bank PLC", exchange: "GSE", category: "africa" },
  { symbol: "TOTAL", name: "TotalEnergies Marketing Ghana", exchange: "GSE", category: "africa" },

  // ── Global equities ──
  { symbol: "AAPL", name: "Apple Inc.", exchange: "GLOBAL", category: "tech" },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: "GLOBAL", category: "tech" },
  { symbol: "GOOGL", name: "Alphabet Inc.", exchange: "GLOBAL", category: "tech" },
  { symbol: "AMZN", name: "Amazon.com Inc.", exchange: "GLOBAL", category: "tech" },
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "GLOBAL", category: "tech" },
  { symbol: "META", name: "Meta Platforms Inc.", exchange: "GLOBAL", category: "tech" },
  { symbol: "TSLA", name: "Tesla Inc.", exchange: "GLOBAL", category: "tech" },
  { symbol: "NFLX", name: "Netflix Inc.", exchange: "GLOBAL", category: "tech" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", exchange: "GLOBAL" },
  { symbol: "KO", name: "The Coca-Cola Company", exchange: "GLOBAL" },
  { symbol: "V", name: "Visa Inc.", exchange: "GLOBAL" },
  { symbol: "BRK.B", name: "Berkshire Hathaway Inc.", exchange: "GLOBAL" },

  // ── Global index ETFs (equity indices, no forex/CFD/crypto) ──
  { symbol: "SPY", name: "S&P 500 Index ETF", exchange: "GLOBAL", category: "index" },
  { symbol: "QQQ", name: "Nasdaq 100 Index ETF", exchange: "GLOBAL", category: "index" },
  { symbol: "DIA", name: "Dow Jones Industrial ETF", exchange: "GLOBAL", category: "index" },
  { symbol: "VT", name: "Total World Stock ETF", exchange: "GLOBAL", category: "index" },
  { symbol: "EEM", name: "Emerging Markets ETF", exchange: "GLOBAL", category: "index" },
];

/** Debounce-friendly filter: matches on symbol prefix first, then name. */
export function searchSymbols(query: string, limit = 25): SymbolEntry[] {
  const q = query.trim().toUpperCase();
  if (!q) return SYMBOLS.slice(0, limit);
  const starts: SymbolEntry[] = [];
  const contains: SymbolEntry[] = [];
  for (const s of SYMBOLS) {
    if (s.symbol.startsWith(q)) starts.push(s);
    else if (s.symbol.includes(q) || s.name.toUpperCase().includes(q)) contains.push(s);
  }
  return [...starts, ...contains].slice(0, limit);
}

export function lookupSymbol(symbol: string): SymbolEntry | undefined {
  const s = symbol.trim().toUpperCase();
  return SYMBOLS.find((x) => x.symbol === s);
}

export function symbolsByCategory(category: NonNullable<SymbolEntry["category"]>): SymbolEntry[] {
  return SYMBOLS.filter((s) => s.category === category);
}
