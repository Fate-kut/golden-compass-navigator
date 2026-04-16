import { Outlet, Link, createRootRoute, HeadContent, Scripts, useLocation } from "@tanstack/react-router";
import { AuthProvider } from "@/hooks/useAuth";
import { BottomNav } from "@/components/BottomNav";
import { ParallaxBackground } from "@/components/ParallaxBackground";

import appCss from "../styles.css?url";

const authRoutes = ["/login", "/signup"];

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--ocean-0)" }}>
      <div className="max-w-md text-center">
        <h1 className="t-display t-gold" style={{ fontSize: 48 }}>404</h1>
        <h2 className="t-serif t-parch mt-4" style={{ fontSize: 18 }}>Lost at sea</h2>
        <p className="t-mono t-muted mt-2" style={{ fontSize: 11 }}>
          This route doesn't exist on our charts.
        </p>
        <div className="mt-6">
          <Link
            to="/login"
            className="btn-brass inline-flex"
            style={{ padding: "10px 24px", fontSize: 11 }}
          >
            ⚓ Return to Port
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" },
      { title: "Golden Compass — Navigate Your Wealth" },
      { name: "description", content: "Golden Compass investment platform. Navigate your wealth with AI-powered portfolio management." },
      { name: "author", content: "Golden Compass" },
      { property: "og:title", content: "Golden Compass — Navigate Your Wealth" },
      { property: "og:description", content: "AI-powered investment platform" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=IM+Fell+English:ital@0;1&family=Space+Mono:wght@400;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AppShell() {
  const location = useLocation();
  const isAuth = authRoutes.includes(location.pathname);

  if (isAuth) {
    return <Outlet />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: "var(--ocean-0)" }}>
      <ParallaxBackground />
      <div
        className="relative z-10 mx-auto flex flex-col h-full"
        style={{ maxWidth: 430 }}
      >
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          <Outlet />
        </div>
        <BottomNav />
      </div>
    </div>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
