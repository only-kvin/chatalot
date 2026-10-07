"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    ChatAlot?: { scan: () => void };
  }
}

// "Change time" on the manage page: mounts the widget bundle's reschedule
// picker (the same date-and-time picker as the booking widgets).
export function ChangeTime(props: {
  token: string;
  publicKey: string;
  serviceId: string;
  startsAt: string;
  serviceName: string;
  businessName: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);

  // Once moved, refresh the booking details above the picker.
  useEffect(() => {
    const el = box.current;
    if (!open || !el) return;
    const onEvent = (e: Event) => {
      if ((e as CustomEvent<{ action: string }>).detail?.action === "submitted") router.refresh();
    };
    el.addEventListener("chatalot:event", onEvent);
    return () => el.removeEventListener("chatalot:event", onEvent);
  }, [open, router]);

  useEffect(() => {
    if (!open) return;
    if (window.ChatAlot) {
      window.ChatAlot.scan();
      return;
    }
    const script = document.createElement("script");
    script.src = "/widget.js";
    script.async = true;
    script.dataset.key = props.publicKey;
    script.dataset.chat = "off";
    document.body.appendChild(script);
  }, [open, props.publicKey]);

  if (!open) {
    return (
      <div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Change time
        </Button>
      </div>
    );
  }
  return (
    <div
      ref={box}
      data-chatalot="reschedule"
      data-token={props.token}
      data-service={props.serviceId}
      data-starts-at={props.startsAt}
      data-service-name={props.serviceName}
      data-business={props.businessName}
    />
  );
}
