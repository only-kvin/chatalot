import { PageSkeleton } from "@/components/dashboard/page-skeleton";

// Shown immediately on navigation between dashboard pages (and prefetched with
// the links), so a click responds at once instead of waiting on the server.
export default function Loading() {
  return <PageSkeleton />;
}
