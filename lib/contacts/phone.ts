// A customer's identity: their phone in one form — country code, digits only
// (27821234567). WhatsApp sends "27682190818" while customers type
// "068 219 0818" or "+27 68 219 0818"; all must be the same person.
// Must match pg_temp.canonical_phone in the customer_database migration.
export function canonicalPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  // Every tenant is South African, so a 10-digit number starting 0 is local.
  if (/^0\d{9}$/.test(digits)) return `27${digits.slice(1)}`;
  if (/^[1-9]\d{9,14}$/.test(digits)) return digits;
  return null;
}

// "27682190818" -> "+27 68 219 0818" for display; other numbers get a "+".
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const sa = /^27(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return sa ? `+27 ${sa[1]} ${sa[2]} ${sa[3]}` : `+${e164}`;
}
