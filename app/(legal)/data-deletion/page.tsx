import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Delete your data · ChatAlot",
  description: "How to ask ChatAlot to delete your conversations and contact details.",
};

export default function DataDeletionPage() {
  const email = LEGAL.contactEmail;
  const subject = encodeURIComponent("Data deletion request");
  return (
    <>
      <h1>Delete your data</h1>
      <p>
        You can ask us to delete the personal information held about you from chats with any
        business that uses {LEGAL.operator}, on its website or on WhatsApp.
      </p>

      <h2>How to ask</h2>
      <p>
        Email <a href={`mailto:${email}?subject=${subject}`}>{email}</a> with the subject
        &quot;Data deletion request&quot; and include:
      </p>
      <ul>
        <li>The name of the business you chatted with.</li>
        <li>
          For WhatsApp: the phone number you messaged from. For website chats: the name, phone
          number or email address you gave, and roughly when you chatted.
        </li>
      </ul>
      <p>We may ask you to confirm the request from that phone number or email address.</p>

      <h2>What we delete</h2>
      <ul>
        <li>Your conversation messages.</li>
        <li>Contact details you shared, and enquiries or leads created from them.</li>
        <li>Booking records linked to you.</li>
      </ul>
      <p>
        We complete requests within {LEGAL.deletionDays} days and confirm by email. We may keep
        information where the law requires us to, and we will tell you if that applies.
      </p>

      <p>
        More detail is in our <Link href="/privacy">privacy policy</Link>.
      </p>
    </>
  );
}
