import type { SiteProfile } from "./profile";
import type { WidgetSnippet } from "./widgets";
import { BRAND_NAME } from "@/lib/brand";

// The ready-to-paste Lovable prompt, rendered from the profile by a fixed
// template (never free-form), so every brief is consistent and testable.
// Copy comes only from the profile; anything missing is listed as a gap.

const PAGES_BY_TYPE: Record<string, string[]> = {
  trades: ["Home", "Services", "Areas we cover", "About", "Get a quote / Contact"],
  fitness: ["Home", "Classes & training", "Pricing", "Timetable / Book", "About", "Contact"],
  clinics: ["Home", "Services", "Our team", "Book an appointment", "Contact"],
};
const DEFAULT_PAGES = ["Home", "Services & prices", "About", "Book", "Contact"];

function list(items: string[]): string {
  return items.map((i) => `- ${i}`).join("\n");
}

export function renderLovablePrompt(p: SiteProfile, widgets: WidgetSnippet[]): string {
  const name = p.business.name;
  const pages = (p.business.type && PAGES_BY_TYPE[p.business.type]) || DEFAULT_PAGES;
  const bookings = widgets.some((w) => w.code.includes('data-chatalot="appointment"'));
  const out: string[] = [];

  out.push(`# Website for ${name}`);
  out.push(
    `Build a modern, mobile-first website for **${name}**${p.business.typeLabel ? `, a ${p.business.typeLabel.toLowerCase()} business` : ""} in South Africa. Use only the facts in this brief. Where something isn't given, leave a clearly marked placeholder rather than inventing it.`,
  );

  out.push("## Pages and sections");
  // Without online booking, the Book page becomes an enquiry page.
  out.push(list(pages.map((pg) => (/^book/i.test(pg) && !bookings ? "Enquire" : pg))));

  out.push("## Business details (use exactly)");
  const details: string[] = [];
  if (p.business.tagline) details.push(`Tagline: ${p.business.tagline}`);
  if (p.business.about) details.push(`About: ${p.business.about}`);
  if (p.contact.address) details.push(`Address: ${p.contact.address}`);
  if (p.contact.phone) details.push(`Phone: ${p.contact.phone}`);
  if (p.contact.email) details.push(`Email: ${p.contact.email}`);
  if (p.contact.whatsappLink) details.push(`WhatsApp: ${p.contact.whatsappLink}`);
  out.push(details.length ? list(details) : "_No contact details yet: see Gaps to fill._");

  if (p.hours.length) {
    out.push("### Opening hours");
    out.push(list(p.hours.map((h) => (h.day === "Hours" ? h.times : `${h.day}: ${h.times}`))));
  }

  if (p.services.length) {
    out.push("### Services");
    out.push(
      list(
        p.services.map((s) => {
          const bits = [s.price ?? "price on request", s.durationMinutes ? `${s.durationMinutes} min` : null].filter(Boolean).join(", ");
          return `**${s.name}** (${bits})${s.description ? `: ${s.description}` : ""}`;
        }),
      ),
    );
    out.push("Show prices exactly as listed. Where it says \"price on request\", show that wording, never a made-up amount.");
  }

  if (p.staff.length) {
    out.push("### Team");
    out.push(list(p.staff.map((s) => `${s.name}${s.role ? ` (${s.role})` : ""}${s.photoUrl ? `, photo: ${s.photoUrl}` : ""}`)));
    if (p.imagePolicy === "ai_generated") out.push("Show team members by name and role only, with no photos or AI portraits of them.");
  }

  if (p.faqs.length) {
    out.push("### FAQs");
    out.push(list(p.faqs.map((f) => `**${f.question}** ${f.answer}`)));
  }
  if (p.policies.length) {
    out.push("### Policies");
    out.push(list(p.policies.map((pol) => `**${pol.title}:** ${pol.text}`)));
  }

  out.push("## Brand");
  const brand = [`Primary colour: ${p.brand.primaryColor}`];
  if (p.brand.extraColors.length) brand.push(`Other colours from their site: ${p.brand.extraColors.join(", ")}`);
  if (p.brand.logoUrl) brand.push(`Logo: ${p.brand.logoUrl}`);
  if (p.business.tone || p.brand.copyTone) brand.push(`Tone of voice: ${[p.business.tone, p.brand.copyTone].filter(Boolean).join("; ")}`);
  out.push(list(brand));

  out.push("### Imagery");
  if (p.imagePolicy === "own" && p.website.imageUrls.length) {
    out.push(`Use the business's own photos:\n${list(p.website.imageUrls)}`);
  } else {
    out.push(
      `Use AI-generated or royalty-free images. Direction: ${p.brand.imagery} Images must not pretend to show this business's real staff, customers or premises.`,
    );
  }

  out.push(`## ${BRAND_NAME} widgets (paste as given)`);
  out.push("These connect the site to the business's AI receptionist and booking system. Paste the code exactly; don't rebuild these features.");
  for (const w of widgets) {
    out.push(`### ${w.name}\n${w.placement}\n\n\`\`\`html\n${w.code}\n\`\`\``);
  }

  out.push("## Must-haves");
  out.push(
    list([
      "Mobile-first, fast and accessible (good contrast, alt text, keyboard-friendly, visible focus)",
      `Clear calls to action on every page: ${bookings ? "book online" : "get in touch"}${p.contact.phone ? ", call" : ""}${p.contact.whatsappLink ? ", WhatsApp" : ""}`,
      "A privacy policy page that covers POPIA (South Africa's privacy law), linked in the footer",
      "South African English, prices in rand (R), 24-hour times",
    ]),
  );

  out.push("## Must-nots");
  out.push(
    list([
      "No invented reviews, testimonials, ratings, statistics, awards or client logos",
      "No services, prices or opening hours that aren't in this brief",
      "No stock photos presented as the business's real team or customers",
    ]),
  );

  if (p.missing.length) {
    out.push("## Gaps to fill");
    out.push("Ask the client for these, and leave clear placeholders until then:");
    out.push(list(p.missing));
  }
  return out.join("\n\n") + "\n";
}
