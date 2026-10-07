"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  FEATURE_INFO,
  FEATURES,
  PLAN_LABEL,
  PLANS,
  planIncludes,
  resolveFeatures,
  type Feature,
  type Overrides,
  type Plan,
} from "@/lib/plans";
import { updatePlanAction } from "./actions";

type Choice = "plan" | "on" | "off";

const CHOICES = [
  { value: "plan", label: "Plan" },
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;

const STATE_TEXT = {
  on: "Owner can use it",
  locked: "Owner sees it locked, with an upgrade page",
  hidden: "Hidden from the owner",
} as const;

// "Plan" follows the plan; "On" grants it whatever the plan; "Off" hides it
// from the owner entirely (for features that don't fit the business).
export function PlanEditor({ tenantId, plan: initialPlan, overrides }: { tenantId: string; plan: Plan; overrides: Overrides }) {
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [choices, setChoices] = useState<Record<Feature, Choice>>(
    () => Object.fromEntries(FEATURES.map((f) => [f, overrides[f] ?? "plan"])) as Record<Feature, Choice>,
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const nextOverrides: Overrides = Object.fromEntries(
    FEATURES.filter((f) => choices[f] !== "plan").map((f) => [f, choices[f]]),
  );
  const resolved = resolveFeatures(plan, nextOverrides);

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updatePlanAction({ tenantId, plan, overrides: nextOverrides });
      setMessage(result.error ? { ok: false, text: result.error } : { ok: true, text: "Saved." });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="plan">Plan</Label>
        <select
          id="plan"
          value={plan}
          onChange={(e) => setPlan(e.target.value as Plan)}
          className="h-9 w-48 rounded-lg border bg-background px-2.5 text-sm"
        >
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {PLAN_LABEL[p]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col divide-y rounded-xl border">
        {FEATURES.map((f) => (
          <div key={f} className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex min-w-48 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">
                {FEATURE_INFO[f].title}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {planIncludes(plan, f) ? "in plan" : "not in plan"}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">{STATE_TEXT[resolved[f]]}</span>
            </div>
            <SegmentedControl
              aria-label={`${FEATURE_INFO[f].title} override`}
              options={CHOICES}
              value={choices[f]}
              onChange={(v) => setChoices({ ...choices, [f]: v })}
              className="w-56"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save plan"}
        </Button>
        {message && (
          <span role="status" className={`feedback-enter text-sm ${message.ok ? "text-tone-ok-foreground" : "text-destructive"}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
