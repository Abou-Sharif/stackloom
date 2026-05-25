import { cn } from "@/lib/utils";

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border bg-gradient-to-br from-card to-muted/40 text-card-foreground shadow-[var(--shadow-card)] [border-width:var(--border-width)]",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn("space-y-0.5 p-[var(--card-padding)] pb-1", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h2 className={cn("text-sm font-medium text-muted-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn("text-xs text-muted-foreground/70", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn("p-[var(--card-padding)] pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div className={cn("flex items-center gap-2 border-t border-muted/30 p-[var(--card-padding)] pt-3", className)} {...props} />;
}
