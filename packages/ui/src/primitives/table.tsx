import type { HTMLAttributes, TdHTMLAttributes } from "react";
import { cn } from "../cn";

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-collapse text-sm text-body", className)} {...rest} />;
}

export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted",
        className
      )}
      {...rest}
    />
  );
}

export function TRow({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-border-soft last:border-0", className)} {...rest} />;
}

export function TCell({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2 align-middle", className)} {...rest} />;
}
