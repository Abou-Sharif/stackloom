import { cn } from "@/lib/utils";

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] bg-muted/50 text-card-foreground shadow-none",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn("space-y-1 p-[var(--card-padding)] pb-1", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h2 className={cn("text-base font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn("p-[var(--card-padding)] pt-1", className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div className={cn("flex items-center gap-2 p-[var(--card-padding)] pt-0", className)} {...props} />;
}
