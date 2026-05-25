import { useAppPreset } from "@/hooks/useAppPreset";
import { cn } from "@/lib/utils";

export function Footer() {
  const { brand, layout } = useAppPreset();

  return (
    <footer className={cn("border-t border-muted/30 py-3 text-center text-xs text-muted-foreground")}>
      &copy; {new Date().getFullYear()} {brand.name}
    </footer>
  );
}
