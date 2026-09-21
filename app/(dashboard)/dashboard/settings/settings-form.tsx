"use client";

import { useState, useTransition } from "react";
import { updateSettingsAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type Settings = {
  business_name: string;
  tone: string;
  greeting: string;
  system_prompt_extra: string;
  handoff_contact: string;
  allowed_domains: string[];
};

export function SettingsForm({ initialSettings }: { initialSettings: Settings }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateSettingsAction(formData);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Business info</CardTitle>
          <CardDescription>
            How your AI receptionist introduces itself and talks to visitors.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="business_name">Business name</Label>
            <Input
              id="business_name"
              name="business_name"
              required
              defaultValue={initialSettings.business_name}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tone">Tone</Label>
            <Input
              id="tone"
              name="tone"
              required
              defaultValue={initialSettings.tone}
              placeholder="friendly and professional"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="greeting">Greeting</Label>
            <Input
              id="greeting"
              name="greeting"
              required
              defaultValue={initialSettings.greeting}
              placeholder="Hi! How can I help you today?"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="system_prompt_extra">Extra instructions (optional)</Label>
            <Textarea
              id="system_prompt_extra"
              name="system_prompt_extra"
              rows={3}
              defaultValue={initialSettings.system_prompt_extra}
              placeholder="Anything else the AI should know or do, e.g. mention a current promotion."
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="handoff_contact">Handoff contact (optional)</Label>
            <Input
              id="handoff_contact"
              name="handoff_contact"
              defaultValue={initialSettings.handoff_contact}
              placeholder="021 555 0134"
            />
            <p className="text-xs text-zinc-500">
              Given to visitors, and used in the fallback reply, when a human needs to step in.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Allowed domains</CardTitle>
          <CardDescription>
            Websites allowed to load your chat widget — one per line. The widget refuses to
            load anywhere else.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            id="allowed_domains"
            name="allowed_domains"
            rows={4}
            defaultValue={initialSettings.allowed_domains.join("\n")}
            placeholder="yourbusiness.co.za"
          />
        </CardContent>
      </Card>

      {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="feedback-enter text-sm text-green-600">Saved.</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
