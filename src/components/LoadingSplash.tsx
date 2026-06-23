export function LoadingSplash() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: "var(--ocean-0)" }}
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(201,168,76,0.2), transparent 70%)",
          border: "1px solid rgba(201,168,76,0.3)",
          animation: "pulse 2s ease-in-out infinite",
        }}
      >
        <span style={{ fontSize: 32 }}>🧭</span>
      </div>
      <p
        className="t-display t-gold"
        style={{ fontSize: 14, letterSpacing: "0.12em", animation: "pulse 2s ease-in-out infinite" }}
      >
        NAVIGATING...
      </p>
    </div>
  );
}
