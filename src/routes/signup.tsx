import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { CompassEmblem } from "@/components/CompassEmblem";
import { ParallaxBackground } from "@/components/ParallaxBackground";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign Up — Golden Compass" },
      { name: "description", content: "Join the fleet. Create your Golden Compass account." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!fullName || !email || !phone || !password) {
      setError("All fields are required");
      return;
    }
    if (password.length < 6) {
      setError("Passphrase must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password, fullName, phone);
      setSuccess(true);
      setTimeout(() => navigate({ to: "/login" }), 1500);
    } catch (err: any) {
      setError(err.message || "Registration failed");
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
        <div className="flex flex-col items-center text-center" style={{ padding: "32px 28px 20px" }}>
          <div className="anim-emblem anim-float">
            <CompassEmblem size={56} />
          </div>
          <h1
            className="t-display t-gold anim-fade-up mt-3"
            style={{ fontSize: 20, letterSpacing: "0.04em", animationDelay: "0.3s" }}
          >
            Join the Fleet
          </h1>
          <p
            className="t-fell t-sec anim-fade-up"
            style={{ fontSize: 14, fontStyle: "italic", animationDelay: "0.4s" }}
          >
            Request your boarding pass
          </p>
        </div>

        <div className="px-5 anim-fade-up" style={{ animationDelay: "0.5s" }}>
          <div className="glass glass-shine rounded-2xl p-6 mb-4">
            <form onSubmit={handleSubmit}>
              <div className="gc-input-wrap mb-4">
                <label className="gc-input-label">Full Name</label>
                <input
                  type="text"
                  className="gc-input"
                  placeholder="Alexander K. Mwenda"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="gc-input-wrap mb-4">
                <label className="gc-input-label">Email Address</label>
                <input
                  type="email"
                  className="gc-input"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="gc-input-wrap mb-4">
                <label className="gc-input-label">Phone (M-Pesa)</label>
                <input
                  type="tel"
                  className="gc-input"
                  placeholder="+254 7XX XXX XXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="gc-input-wrap mb-4">
                <label className="gc-input-label">Passphrase</label>
                <input
                  type="password"
                  className="gc-input"
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <p className="t-mono mb-3" style={{ fontSize: 11, color: "var(--gc-danger)" }}>
                  {error}
                </p>
              )}

              {success ? (
                <div className="text-center py-4">
                  <p className="t-display t-gold" style={{ fontSize: 14 }}>
                    ✓ Check your email to confirm
                  </p>
                  <p className="t-mono t-muted mt-2" style={{ fontSize: 10 }}>
                    Redirecting to login...
                  </p>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-brass w-full"
                  style={{ height: 52, fontSize: 12 }}
                >
                  {loading ? (
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
                    <>⚓ Board the Ship</>
                  )}
                </button>
              )}
            </form>
          </div>

          <div className="text-center mb-6">
            <p className="t-fell t-sec" style={{ fontSize: 13, fontStyle: "italic" }}>
              Already aboard?{" "}
              <Link to="/login" className="t-gold" style={{ textDecoration: "none" }}>
                Navigate In →
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
