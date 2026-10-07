import { StarIcon } from "lucide-react";
import type { Feature } from "@/lib/plans";

// A small illustrative mock of each feature for its upgrade page — what it
// looks like, not real data.
export function FeaturePreview({ feature }: { feature: Feature }) {
  return (
    <div aria-hidden className="pointer-events-none rounded-2xl bg-muted/60 p-5 select-none">
      {PREVIEWS[feature]}
    </div>
  );
}

const bubble = "max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px]";
const field = "h-9 rounded-lg bg-card shadow-[0_0_0_1px_var(--border)]";

const Chat = ({ them, us }: { them: string[]; us: string[] }) => (
  <div className="flex flex-col gap-2">
    {them.map((t, i) => (
      <div key={t} className="contents">
        <div className={`${bubble} self-end bg-primary text-white`}>{t}</div>
        {us[i] && <div className={`${bubble} self-start bg-card shadow-[0_0_0_1px_var(--border)]`}>{us[i]}</div>}
      </div>
    ))}
  </div>
);

const Form = ({ labels, button }: { labels: string[]; button: string }) => (
  <div className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-card">
    {labels.map((l) => (
      <div key={l} className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{l}</span>
        <div className={field} />
      </div>
    ))}
    <div className="mt-1 h-9 w-28 rounded-lg bg-primary/90 text-center text-xs leading-9 font-semibold text-white">{button}</div>
  </div>
);

const PREVIEWS: Record<Feature, React.ReactNode> = {
  web_chat: (
    <Chat
      them={["Do you have anything open on Saturday?", "Great, 10:30 please"]}
      us={["Yes! Saturday has 09:00 and 10:30 free. Want me to book one?", "Done — see you Saturday at 10:30."]}
    />
  ),
  whatsapp: (
    <div className="rounded-xl bg-[#e7ded3] p-4 dark:bg-[#1f2c33]">
      <Chat
        them={["Hi, how much is a full colour?"]}
        us={["Hi! A full colour starts at [price] and takes about 2 hours. Would you like to book?"]}
      />
    </div>
  ),
  bookings: (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-card">
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
          <span key={d} className={`rounded-lg py-1.5 ${i === 2 ? "bg-primary font-semibold text-white" : "bg-muted"}`}>
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {["09:00", "09:30", "10:30", "11:00", "13:00", "14:30", "15:00", "16:30"].map((t, i) => (
          <span key={t} className={`rounded-lg py-1.5 text-center text-xs font-medium shadow-[0_0_0_1px_var(--border)] ${i === 2 ? "bg-accent text-accent-foreground" : ""}`}>
            {t}
          </span>
        ))}
      </div>
    </div>
  ),
  reviews: (
    <div className="flex flex-col gap-3">
      <div className={`${bubble} self-start bg-card shadow-[0_0_0_1px_var(--border)]`}>
        Thanks for visiting yesterday! How would you rate us from 1 to 5?
      </div>
      <div className={`${bubble} self-end bg-primary text-white`}>5</div>
      <div className="flex gap-1 self-start">
        {[0, 1, 2, 3, 4].map((i) => (
          <StarIcon key={i} className="size-5 fill-amber-400 text-amber-400" />
        ))}
      </div>
    </div>
  ),
  contact_form: <Form labels={["Full name", "Email", "Message"]} button="Send" />,
  registration: <Form labels={["Full name", "Email", "Phone"]} button="Sign up" />,
};
