"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePaymentAccountAction, setPaymentsEnabledAction, testPaymentAccountAction } from "./payment-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// What a member may see of the account: never the key or passphrase.
export type PaymentAccountView = {
  mode: "sandbox" | "live";
  merchant_id: string;
  status: "unverified" | "active" | "disabled";
  verified_at: string | null;
  last_error: string | null;
} | null;

function StatusBadge({ account }: { account: PaymentAccountView }) {
  if (!account) return <Badge variant="secondary">Not connected</Badge>;
  if (account.status === "disabled") return <Badge variant="secondary">Turned off</Badge>;
  if (account.status === "unverified") return <Badge variant="destructive">Not working yet</Badge>;
  return <Badge>{account.mode === "sandbox" ? "On: test mode" : "On"}</Badge>;
}

export function PaymentSettingsCard({
  account,
  windowMinutes,
  isOwner,
}: {
  account: PaymentAccountView;
  windowMinutes: number;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "ok" | "warn"; text: string } | null>(null);
  const [mode, setMode] = useState<"sandbox" | "live">(account?.mode ?? "sandbox");

  function run(action: () => Promise<{ error: string | null; warning?: string | null }>, okText: string) {
    setMessage(null);
    startTransition(async () => {
      const r = await action();
      if (r.error) setMessage({ kind: "error", text: r.error });
      else if (r.warning) setMessage({ kind: "warn", text: r.warning });
      else setMessage({ kind: "ok", text: okText });
      router.refresh();
    });
  }

  const saved = Boolean(account);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Payments</CardTitle>
          <StatusBadge account={account} />
        </div>
        <CardDescription>
          Take deposits or full payment when customers book, through your own PayFast account. The money goes straight
          to you; refunds and disputes are handled in PayFast. Choose which services need payment on the Services page.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {account?.last_error && account.status !== "active" && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {account.last_error}
          </p>
        )}

        {!isOwner ? (
          <p className="text-sm text-muted-foreground">
            {saved
              ? `Connected to PayFast merchant ${account?.merchant_id}${account?.mode === "sandbox" ? " (test mode)" : ""}. Only the business owner can change this.`
              : "Only the business owner can connect a PayFast account."}
          </p>
        ) : (
          <form action={(fd) => run(() => savePaymentAccountAction(fd), "Saved and connected to PayFast.")} className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Mode</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="mode" value="sandbox" checked={mode === "sandbox"} onChange={() => setMode("sandbox")} />
                Test (PayFast sandbox, no real money)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="mode" value="live" checked={mode === "live"} onChange={() => setMode("live")} />
                Live (real payments)
              </label>
              <p className="text-xs text-muted-foreground">
                {mode === "sandbox"
                  ? "Use the Merchant ID, key and passphrase from sandbox.payfast.co.za."
                  : "Use the details from your live PayFast account: My Account → Integration."}
              </p>
            </fieldset>

            <div className="flex flex-wrap gap-4">
              <div className="flex min-w-48 flex-1 flex-col gap-2">
                <Label htmlFor="merchant_id">Merchant ID</Label>
                <Input
                  id="merchant_id"
                  name="merchant_id"
                  inputMode="numeric"
                  required
                  autoComplete="off"
                  defaultValue={account?.merchant_id ?? ""}
                  placeholder="10000100"
                />
              </div>
              <div className="flex min-w-48 flex-1 flex-col gap-2">
                <Label htmlFor="merchant_key">Merchant key</Label>
                <Input
                  id="merchant_key"
                  name="merchant_key"
                  type="password"
                  required={!saved}
                  autoComplete="off"
                  placeholder={saved ? "Saved: leave blank to keep" : "46f0cd694581a"}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="passphrase">Passphrase</Label>
              <Input
                id="passphrase"
                name="passphrase"
                type="password"
                required={!saved}
                autoComplete="new-password"
                placeholder={saved ? "Saved: leave blank to keep" : "The passphrase you set in PayFast"}
              />
              <p className="text-xs text-muted-foreground">
                Set it in PayFast under Settings → Security (8–64 letters, numbers, dots, dashes or underscores), then
                enter the same one here. It proves payment confirmations really come from PayFast.
              </p>
            </div>

            <div className="flex w-56 flex-col gap-2">
              <Label htmlFor="payment_window_minutes">Hold an unpaid booking for (min)</Label>
              <Input
                id="payment_window_minutes"
                name="payment_window_minutes"
                type="number"
                min={10}
                max={1440}
                defaultValue={windowMinutes}
              />
              <p className="text-xs text-muted-foreground">After this the slot is freed for someone else.</p>
            </div>

            {message && (
              <p
                aria-live="polite"
                className={`feedback-enter text-sm ${
                  message.kind === "error" ? "text-red-600" : message.kind === "warn" ? "text-amber-600" : "text-green-700 dark:text-green-400"
                }`}
              >
                {message.text}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Checking with PayFast…" : saved ? "Save and test" : "Connect PayFast"}
              </Button>
              {saved && (
                <Button type="button" variant="outline" disabled={pending} onClick={() => run(testPaymentAccountAction, "PayFast accepted your details.")}>
                  Test connection
                </Button>
              )}
              {saved && account?.status !== "disabled" && (
                <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => setPaymentsEnabledAction(false), "Payments turned off. Customers won't be asked to pay.")}>
                  Turn off
                </Button>
              )}
              {account?.status === "disabled" && (
                <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => setPaymentsEnabledAction(true), "Payments are back on.")}>
                  Turn back on
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
