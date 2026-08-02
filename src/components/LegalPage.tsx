import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function LegalPage({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-28 anim-fade-up">
      <header>
        <p className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.18em" }}>
          {eyebrow}
        </p>
        <h1 className="t-display t-gold mt-1" style={{ fontSize: 22 }}>
          {title}
        </h1>
        <p className="t-mono t-muted mt-1" style={{ fontSize: 9, letterSpacing: "0.1em" }}>
          LAST UPDATED {updated}
        </p>
      </header>

      <div
        className="rounded-2xl px-4 py-3"
        style={{
          background: "rgba(212,160,60,0.12)",
          border: "1px solid rgba(212,160,60,0.45)",
        }}
      >
        <p className="t-mono" style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--gold-300)" }}>
          ⚠ DRAFT — PENDING LEGAL REVIEW
        </p>
        <p className="t-serif t-sec mt-1" style={{ fontSize: 12, lineHeight: 1.5 }}>
          This document is a working draft prepared for product development only. It has not been
          reviewed or approved by a qualified Kenyan advocate and is not yet a binding agreement.
        </p>
      </div>

      <article className="glass rounded-2xl p-5 legal-body">{children}</article>

      <nav className="flex flex-wrap gap-2">
        <LegalLink to="/legal/terms" label="Terms" />
        <LegalLink to="/legal/privacy" label="Privacy" />
        <LegalLink to="/legal/risk-disclosure" label="Risk Disclosure" />
      </nav>
    </div>
  );
}

function LegalLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="t-mono glass rounded-full"
      style={{
        fontSize: 9,
        letterSpacing: "0.12em",
        padding: "7px 14px",
        color: "var(--gold-300)",
        textDecoration: "none",
      }}
    >
      {label.toUpperCase()}
    </Link>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h2 className="t-display t-parch" style={{ fontSize: 15, marginBottom: 6 }}>
        {heading}
      </h2>
      <div className="t-serif t-sec" style={{ fontSize: 13, lineHeight: 1.65 }}>
        {children}
      </div>
    </section>
  );
}
