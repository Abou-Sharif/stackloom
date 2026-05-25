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
  return <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</div>;
}

export function FormActions({ children, className }) {
  return <div className={cn("flex items-center gap-2 pt-6 sm:col-span-2 lg:col-span-3", className)}>{children}</div>;
}
