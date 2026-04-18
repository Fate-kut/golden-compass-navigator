import { useState } from "react";
import { useNotifications } from "@/hooks/useNotifications";

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative cursor-pointer border-none bg-transparent"
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(201,168,76,0.18)",
          color: "var(--gold-300)",
          fontSize: 18,
        }}
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span
            className="absolute"
            style={{
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 9,
              background: "var(--gc-danger, #d4554a)",
              color: "#fff",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 10px rgba(212,85,74,0.5)",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute z-50"
            style={{
              top: 48,
              right: 0,
              width: 320,
              maxHeight: 420,
              background: "rgba(7,12,22,0.96)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(201,168,76,0.22)",
              borderRadius: 14,
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              className="flex items-center justify-between"
              style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span className="t-display t-gold" style={{ fontSize: 12, letterSpacing: "0.1em" }}>
                NOTIFICATIONS
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="t-mono cursor-pointer border-none bg-transparent"
                  style={{ fontSize: 9, color: "var(--gold-300)", letterSpacing: "0.08em" }}
                >
                  MARK ALL READ
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="text-center" style={{ padding: 32 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                  <p className="t-mono t-muted" style={{ fontSize: 10 }}>
                    NO NOTIFICATIONS YET
                  </p>
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => !n.read_at && markRead(n.id)}
                    className="w-full text-left cursor-pointer border-none block"
                    style={{
                      padding: "12px 14px",
                      background: n.read_at ? "transparent" : "rgba(201,168,76,0.06)",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      borderLeft: n.read_at ? "2px solid transparent" : "2px solid var(--gold-300)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="t-serif t-parch" style={{ fontSize: 13, lineHeight: 1.3 }}>
                        {n.title}
                      </span>
                      <span className="t-mono t-muted shrink-0" style={{ fontSize: 9 }}>
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    {n.body && (
                      <p className="t-mono t-muted mt-1" style={{ fontSize: 10, lineHeight: 1.4 }}>
                        {n.body}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
