import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TiltCard } from "@/components/TiltCard";

export const Route = createFileRoute("/pools")({
  head: () => ({
    meta: [
      { title: "Investment Pools — Golden Compass" },
      { name: "description", content: "Choose a pool to grow your wealth" },
    ],
  }),
  component: PoolsPage,
});

interface Pool {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  pool_type: string | null;
  current_nav: number | null;
  min_investment: number | null;
  exit_fee_percent: number | null;
  holding_period_days: number | null;
}

const KES = (n: number) =>
  "KES " + Number(n).toLocaleString("en-KE", { maximumFractionDigits: 0 });

const POOL_META: Record<string, { emblem: string; tagline: string; accent: string }> = {
  "stable-harbour": {
    emblem: "⚓",
    tagline: "Calm waters, steady gains",
    accent: "var(--teal)",
  },
  bahari: {
    emblem: "🧭",
    tagline: "Charted growth across the seas",
    accent: "var(--gold-300)",
  },
  "alpha-ventures": {
    emblem: "⚔️",
    tagline: "Bold expeditions, greater spoils",
    accent: "var(--gc-warning)",
  },
};

function PoolsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("investment_pools")
        .select("id, slug, name, description, pool_type, current_nav, min_investment, exit_fee_percent, holding_period_days")
        .eq("is_active", true)
        .order("min_investment", { ascending: true });
      if (cancelled) return;
      setPools((data as Pool[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-28 anim-fade-up">
      <header>
        <p className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.18em" }}>
          THE FLEET
        </p>
        <h1 className="t-display t-gold mt-1" style={{ fontSize: 22 }}>
          Investment Pools
        </h1>
        <p className="t-serif t-sec mt-2" style={{ fontSize: 13, fontStyle: "italic" }}>
          Choose your vessel. Each charts a different course through the markets.
        </p>
      </header>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-44 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {pools.map((pool) => {
            const meta = POOL_META[pool.slug] ?? {
              emblem: "✦",
              tagline: pool.description ?? "",
              accent: "var(--gold-300)",
            };
            return (
              <TiltCard key={pool.id} className="glass-gold rounded-2xl p-5" max={6}>
                <div className="relative z-10">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                        style={{
                          background: `radial-gradient(circle at 30% 30%, ${meta.accent}33, transparent 70%)`,
                          border: `1px solid ${meta.accent}55`,
                        }}
                      >
                        {meta.emblem}
                      </div>
                      <div>
                        <h2 className="t-display t-parch" style={{ fontSize: 16 }}>
                          {pool.name}
                        </h2>
                        <p className="t-mono t-sec mt-1" style={{ fontSize: 9, letterSpacing: "0.14em" }}>
                          {(pool.pool_type ?? "POOL").toUpperCase()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="t-mono t-muted" style={{ fontSize: 8, letterSpacing: "0.14em" }}>
                        NAV
                      </p>
                      <p className="t-display t-gold" style={{ fontSize: 16 }}>
                        {Number(pool.current_nav ?? 100).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <p
                    className="t-serif t-sec mt-3"
                    style={{ fontSize: 13, fontStyle: "italic" }}
                  >
                    {meta.tagline}
                  </p>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <Stat label="MIN" value={KES(Number(pool.min_investment ?? 0))} />
                    <Stat label="LOCK" value={`${pool.holding_period_days ?? 0}d`} />
                    <Stat label="EXIT FEE" value={`${Number(pool.exit_fee_percent ?? 0)}%`} />
                  </div>

                  <button
                    onClick={() => navigate({ to: "/home" })}
                    className="btn-brass w-full mt-4"
                    style={{ padding: "12px 16px", fontSize: 11 }}
                  >
                    Invest Now
                  </button>
                </div>
              </TiltCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-2 py-2 text-center"
      style={{
        background: "rgba(0,0,0,0.25)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <p className="t-mono t-muted" style={{ fontSize: 8, letterSpacing: "0.14em" }}>
        {label}
      </p>
      <p className="t-serif t-parch mt-1" style={{ fontSize: 12 }}>
        {value}
      </p>
    </div>
  );
}
