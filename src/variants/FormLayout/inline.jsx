import { cn } from "@/lib/utils";

export function FormField({ label, error, children, className }) {
  return (
    <div className={cn("flex items-baseline gap-3", className)}>
      {label && <label className="w-32 shrink-0 pt-2 text-right text-sm font-medium">{label}</label>}
      <div className="flex-1">
        {children}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

export function FormRow({ children, className }) {
  return <div className={cn("space-y-3", className)}>{children}</div>;
}

export function FormActions({ children, className }) {
  return <div className={cn("flex items-center gap-2 pl-32 pt-4", className)}>{children}</div>;
}
