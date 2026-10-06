// Wording and parsing for review requests. Pure, so the dashboard, the
// sender and tests share them. The sending lives in review-requests.ts.

// Scores at or below this alert the owner.
export const LOW_RATING_MAX = 3;

// Must match the approved template's body word for word, with {{1}}-{{4}} =
// name, business, service, review link (see docs/SETUP.md). Also what's sent
// inside the 24h window and kept in the transcript.
export function reviewRequestText(p: { name: string; business: string; service: string; reviewUrl: string }): string {
  return (
    `Hi ${p.name}, thanks for visiting ${p.business || "us"}! How was your ${p.service}? ` +
    `Reply with a number from 1 (poor) to 5 (great).\n\n` +
    `If you have a moment, a Google review helps us a lot: ${p.reviewUrl}\n\nThank you!`
  );
}

// A reply that is only a score: "5", "4/5", "3 stars", "⭐⭐⭐⭐". Anything
// longer ("I'll come at 4") is left for the AI.
export function parseRating(text: string): number | null {
  // Phones often send ⭐ with an invisible emoji-style selector after it.
  const t = text.replace(/️/g, "").trim().replace(/[.!]+$/, "").trim();
  const digit = /^([1-5])\s*(?:\/\s*5|out of 5|stars?|⭐+)?$/iu.exec(t);
  if (digit) return Number(digit[1]);
  if (/^(?:⭐\s*){1,5}$/u.test(t)) return [...t.matchAll(/⭐/gu)].length;
  return null;
}

// The same link goes to every score — only the wording around it changes.
export function ratingReply(p: { rating: number; reviewUrl: string | null }): string {
  const thanks =
    p.rating <= LOW_RATING_MAX
      ? "Thank you for the honest feedback. We're sorry it wasn't better, and we've passed it on to the team."
      : "Thank you, we're so glad to hear it!";
  return p.reviewUrl ? `${thanks} If you'd like to share your experience, you can leave a Google review here: ${p.reviewUrl}` : thanks;
}
