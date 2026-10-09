import { BRAND_DESCRIPTION, BRAND_NAME, BRAND_URL } from "@/lib/brand";

// schema.org JSON-LD for search engines: who we are and what the product is.
// No ratings, review counts or prices — we only state what's true.
const DATA = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND_NAME,
    url: BRAND_URL,
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND_NAME,
    url: BRAND_URL,
    description: BRAND_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
  },
];

export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      // Built from constants above, never user input, so this is safe.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(DATA).replace(/</g, "\\u003c") }}
    />
  );
}
