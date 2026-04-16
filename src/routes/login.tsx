import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { CompassEmblem } from "@/components/CompassEmblem";
import { ParallaxBackground } from "@/components/ParallaxBackground";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — Golden Compass" },
      { name: "description", content: "Sign in to navigate your wealth with Golden Compass" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [shakeField, setShakeField] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setShakeField("email");
      setTimeout(() => setShakeField(null), 500);
      return;
    }
    if (!password) {
      setShakeField("password");
      setTimeout(() => setShakeField(null), 500);
      return;
    }

    setLoading(true);
    try {
      await signIn(email, password);
      setSuccess(true);
      setTimeout(() => navigate({ to: "/home" }), 600);
    } catch (err: any) {
      setError(err.message || "Login failed");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: "var(--ocean-0)" }}>
      <ParallaxBackground />
      <div
        className="relative z-10 mx-auto flex flex-col h-full overflow-y-auto"
        style={{ maxWidth: 430 }}
      >
        <div className="flex flex-col items-center text-center" style={{ padding: "44px 28px 32px" }}>
          <div className="anim-emblem anim-float">
            <CompassEmblem />
          </div>
          <p
            className="t-mono t-muted mb-2 anim-fade-up"
            style={{ fontSize: 9, letterSpacing: "0.2em", animationDelay: "0.4s" }}
          >
            EST. MMXXIV
          </p>
          <h1
            className="t-display t-gold anim-fade-up"
            style={{ fontSize: 24, letterSpacing: "0.04em", marginBottom: 8, animationDelay: "0.5s" }}
          >
            Golden Compass
          </h1>
          <p
            className="t-fell t-sec anim-fade-up"
            style={{ fontSize: 16, fontStyle: "italic", animationDelay: "0.6s" }}
          >
            Navigate Your Wealth
          </p>
        </div>

        <div className="px-5 anim-fade-up" style={{ animationDelay: "0.65s" }}>
          <div className="glass glass-shine rounded-2xl p-6 mb-4">
            <form onSubmit={handleSubmit}>
              <div className="gc-input-wrap mb-4">
                <label className="gc-input-label">Email Address</label>
                <input
                  type="email"
                  className={`gc-input ${shakeField === "email" ? "shake" : ""}`}
                  placeholder="demo@goldencompass.co"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="gc-input-wrap mb-4">
                <label className="gc-input-label">Passphrase</label>
                <input
                  type="password"
                  className={`gc-input ${shakeField === "password" ? "shake" : ""}`}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <p className="t-mono mb-3" style={{ fontSize: 11, color: "var(--gc-danger)" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || success}
                className="btn-brass w-full"
                style={{ height: 52, fontSize: 12 }}
              >
                {success ? (
                  <span style={{ fontSize: 16, animation: "checkPop 0.35s cubic-bezier(0.34,1.56,0.64,1)" }}>
                    ✓
                  </span>
                ) : loading ? (
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      border: "2px solid rgba(42,24,0,0.3)",
                      borderTopColor: "#2A1600",
                      borderRadius: "50%",
                      animation: "spinBtn 0.7s linear infinite",
                      display: "inline-block",
                    }}
                  />
                ) : (
                  <>⚓ Navigate In</>
                )}
              </button>
            </form>
          </div>

          <div
            className="glass rounded-2xl p-4 text-center"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <p className="t-fell t-sec" style={{ fontSize: 13, fontStyle: "italic", marginBottom: 8 }}>
              New to the fleet?
            </p>
            <Link
              to="/signup"
              className="t-display t-gold inline-block"
              style={{
                fontSize: 11,
                letterSpacing: "0.08em",
                textDecoration: "none",
                padding: "8px 20px",
                borderRadius: 10,
                border: "var(--border-gold)",
                background: "linear-gradient(180deg, rgba(201,168,76,0.15), rgba(201,168,76,0.05))",
                transition: "all 0.2s ease",
              }}
            >
              ⚓ Request Boarding Pass
            </Link>
          </div>

          <p className="t-mono t-muted text-center mt-4" style={{ fontSize: 8, letterSpacing: "0.1em" }}>
            By continuing you agree to our Terms & Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
