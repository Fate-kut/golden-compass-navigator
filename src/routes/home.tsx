import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Home — Golden Compass" },
      { name: "description", content: "Your investment portfolio dashboard" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-5 py-10 text-center">
      <span className="text-4xl mb-4">🏠</span>
      <h1 className="t-display t-gold" style={{ fontSize: 20 }}>Home Dashboard</h1>
      <p className="t-mono t-muted mt-2" style={{ fontSize: 10 }}>
        Coming in Phase 2
      </p>
    </div>
  );
}
