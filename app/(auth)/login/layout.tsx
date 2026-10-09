import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";

// The page itself is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: `Staff sign in · ${BRAND_NAME}`,
  description: `Sign in to your ${BRAND_NAME} dashboard.`,
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
