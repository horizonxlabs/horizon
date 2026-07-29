import type { TextareaHTMLAttributes } from "react";
import { cn } from "../cn";

// Same border/radius/surface/focus tokens as Input's control, but sized for multi-line growth:
// min-height + real vertical padding + vertical resize (Input uses a fixed h-10 with py-0).
const control =
  "min-h-24 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-body outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft resize-y";

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, className)} {...rest} />;
}
