import { cn } from "@/lib/utils";

export function FormField({ label, error, children, className }) {
  return (
    <div className={cn("relative", className)}>
      <div className="group">
        {children}
        {label && (
          <label className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground transition-all duration-150 group-focus-within:top-2 group-focus-within:-translate-y-full group-focus-within:text-xs group-focus-within:text-primary [&:has(~input:not(:placeholder-shown))]:top-2 [&:has(~input:not(:placeholder-shown))]:-translate-y-full [&:has(~input:not(:placeholder-shown))]:text-xs">
            {label}
          </label>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function FormRow({ children, className }) {
  return <div className={cn("space-y-5", className)}>{children}</div>;
}

export function FormActions({ children, className }) {
  return <div className={cn("flex items-center gap-2 pt-6", className)}>{children}</div>;
}
