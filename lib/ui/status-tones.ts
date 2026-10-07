// Which status chip colour (components/ui/badge.tsx) each status gets.
type Tone = "new" | "neutral" | "success" | "warning" | "danger";

const LEAD: Record<string, Tone> = {
  new: "new",
  contacted: "neutral",
  booked: "success",
  won: "success",
  lost: "danger",
};

export function leadTone(status: string): Tone {
  return LEAD[status] ?? "neutral";
}

// "human" = the team has taken over, so it needs someone's attention.
export function conversationTone(status: string): Tone {
  if (status === "human") return "warning";
  if (status === "closed") return "neutral";
  return "new";
}

export const CONVERSATION_LABEL: Record<string, string> = {
  ai: "AI",
  human: "Needs you",
  closed: "Closed",
};
