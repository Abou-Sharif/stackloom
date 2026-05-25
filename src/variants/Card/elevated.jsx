import { cn } from "@/lib/utils";

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border bg-card text-card-foreground shadow-[var(--shadow-card)] [border-width:var(--border-width)]",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn("space-y-1.5 p-[var(--card-padding)]", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h2 className={cn("text-xl font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn("p-[var(--card-padding)] pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div className={cn("flex items-center gap-2 p-[var(--card-padding)] pt-0", className)} {...props} />;
}
