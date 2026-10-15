"use client";

import { useState, useTransition } from "react";
import { removeChatbotIconAction, updateWidgetSettingsAction, uploadChatbotIconAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type WidgetSettings = {
  primary_color: string;
  position: "bottom-right" | "bottom-left";
  avatar_url: string;
  assistant_name: string;
  icon_on_launcher: boolean;
  launcher_text: string;
  teaser_text: string;
  quick_replies: string[];
  whatsapp_link: string;
};

export function CopySnippetButton({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked (permissions, non-HTTPS) — the snippet is
      // still visible to select and copy by hand.
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy} data-echo="widget.copy">
      {copied ? "Copied!" : "Copy snippet"}
    </Button>
  );
}

// The chatbot's icon: its own form, since a file upload can't sit inside the
// appearance form. Saves straight away and refreshes the preview.
function ChatbotIcon({ url, onChange }: { url: string; onChange: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  function run(action: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setFormKey((k) => k + 1);
      onChange();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chatbot icon</CardTitle>
        <CardDescription>Your chatbot&apos;s picture, shown in the chat header. A logo or a friendly face works well.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small preview of an uploaded, externally hosted image
          <img src={url} alt="Current chatbot icon" className="size-14 rounded-full border object-cover" />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-full border bg-muted text-xs text-muted-foreground">
            None
          </div>
        )}
        <form key={formKey} action={(formData) => run(() => uploadChatbotIconAction(formData))} className="flex flex-wrap items-center gap-2">
          <Label htmlFor="icon" className="sr-only">
            Chatbot icon
          </Label>
          <Input id="icon" name="icon" type="file" accept="image/jpeg,image/png,image/webp" required className="max-w-64" />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Uploading…" : url ? "Replace icon" : "Upload icon"}
          </Button>
          {url && (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(removeChatbotIconAction)}>
              Remove
            </Button>
          )}
        </form>
        <p className="w-full text-xs text-muted-foreground">JPEG, PNG or WebP, up to 2 MB. Square images look best.</p>
        {error && <p className="feedback-enter w-full text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function WidgetEditor({
  initialSettings,
  snippet,
}: {
  initialSettings: WidgetSettings;
  snippet: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateWidgetSettingsAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Remount the preview iframe so it reloads against the saved settings.
      setPreviewKey((k) => k + 1);
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Install snippet</CardTitle>
            <CardDescription>Paste this once into your website&apos;s HTML.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-start justify-between gap-4">
            <code className="block flex-1 overflow-x-auto rounded bg-muted p-3 text-xs">
              {snippet}
            </code>
            <CopySnippetButton snippet={snippet} />
          </CardContent>
        </Card>

        <ChatbotIcon url={initialSettings.avatar_url} onChange={() => setPreviewKey((k) => k + 1)} />

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleSubmit} className="flex flex-col gap-4">
              <div className="flex gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="primary_color">Primary colour</Label>
                  <Input
                    id="primary_color"
                    name="primary_color"
                    type="color"
                    className="h-10 w-16 p-1"
                    defaultValue={initialSettings.primary_color}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor="position">Position</Label>
                  <Select name="position" defaultValue={initialSettings.position}>
                    <SelectTrigger id="position">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bottom-right">Bottom right</SelectItem>
                      <SelectItem value="bottom-left">Bottom left</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="launcher_text">Launcher text</Label>
                <Input
                  id="launcher_text"
                  name="launcher_text"
                  required
                  defaultValue={initialSettings.launcher_text}
                  placeholder="Chat with us"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="teaser_text">Teaser bubble (optional)</Label>
                <Input
                  id="teaser_text"
                  name="teaser_text"
                  defaultValue={initialSettings.teaser_text}
                  placeholder="Questions? We're online!"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="assistant_name">Chatbot name (optional)</Label>
                <Input
                  id="assistant_name"
                  name="assistant_name"
                  maxLength={40}
                  defaultValue={initialSettings.assistant_name}
                  placeholder="e.g. Lindi"
                />
                <p className="text-xs text-muted-foreground">
                  Shown at the top of the chat, with your business name underneath. The AI uses it
                  to introduce itself, and still says it&apos;s an AI assistant if asked. Leave empty to
                  use your business name.
                </p>
              </div>
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  name="icon_on_launcher"
                  defaultChecked={initialSettings.icon_on_launcher}
                  className="mt-0.5 size-4 accent-[var(--primary)]"
                />
                <span>
                  Use the chatbot icon on the round chat button
                  <span className="block text-xs text-muted-foreground">
                    Otherwise the button shows a speech bubble in your colour.
                  </span>
                </span>
              </label>
              <div className="flex flex-col gap-2">
                <Label htmlFor="quick_replies">Quick replies (one per line, optional)</Label>
                <Textarea
                  id="quick_replies"
                  name="quick_replies"
                  rows={3}
                  defaultValue={initialSettings.quick_replies.join("\n")}
                  placeholder={"What are your hours?\nBook an appointment"}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="whatsapp_link">WhatsApp link (optional)</Label>
                <Input
                  id="whatsapp_link"
                  name="whatsapp_link"
                  type="url"
                  defaultValue={initialSettings.whatsapp_link}
                  placeholder="https://wa.me/27..."
                />
                <p className="text-xs text-muted-foreground">
                  Shown as a &quot;Chat on WhatsApp&quot; button in the widget, and offered to visitors
                  who ask to speak to a person, since you can reply to them on WhatsApp from
                  Conversations.
                </p>
              </div>
              {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}
              <div>
                <Button type="submit" disabled={pending} data-echo="widget.save">
                  {pending ? "Saving…" : "Save appearance"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Live preview</Label>
        <iframe
          key={previewKey}
          src="/dashboard/widget/preview"
          className="h-[640px] w-full rounded-lg border"
          title="Widget preview"
        />
      </div>
    </div>
  );
}
