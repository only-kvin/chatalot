import type { Metadata } from "next";
import Link from "next/link";
import { Placeholder } from "@/components/marketing/placeholder";
import { LEGAL } from "@/lib/legal";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Terms of service · ${BRAND_NAME}`,
  description: `The terms for businesses using ${BRAND_NAME}.`,
};

// First draft, written in plain language. Every section needs a lawyer's
// review before launch; the [LEGAL REVIEW] markers show in development only.
export default function TermsPage() {
  const email = LEGAL.contactEmail;
  return (
    <>
      <h1>Terms of service</h1>
      <Placeholder label="LEGAL REVIEW: whole document" />
      <p>
        These terms apply to businesses that use {BRAND_NAME} (&quot;the service&quot;), run by{" "}
        {LEGAL.operator} (&quot;we&quot;, &quot;us&quot;). By creating an account or using the
        service, your business agrees to them.
      </p>

      <h2>What the service does</h2>
      <p>
        {BRAND_NAME} provides an AI receptionist that answers your customers on your website and on
        WhatsApp using information you give it, captures enquiries, and, where your plan includes
        it, takes bookings and sends reminders and review requests.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must give accurate details and keep your sign-in email secure.</li>
        <li>You are responsible for what people on your team do in your account.</li>
        <li>Tell us straight away at <a href={`mailto:${email}`}>{email}</a> if you think your account has been misused.</li>
      </ul>

      <h2>Your information and your customers&apos; information</h2>
      <p>
        You own your business information and your customers&apos; information. Under South
        Africa&apos;s Protection of Personal Information Act (POPIA), your business is the{" "}
        <strong>responsible party</strong> and we are your <strong>operator</strong>: we process
        personal information only to provide the service, as described in our{" "}
        <Link href="/privacy">privacy policy</Link>.
        <Placeholder label="LEGAL REVIEW: operator agreement terms (POPIA s21)" />
      </p>
      <p>
        You must have a lawful reason to contact your customers, including on WhatsApp, and must
        follow WhatsApp&apos;s business and commerce policies.
      </p>

      <h2>The AI&apos;s answers</h2>
      <p>
        The AI answers from the knowledge you provide and is told not to invent prices,
        availability or policies. It can still make mistakes. Keep your knowledge up to date, and
        review conversations; you can take over any conversation at any time.
        <Placeholder label="LEGAL REVIEW: AI accuracy disclaimer" />
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don&apos;t use the service for anything unlawful, misleading or harmful.</li>
        <li>Don&apos;t send spam or unsolicited marketing through it.</li>
        <li>Don&apos;t try to break, overload or get around the limits of the service.</li>
      </ul>

      <h2>Plans and fees</h2>
      <p>
        Fees depend on your plan, as shown on the pricing page or agreed with us in writing.
        <Placeholder label="LEGAL REVIEW: billing, VAT, trial and cancellation terms" />
      </p>

      <h2>Ending the service</h2>
      <p>
        You can stop using the service at any time. We may suspend or close an account that breaks
        these terms. When an account closes, you can ask us to delete your data, as explained on
        the <Link href="/data-deletion">data deletion</Link> page.
      </p>

      <h2>Liability</h2>
      <p>
        We work hard to keep the service available and correct, but provide it &quot;as is&quot;.
        <Placeholder label="LEGAL REVIEW: limitation of liability (Consumer Protection Act)" />
      </p>

      <h2>Changes and governing law</h2>
      <p>
        We may update these terms and will tell you about important changes before they take
        effect. These terms are governed by the laws of the Republic of South Africa.
      </p>
    </>
  );
}
