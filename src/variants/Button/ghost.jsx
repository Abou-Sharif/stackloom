import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "text-foreground hover:bg-muted",
        outline: "text-muted-foreground hover:text-foreground",
        ghost: "text-muted-foreground hover:text-foreground",
        destructive: "text-destructive hover:bg-destructive/10",
      },
      size: {
        default: "",
        icon: "w-9 px-0",
        sm: "h-8 px-2 text-xs",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
