import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section } from "@/components/LegalPage";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Golden Compass" },
      { name: "description", content: "Draft privacy policy explaining how Golden Compass collects, uses and protects investor data under Kenya's Data Protection Act." },
      { property: "og:title", content: "Privacy Policy — Golden Compass" },
      { property: "og:description", content: "How we collect, use and protect your personal data." },
      { property: "og:url", content: "/legal/privacy" },
    ],
    links: [{ rel: "canonical", href: "/legal/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage eyebrow="THE SEALED CHART" title="Privacy Policy" updated="AUGUST 2026">
      <Section heading="1. Scope">
        This policy explains how Golden Compass, as data controller, handles personal data under
        the Data Protection Act, 2019 (Kenya) and the regulations made under it.
      </Section>
      <Section heading="2. What we collect">
        Identity and KYC data (full name, national ID or passport number, date of birth,
        address, employment status, income band, source of funds); contact data (email, phone);
        financial data (wallet balance, deposits, withdrawals, holdings, orders); technical data
        (device, IP address, log data); and support correspondence.
      </Section>
      <Section heading="3. Why we use it">
        To open and operate your account; to execute deposits, investments and orders; to meet
        KYC, anti-money-laundering, tax and CMA reporting obligations; to prevent fraud; to
        provide support; and to improve the platform. Our lawful bases are performance of a
        contract, compliance with legal obligations, and our legitimate interests in operating a
        secure service.
      </Section>
      <Section heading="4. Who we share it with">
        Our licensed brokers and custodians, mobile money and payment providers, identity
        verification and market data vendors, cloud hosting providers, professional advisers,
        and regulators or law enforcement where legally required. We do not sell personal data.
      </Section>
      <Section heading="5. Transfers outside Kenya">
        Some service providers process data outside Kenya. Where that happens we rely on
        appropriate safeguards and contractual protections as required by the Data Protection
        Act.
      </Section>
      <Section heading="6. Retention">
        KYC and transaction records are retained for at least seven years after account closure
        to meet Kenyan anti-money-laundering and tax record-keeping requirements. Other data is
        kept only as long as needed for the purpose collected.
      </Section>
      <Section heading="7. Your rights">
        You may request access, correction, erasure (where no legal retention duty applies),
        restriction, objection, and data portability, and may withdraw consent where consent is
        the basis of processing. Requests can be made through in-app support. You may also lodge
        a complaint with the Office of the Data Protection Commissioner.
      </Section>
      <Section heading="8. Security">
        Data is encrypted in transit and at rest, access is restricted on a need-to-know basis,
        and account activity is logged. No system is perfectly secure; please protect your own
        credentials and report suspected compromise immediately.
      </Section>
    </LegalPage>
  );
}
