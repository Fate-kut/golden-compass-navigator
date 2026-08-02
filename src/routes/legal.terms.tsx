import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section } from "@/components/LegalPage";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Golden Compass" },
      { name: "description", content: "Draft terms of service governing use of the Golden Compass investment platform in Kenya." },
      { property: "og:title", content: "Terms of Service — Golden Compass" },
      { property: "og:description", content: "Draft terms governing use of the Golden Compass investment platform." },
      { property: "og:url", content: "/legal/terms" },
    ],
    links: [{ rel: "canonical", href: "/legal/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage eyebrow="THE ARTICLES" title="Terms of Service" updated="AUGUST 2026">
      <Section heading="1. Who we are">
        Golden Compass ("we", "us") operates a digital investment platform offering pooled
        investment products and access to listed securities for retail investors in Kenya.
        Our activities are intended to be conducted under licences issued by the Capital
        Markets Authority (CMA) of Kenya. Licence particulars will be published here before
        launch.
      </Section>
      <Section heading="2. Eligibility">
        You must be at least 18 years old, resident in Kenya (or otherwise permitted to hold a
        Kenyan investment account), and able to complete our Know Your Customer (KYC) and
        anti-money-laundering checks under the Proceeds of Crime and Anti-Money Laundering Act.
        We may refuse, suspend or close an account where these checks cannot be completed.
      </Section>
      <Section heading="3. Your account">
        You are responsible for keeping your login credentials and M-Pesa PIN confidential and
        for all activity carried out through your account. Notify us immediately of any
        unauthorised access. We may suspend access where we reasonably suspect fraud, misuse or
        a legal obligation to do so.
      </Section>
      <Section heading="4. Deposits, wallet and withdrawals">
        Funds deposited are credited to your platform wallet and held with our appointed
        custodian, separate from our own operating funds. Withdrawals are paid to the mobile
        money number registered on your verified account. Processing times depend on the payment
        provider and may be delayed by compliance review.
      </Section>
      <Section heading="5. Investments and orders">
        Investment instructions and securities orders are executed on a best-efforts basis
        through our licensed partners. Prices shown may be delayed and are indicative only.
        Executed prices may differ. Orders may be rejected, partially filled or cancelled by the
        market or the broker.
      </Section>
      <Section heading="6. Fees">
        Applicable management, exit and transaction fees are disclosed on each product page
        before you confirm an instruction. We will give at least 30 days' notice of fee changes.
      </Section>
      <Section heading="7. No investment advice">
        Unless we expressly state otherwise in writing, nothing on the platform (including
        AI-generated guidance) constitutes investment, tax or legal advice or a personal
        recommendation. You are responsible for your investment decisions.
      </Section>
      <Section heading="8. Liability">
        Nothing in these terms excludes liability that cannot lawfully be excluded. Subject to
        that, we are not liable for market losses, for delays caused by third-party payment,
        market data or broker systems, or for indirect or consequential loss.
      </Section>
      <Section heading="9. Complaints and disputes">
        Complaints may be raised through the in-app support channel; unresolved complaints may
        be escalated to the Capital Markets Authority. These terms are governed by the laws of
        Kenya and subject to the exclusive jurisdiction of the Kenyan courts.
      </Section>
      <Section heading="10. Changes">
        We may amend these terms. Material changes will be notified in-app before they take
        effect; continued use after that date constitutes acceptance.
      </Section>
    </LegalPage>
  );
}
