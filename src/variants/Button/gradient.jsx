import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-[var(--control-height)] items-center justify-center gap-2 rounded-[var(--radius-button)] px-5 text-sm font-medium text-white shadow-md transition-all hover:opacity-90 disabled:pointer-events-none disabled:opacity-50 relative overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-primary to-primary/70",
        outline: "bg-gradient-to-r from-muted-foreground/20 to-muted-foreground/10 text-foreground border",
        ghost: "bg-transparent text-foreground hover:bg-muted shadow-none",
        destructive: "bg-gradient-to-r from-destructive to-destructive/70",
      },
      size: {
        default: "",
        icon: "w-[var(--control-height)] px-0",
        sm: "h-9 px-4 text-xs",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
