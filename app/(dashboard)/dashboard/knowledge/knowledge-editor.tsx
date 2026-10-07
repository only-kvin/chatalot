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
  const [warning, setWarning] = useState<string | null>(null);

  const isEditing = editing !== null;
  const formValues = editing ?? { type: "faq" as const, title: "", content: "" };

  function resetForm() {
    setEditing(null);
    setError(null);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    setWarning(null);
    startTransition(async () => {
      if (isEditing) formData.set("id", editing.id);
      const result = isEditing
        ? await updateKnowledgeItemAction(formData)
        : await createKnowledgeItemAction(formData);

      if (result.error || !result.item) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      const saved = result.item;
      setItems((prev) =>
        isEditing ? prev.map((it) => (it.id === saved.id ? saved : it)) : [saved, ...prev],
      );
      resetForm();
      setWarning(result.warning);
    });
  }

  function handleDelete(id: string) {
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      const result = await deleteKnowledgeItemAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
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
            {warning && <p className="feedback-enter text-sm text-amber-600">{warning}</p>}
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
                <p className="text-sm text-muted-foreground">{item.content}</p>
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
          <p className="text-center text-muted-foreground">No knowledge items yet.</p>
        )}
      </div>
    </div>
  );
}
