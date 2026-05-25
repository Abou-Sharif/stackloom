import { NavLink } from "react-router-dom";
import { LogOut, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/common/ThemeProvider";
import { useAppPreset } from "@/hooks/useAppPreset";
import { useAuth } from "@/hooks/useAuth";
import { PresetIcon } from "@/lib/icon-map";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";

export function Sidebar({ showAccountActions = false }) {
  const open = useAppStore((state) => state.sidebarOpen);
  const setOpen = useAppStore((state) => state.setSidebarOpen);
  const { logout, isAuthenticated } = useAuth();
  const preset = useAppPreset();
  const sidebar = preset.layout.sidebar || {};
  const side = sidebar.side || "left";

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 z-40 flex flex-col overflow-y-auto bg-background p-4 transition-transform md:static md:translate-x-0",
          side === "left" && "left-0 border-r [border-right-width:var(--sidebar-border-width)]",
          side === "right" && "right-0 border-l [border-left-width:var(--sidebar-border-width)]",
          open && "translate-x-0",
          !open && side === "left" && "-translate-x-full",
          !open && side === "right" && "translate-x-full"
        )}
        style={{ width: sidebar.width || "16rem" }}
      >
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{preset.brand.name}</p>
            <p className="text-sm text-muted-foreground">{preset.brand.tagline}</p>
          </div>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav className="space-y-1" aria-label="Workspace navigation">
          {preset.navigation.map((item) => (
            <NavLink
              className={({ isActive }) => cn("flex items-center gap-2 rounded-[var(--radius-nav)] px-3 py-2 text-sm hover:bg-muted", isActive && "bg-muted")}
              to={item.href}
              key={item.href}
              onClick={() => setOpen(false)}
            >
              <PresetIcon name={item.icon} className="h-4 w-4" /> {item.label}
            </NavLink>
          ))}
        </nav>
        {showAccountActions && isAuthenticated && (
          <div className="mt-auto flex items-center justify-between gap-2 pt-6">
            <ThemeToggle />
            <Button variant="outline" onClick={logout}>
              <LogOut className="h-4 w-4" /> Logout
            </Button>
          </div>
        )}
      </aside>
      {open && <button className="fixed inset-0 z-30 bg-black/40 md:hidden" aria-label="Close menu" onClick={() => setOpen(false)} />}
    </>
  );
}
