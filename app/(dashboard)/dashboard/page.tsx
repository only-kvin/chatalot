import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>
            <Link href="/dashboard/knowledge" className="hover:underline">
              Knowledge base →
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-600 dark:text-zinc-400">
          Manage the FAQs, services, prices and policies your AI receptionist answers
          from.
        </CardContent>
      </Card>
    </div>
  );
}
