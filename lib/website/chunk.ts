import { createHash } from "node:crypto";

// Splits a page into chunks of roughly 300–500 words along headings and
// paragraphs, with a little overlap so an answer that spans a boundary is
// still found. Each chunk starts with the page title for context. Typed
// knowledge items stay one chunk each (lib/agent/retrieval.ts).

const TARGET_WORDS = 450;
const MIN_WORDS_BEFORE_HEADING_BREAK = 300;
const OVERLAP_WORDS = 40;

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export function chunkPage(title: string, text: string): string[] {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const chunks: string[][] = [];
  let current: string[] = [];
  let count = 0;

  const flush = () => {
    if (current.length) chunks.push(current);
    // Carry the end of this chunk into the next one.
    const tail = current.join(" ").split(/\s+/).slice(-OVERLAP_WORDS).join(" ");
    current = tail && chunks.length ? [`…${tail}`] : [];
    count = words(tail);
  };

  for (const block of blocks) {
    const n = words(block);
    const isHeading = block.startsWith("#");
    if (count > 0 && (count + n > TARGET_WORDS || (isHeading && count >= MIN_WORDS_BEFORE_HEADING_BREAK))) flush();
    // A single huge block (no paragraphs): split it by words.
    if (n > TARGET_WORDS) {
      const parts = block.split(/\s+/);
      for (let i = 0; i < parts.length; i += TARGET_WORDS - OVERLAP_WORDS) {
        current.push(parts.slice(i, i + TARGET_WORDS).join(" "));
        count += Math.min(TARGET_WORDS, parts.length - i);
        flush();
      }
      continue;
    }
    current.push(block);
    count += n;
  }
  // The last chunk, unless it's only the overlap carried from the one before.
  if (current.length && !(current.length === 1 && current[0].startsWith("…") && chunks.length)) chunks.push(current);

  const heading = title ? `${title}\n\n` : "";
  return chunks.map((c) => heading + c.join("\n\n"));
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
