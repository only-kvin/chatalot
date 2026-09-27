import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy · ChatAlot",
  description: "How ChatAlot handles personal information in website chats and WhatsApp conversations.",
};

export default function PrivacyPage() {
  const email = LEGAL.contactEmail;
  return (
    <>
      <h1>Privacy policy</h1>
      <p>
        {LEGAL.operator} provides an AI receptionist that answers questions for small businesses on
        their websites and on WhatsApp. This policy explains what personal information is handled
        when you chat with a business that uses {LEGAL.operator}, and your rights under South
        Africa&apos;s Protection of Personal Information Act (POPIA).
      </p>

      <h2>Who is responsible</h2>
      <p>
        The business you are chatting with is the <strong>responsible party</strong> for your
        information: it decides why it is collected. {LEGAL.operator} is the{" "}
        <strong>operator</strong> that processes it on the business&apos;s behalf. You can contact
        the business directly, or us at <a href={`mailto:${email}`}>{email}</a>.
      </p>

      <h2>What we process</h2>
      <ul>
        <li>The messages you send and the replies you receive.</li>
        <li>
          Contact details you choose to share, such as your name, phone number and email address,
          and what you are enquiring about.
        </li>
        <li>Booking details if you make a booking: the service, date and time.</li>
        <li>On WhatsApp, your WhatsApp phone number, which identifies the conversation.</li>
        <li>
          On websites, a random session ID stored in your browser so your chat continues when you
          return, and your IP address, used only to prevent abuse (rate limiting).
        </li>
      </ul>
      <p>
        The assistant asks for your permission before saving your contact details for the business
        to follow up.
      </p>

      <h2>Why we process it</h2>
      <ul>
        <li>To answer your questions about the business.</li>
        <li>To pass your enquiry or booking to the business, and notify it by email.</li>
        <li>To let a staff member take over the conversation when you ask for a person.</li>
        <li>To keep the service secure and prevent abuse.</li>
      </ul>
      <p>We do not sell your information or use it for advertising.</p>

      <h2>Service providers</h2>
      <p>
        We use these providers to run the service. Some are outside South Africa, so your
        information may be transferred abroad; each is bound by its own data-protection terms.
      </p>
      <ul>
        <li>Supabase: database and sign-in (data stored in the European Union).</li>
        <li>Vercel: application hosting.</li>
        <li>An AI model provider that generates the replies (currently Groq).</li>
        <li>Voyage AI: turns messages into search vectors to find relevant business information.</li>
        <li>Upstash: short-lived counters for rate limiting.</li>
        <li>Resend: notification emails to the business.</li>
        <li>Meta (WhatsApp): delivery of WhatsApp messages.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Conversations and contact details are kept for as long as the business uses{" "}
        {LEGAL.operator}, or until you or the business ask us to delete them.
      </p>

      <h2>Your rights</h2>
      <p>
        Under POPIA you can ask to access, correct or delete your personal information, and object
        to it being processed. See <Link href="/data-deletion">how to delete your data</Link>. If
        you are unhappy with how your request is handled, you can complain to the Information
        Regulator of South Africa (inforegulator.org.za).
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href={`mailto:${email}`}>{email}</a>.
      </p>
    </>
  );
}
