// Does the business cover the customer's suburb or town? Compared with the
// owner's typed list of areas: case-insensitive, trimmed, and forgiving of
// "Sandton" vs "Sandton, Johannesburg". No geocoding. Pure, so the widgets
// use it too (to show the "we'll confirm" message as they type).

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9,]+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .trim();
}

function parts(s: string): string[] {
  return normalize(s).split(",").map((p) => p.trim()).filter(Boolean);
}

// A listed "Sandton, Johannesburg" covers Sandton (not all of Johannesburg):
// its forms are the whole name and its first part.
function listedForms(area: string): string[] {
  const p = parts(area);
  return p.length ? [p.join(" "), p[0]] : [];
}

// What the customer typed, every way it could name an area:
// "Sandton, Johannesburg" -> "sandton johannesburg", "sandton", "johannesburg".
function givenForms(value: string): string[] {
  const p = parts(value);
  return p.length ? [p.join(" "), ...p] : [];
}

// True when the suburb (or the city) names a listed area. An empty list
// means the business hasn't limited its area: everything matches.
export function inServiceArea(areas: string[], suburb: string | null | undefined, city?: string | null): boolean {
  const listed = areas.flatMap(listedForms);
  if (!listed.length) return true;
  const given = [suburb, city].flatMap((v) => (v ? givenForms(v) : []));
  return given.some((g) => listed.includes(g));
}
