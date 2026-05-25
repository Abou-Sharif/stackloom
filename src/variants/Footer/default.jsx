import { useAppPreset } from "@/hooks/useAppPreset";
import { footerPositionClasses } from "@/lib/layout-classes";
import { cn } from "@/lib/utils";

export function Footer() {
  const { brand, layout } = useAppPreset();
  const alignment = layout.footer?.alignment || "center";

  return (
    <footer
      className={cn(
        "border-t bg-background py-6 text-sm text-muted-foreground [border-top-width:var(--footer-border-width)]",
        footerPositionClasses[layout.footer?.position || "normal"],
        alignment === "center" && "text-center",
        alignment === "start" && "px-4 text-left sm:px-6 lg:px-8",
        alignment === "end" && "px-4 text-right sm:px-6 lg:px-8"
      )}
    >
      {brand.name}
    </footer>
  );
}
