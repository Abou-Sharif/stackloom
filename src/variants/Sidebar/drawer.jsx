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
      {open && (
        <button
          className="fixed inset-0 z-40 bg-black/40 transition-opacity"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 z-50 flex flex-col overflow-y-auto bg-background p-6 shadow-[var(--shadow-panel)] transition-transform duration-300",
          side === "left" && "left-0",
          side === "right" && "right-0",
          open ? "translate-x-0" : side === "left" ? "-translate-x-full" : "translate-x-full"
        )}
        style={{ width: sidebar.width || "20rem" }}
      >
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold">{preset.brand.name}</p>
            <p className="text-sm text-muted-foreground">{preset.brand.tagline}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="space-y-2" aria-label="Workspace navigation">
          {preset.navigation.map((item) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-muted",
                  isActive && "bg-primary/10 text-primary"
                )
              }
              to={item.href}
              key={item.href}
              onClick={() => setOpen(false)}
            >
              <PresetIcon name={item.icon} className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        {showAccountActions && isAuthenticated && (
          <div className="mt-auto flex items-center justify-between gap-2 pt-8">
            <ThemeToggle />
            <Button variant="outline" onClick={logout}>
              <LogOut className="h-4 w-4" /> Logout
            </Button>
          </div>
        )}
      </aside>
    </>
  );
}
