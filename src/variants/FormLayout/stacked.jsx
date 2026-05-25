import { cn } from "@/lib/utils";

export function FormField({ label, error, children, className }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <label className="text-sm font-medium">{label}</label>}
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function FormRow({ children, className }) {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}

export function FormActions({ children, className }) {
  return <div className={cn("flex items-center gap-2 pt-4", className)}>{children}</div>;
}
