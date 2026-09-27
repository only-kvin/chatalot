// Detects a visitor asking for a person, so the handoff happens in code instead
// of depending on the model choosing to call request_human (it sometimes only
// offers to). Deliberately narrow: a talk/speak-style verb aimed at a person,
// an explicit "real person", or rejecting the bot. "Can someone do my hair
// tomorrow?" must not match.
const PEOPLE =
  "(?:a |an |the |your |to )*(?:human|person|real person|someone|somebody|agent|staff|staff member|team member|representative|rep|manager|owner|receptionist|operator)";

const PATTERNS: RegExp[] = [
  // "can I talk to a human", "let me speak with someone", "connect me to an agent"
  new RegExp(`\\b(?:talk|speak|chat|connect|transfer|put me through)\\b[^.?!]{0,25}\\b${PEOPLE}\\b`),
  // "is there a real person", "a live human please"
  /\b(?:real|actual|live) (?:person|human|people)\b/,
  // "I don't want to speak with a chat bot", "not a bot please"
  /\b(?:not|don't|do not|no more|stop)\b[^.?!]{0,25}\b(?:bot|robot|ai|machine|chat ?bot)\b/,
  // A bare keyword on its own: "human", "agent please"
  /^(?:human|agent|person|operator|representative)(?: please)?[.!?]*$/,
];

export function wantsHuman(message: string): boolean {
  const text = message.toLowerCase().replace(/[‘’`]/g, "'").replace(/\s+/g, " ").trim();
  return PATTERNS.some((p) => p.test(text));
}
