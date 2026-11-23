"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import { createOwnWidgetAction, deleteOwnWidgetAction, updateOwnWidgetAction } from "./actions";
import type { WidgetType } from "@/lib/widgets/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// A business's widgets of one type: the main one, plus variants and test
// (Draft) widgets. Pick one to edit; make new ones, rename, go live, delete.

export type ListedWidget = { id: string | null; name: string; status: "draft" | "live"; isDefault: boolean };

export function WidgetList({ type, widgets, selectedId }: { type: WidgetType; widgets: ListedWidget[]; selectedId: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const selected = widgets.find((w) => w.id === selectedId) ?? widgets[0];
  const [name, setName] = useState(selected?.name ?? "");
  const href = (id: string | null) => `/dashboard/widget?tab=${type}${id ? `&w=${id}` : ""}`;

  function run(action: () => Promise<{ error: string | null; id?: string }>, after?: (id?: string) => void) {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (r.error) return setError(r.error);
      after?.(r.id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {widgets.map((w) => (
          <Link
            key={w.id ?? "main"}
            href={href(w.isDefault ? null : w.id)}
            aria-current={w === selected ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
              w === selected ? "border-foreground bg-foreground text-background" : "hover:border-foreground",
            )}
          >
            {w.name}
            {w.isDefault && <span className="text-xs opacity-70">(main)</span>}
            {w.status === "draft" && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Draft</Badge>}
          </Link>
        ))}
        <form
          className="flex items-center gap-2"
          action={() =>
            run(() => createOwnWidgetAction(type, newName), (id) => {
              setNewName("");
              if (id) router.push(href(id));
            })
          }
        >
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New widget name" maxLength={60} className="h-8 w-44" aria-label="New widget name" />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            + New
          </Button>
        </form>
      </div>

      {selected?.isDefault ? (
        <p className="text-xs text-muted-foreground">
          Your main widget: shown by embed codes without a widget id, your booking page and booking links. New widgets start as Drafts, so you can try
          them in the preview before putting them on your website.
        </p>
      ) : (
        selected?.id && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-8 w-52" aria-label="Widget name" />
            <Button size="sm" variant="outline" disabled={pending || name.trim() === selected.name} onClick={() => run(() => updateOwnWidgetAction(type, selected.id!, { name }))}>
              Rename
            </Button>
            <Button
              size="sm"
              variant={selected.status === "draft" ? "default" : "outline"}
              disabled={pending}
              onClick={() => run(() => updateOwnWidgetAction(type, selected.id!, { status: selected.status === "draft" ? "live" : "draft" }))}
            >
              {selected.status === "draft" ? "Make live" : "Back to draft"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (confirm(`Delete "${selected.name}"? Websites showing it will show your main widget instead.`)) {
                  run(() => deleteOwnWidgetAction(type, selected.id!), () => router.push(href(null)));
                }
              }}
            >
              Delete
            </Button>
            <span className="text-xs text-muted-foreground">
              {selected.status === "draft" ? "Draft: works in the preview only, takes no bookings." : "Live: works on your website."}
            </span>
          </div>
        )
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
