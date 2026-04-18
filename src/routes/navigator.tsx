import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/navigator")({
  component: NavigatorPage,
});

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "How is my portfolio performing?",
  "Explain the Treasury Vault pool",
  "What's my current allocation?",
  "Should I diversify more?",
];

function NavigatorPage() {
  const { user, loading } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" />;

  const send = async (text: string) => {
    if (!text.trim() || streaming) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);

    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-navigator`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: next }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) toast.error("Rate limit hit. Try again in a moment.");
        else if (resp.status === 402) toast.error("AI credits depleted.");
        else toast.error("Navigator unavailable");
        setStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistant = "";
      setMessages((p) => [...p, { role: "assistant", content: "" }]);

      let done = false;
      while (!done) {
        const { value, done: rDone } = await reader.read();
        if (rDone) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const j = line.slice(6).trim();
          if (j === "[DONE]") {
            done = true;
            break;
          }
          try {
            const p = JSON.parse(j);
            const c = p.choices?.[0]?.delta?.content;
            if (c) {
              assistant += c;
              setMessages((prev) =>
                prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistant } : m)),
              );
            }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Connection lost");
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ minHeight: "100%" }}>
      <header style={{ padding: "20px 20px 12px" }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 28 }}>🧭</span>
          <div>
            <h1 className="t-display t-gold" style={{ fontSize: 18 }}>
              AI Navigator
            </h1>
            <p className="t-mono t-muted" style={{ fontSize: 9, letterSpacing: "0.1em" }}>
              YOUR PORTFOLIO GUIDE
            </p>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ padding: "8px 16px 16px" }}>
        {messages.length === 0 ? (
          <div className="text-center" style={{ paddingTop: 32 }}>
            <p className="t-serif t-parch" style={{ fontSize: 14, lineHeight: 1.5 }}>
              Ahoy. Ask me anything about your investments, the available pools, or how this voyage works.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left cursor-pointer"
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(201,168,76,0.2)",
                    background: "rgba(255,255,255,0.03)",
                    color: "var(--parchment)",
                    fontFamily: "var(--font-serif)",
                    fontSize: 12,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className="mb-3"
              style={{
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "85%",
                  padding: "10px 14px",
                  borderRadius: 14,
                  background:
                    m.role === "user"
                      ? "linear-gradient(180deg, rgba(201,168,76,0.18), rgba(201,168,76,0.08))"
                      : "rgba(255,255,255,0.04)",
                  border: m.role === "user" ? "1px solid rgba(201,168,76,0.28)" : "1px solid rgba(255,255,255,0.06)",
                  color: "var(--parchment)",
                  fontSize: 13,
                  lineHeight: 1.5,
                  fontFamily: m.role === "user" ? "var(--font-serif)" : "var(--font-serif)",
                }}
              >
                {m.role === "assistant" ? (
                  <div className="prose-navigator">
                    <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
                  </div>
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))
        )}
        {streaming && messages[messages.length - 1]?.role === "user" && (
          <div className="t-mono t-muted" style={{ fontSize: 10, padding: "4px 6px" }}>
            Navigator is charting…
          </div>
        )}
      </div>

      <div
        style={{
          padding: "10px 14px 14px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(7,12,22,0.7)",
          backdropFilter: "blur(20px)",
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
            placeholder="Ask the Navigator…"
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(201,168,76,0.22)",
              background: "rgba(255,255,255,0.04)",
              color: "var(--parchment)",
              fontFamily: "var(--font-serif)",
              fontSize: 13,
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="btn-brass"
            style={{ padding: "0 18px", fontSize: 11, opacity: streaming || !input.trim() ? 0.5 : 1 }}
          >
            ➤
          </button>
        </form>
      </div>
    </div>
  );
}
