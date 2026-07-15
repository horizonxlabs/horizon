import type { HTMLAttributes, ReactNode } from "react";
import type { Status } from "@evcp/types";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

export type Tone = "success" | "warning" | "danger" | "neutral" | "info";

const badge = cva("inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-semibold", {
  variants: {
    tone: {
      success: "bg-success-bg text-success",
      warning: "bg-warning-bg text-warning",
      danger: "bg-danger-bg text-danger",
      info: "bg-info-bg text-info",
      neutral: "bg-surface-muted text-muted"
    }
  },
  defaultVariants: { tone: "neutral" }
});

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>;

export function Badge({ tone, className, ...rest }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...rest} />;
}

export function ToneBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <Badge tone={tone}>{children}</Badge>;
}

function statusTone(status: Status): Tone {
  if (status === "healthy" || status === "published") return "success";
  if (status === "warning" || status === "pending" || status === "draft" || status === "degraded")
    return "warning";
  if (status === "down") return "danger";
  return "neutral";
}

export function StatusPill({ status }: { status: Status }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>;
}
