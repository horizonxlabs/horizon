import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "../cn";

// px-3 sets horizontal padding only; py-0 is required so the fixed h-10 height
// defines the box — otherwise the legacy `input, select { padding }` base rule
// leaks vertical padding and clips the text/option.
const control =
  "h-10 w-full rounded-control border border-border bg-surface px-3 py-0 text-sm text-body outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, className)} {...rest} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  children
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-body">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
