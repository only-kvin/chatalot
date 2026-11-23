// How an event's status reads in the dashboard.
export const STATUS_BADGE: Record<string, { label: string; variant: "success" | "outline" | "secondary" }> = {
  published: { label: "Published", variant: "success" },
  draft: { label: "Draft", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "secondary" },
};
