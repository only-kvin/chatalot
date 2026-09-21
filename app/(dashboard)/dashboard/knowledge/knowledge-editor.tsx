"use client";

import { useState, useTransition } from "react";
import {
  createKnowledgeItemAction,
  updateKnowledgeItemAction,
  deleteKnowledgeItemAction,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type KnowledgeItem = {
  id: string;
  type: "faq" | "service" | "policy" | "info";
  title: string;
  content: string;
};

const TYPES: KnowledgeItem["type"][] = ["faq", "service", "policy", "info"];

export function KnowledgeEditor({ initialItems }: { initialItems: KnowledgeItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEditing = editing !== null;
  const formValues = editing ?? { type: "faq" as const, title: "", content: "" };

  function resetForm() {
    setEditing(null);
    setError(null);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (isEditing) {
          formData.set("id", editing!.id);
          await updateKnowledgeItemAction(formData);
          setItems((prev) =>
            prev.map((it) =>
              it.id === editing!.id
                ? {
                    ...it,
                    type: formData.get("type") as KnowledgeItem["type"],
                    title: formData.get("title") as string,
                    content: formData.get("content") as string,
                  }
                : it,
            ),
          );
        } else {
          await createKnowledgeItemAction(formData);
          // Re-fetch isn't wired here for simplicity — revalidatePath refreshes
          // server data on next navigation; reload to see the new item immediately.
          window.location.reload();
        }
        resetForm();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      await deleteKnowledgeItemAction(formData);
      setItems((prev) => prev.filter((it) => it.id !== id));
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "Edit item" : "Add knowledge item"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="type">Type</Label>
              <Select name="type" defaultValue={formValues.type} key={editing?.id ?? "new"}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                required
                defaultValue={formValues.title}
                key={`title-${editing?.id ?? "new"}`}
                placeholder="Opening hours"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                name="content"
                required
                rows={4}
                defaultValue={formValues.content}
                key={`content-${editing?.id ?? "new"}`}
                placeholder="We're open Tuesday to Saturday, 9am to 6pm."
              />
            </div>
            {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : isEditing ? "Update item" : "Add item"}
              </Button>
              {isEditing && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <Card key={item.id}>
            <CardContent className="flex items-start justify-between gap-4 pt-6">
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="secondary">{item.type}</Badge>
                  <span className="font-medium">{item.title}</span>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.content}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(item)}>
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleDelete(item.id)}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && (
          <p className="text-center text-zinc-500">No knowledge items yet.</p>
        )}
      </div>
    </div>
  );
}
