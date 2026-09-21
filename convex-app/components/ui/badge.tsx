import * as React from "react";

import { cn } from "@/lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "ready" | "waiting" | "blocked" | "amber";
};

const tones = {
  neutral: "border-zinc-700 bg-zinc-800 text-zinc-200",
  ready: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  waiting: "border-sky-500/40 bg-sky-500/15 text-sky-300",
  blocked: "border-red-500/40 bg-red-500/15 text-red-300",
  amber: "border-amber-400/40 bg-amber-400/15 text-amber-200",
};

function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
