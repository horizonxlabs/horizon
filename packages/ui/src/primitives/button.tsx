import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-control font-medium transition-[background-color,box-shadow,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-soft active:translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary shadow-button hover:bg-primary-strong",
        secondary: "bg-surface text-body border border-border shadow-button hover:bg-surface-muted",
        ghost: "bg-transparent text-primary hover:bg-primary-soft",
        danger: "bg-danger-strong text-on-primary shadow-button hover:opacity-90",
        dangerOutline:
          "border border-danger bg-surface text-danger hover:bg-danger-bg focus-visible:ring-danger-bg max-md:min-h-[44px]"
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm"
      }
    },
    defaultVariants: { variant: "primary", size: "md" }
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, className, ...rest },
  ref
) {
  return <button ref={ref} className={cn(button({ variant, size }), className)} {...rest} />;
});
