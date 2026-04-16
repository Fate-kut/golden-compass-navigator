import { Link, useLocation } from "@tanstack/react-router";

const tabs = [
  { to: "/home", icon: "🏠", label: "Home" },
  { to: "/pools", icon: "⚓", label: "Pools" },
  { to: "/navigator", icon: "🧭", label: "Guide" },
  { to: "/history", icon: "📜", label: "History" },
  { to: "/profile", icon: "👤", label: "Profile" },
] as const;

export function BottomNav() {
  const location = useLocation();

  return (
    <nav
      className="flex shrink-0 relative z-10"
      style={{
        padding: "4px 8px 24px",
        background: "rgba(7,12,22,0.88)",
        backdropFilter: "blur(36px) saturate(180%)",
        WebkitBackdropFilter: "blur(36px) saturate(180%)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
      }}
    >
      <div
        className="absolute top-0 left-[15%] right-[15%] h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(201,168,76,0.25), transparent)",
        }}
      />
      {tabs.map((tab) => {
        const active = location.pathname === tab.to;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className="flex-1 flex flex-col items-center justify-center gap-1 relative border-none bg-transparent cursor-pointer"
            style={{
              padding: "10px 4px 6px",
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: active
                ? "var(--gold-300)"
                : "rgba(200,175,130,0.38)",
              borderRadius: "16px",
              background: active
                ? "linear-gradient(180deg, rgba(201,168,76,0.10), rgba(201,168,76,0.03))"
                : "transparent",
              transition: "color 0.2s ease, background 0.2s ease",
              textDecoration: "none",
            }}
          >
            {active && (
              <span
                className="absolute top-0 left-1/4 right-1/4 h-0.5"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, var(--gold-300), transparent)",
                  borderRadius: "0 0 2px 2px",
                  boxShadow: "0 0 8px rgba(201,168,76,0.5)",
                  animation: "navIndicator 0.3s cubic-bezier(0.34,1.56,0.64,1)",
                }}
              />
            )}
            <span
              className="text-[22px] leading-none"
              style={
                active
                  ? { animation: "navBounce 0.35s cubic-bezier(0.34,1.56,0.64,1)" }
                  : undefined
              }
            >
              {tab.icon}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
