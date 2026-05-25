import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-[var(--control-height)] items-center justify-center gap-2 rounded-[var(--radius-button)] border-2 bg-transparent px-[var(--button-px)] text-sm font-medium transition-all hover:bg-muted disabled:pointer-events-none disabled:opacity-50 [border-width:var(--border-width)]",
  {
    variants: {
      variant: {
        default: "border-primary text-primary hover:bg-primary/10",
        outline: "border-border text-foreground hover:border-muted-foreground",
        ghost: "border-transparent text-muted-foreground hover:text-foreground",
        destructive: "border-destructive text-destructive hover:bg-destructive/10",
      },
      size: {
        default: "",
        icon: "w-[var(--control-height)] px-0",
        sm: "h-9 px-3",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
