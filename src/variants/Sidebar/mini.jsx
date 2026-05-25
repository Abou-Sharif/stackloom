import { useState } from "react";
import { NavLink } from "react-router-dom";
import { LogOut, X, ChevronRight } from "lucide-react";
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
  const [expanded, setExpanded] = useState(false);

  const isMini = !expanded;

  return (
    <>
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={cn(
          "fixed inset-y-0 z-40 flex flex-col overflow-y-auto bg-background transition-all duration-200 md:static",
          side === "left" && "left-0 border-r [border-right-width:var(--sidebar-border-width)]",
          side === "right" && "right-0 border-l [border-left-width:var(--sidebar-border-width)]",
          open && "translate-x-0",
          !open && side === "left" && "-translate-x-full",
          !open && side === "right" && "translate-x-full",
          isMini && "overflow-hidden"
        )}
        style={{ width: isMini ? "4rem" : sidebar.width || "16rem" }}
      >
        <div className={cn("flex items-center justify-between gap-3 p-3", isMini && "flex-col")}>
          {!isMini && (
            <div className="truncate">
              <p className="font-semibold">{preset.brand.name}</p>
              <p className="text-xs text-muted-foreground truncate">{preset.brand.tagline}</p>
            </div>
          )}
          {isMini && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              {preset.brand.name.charAt(0)}
            </div>
          )}
          <div className={cn("flex gap-1", isMini && "flex-col")}>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-4 w-4" />
            </Button>
            {isMini && (
              <Button variant="ghost" size="icon" className="hidden md:flex" onClick={() => setExpanded(true)} aria-label="Expand sidebar">
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <nav className={cn("space-y-1 px-2", isMini && "px-1")} aria-label="Workspace navigation">
          {preset.navigation.map((item) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-[var(--radius-nav)] px-3 py-2 text-sm hover:bg-muted",
                  isActive && "bg-muted",
                  isMini && "justify-center px-2"
                )
              }
              to={item.href}
              key={item.href}
              onClick={() => setOpen(false)}
            >
              <PresetIcon name={item.icon} className="h-5 w-5 shrink-0" />
              {!isMini && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        {showAccountActions && isAuthenticated && (
          <div className={cn("mt-auto flex items-center gap-2 p-3", isMini && "flex-col p-2")}>
            <ThemeToggle />
            {!isMini && (
              <Button variant="outline" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4" /> Logout
              </Button>
            )}
          </div>
        )}
      </aside>
      {open && <button className="fixed inset-0 z-30 bg-black/40 md:hidden" aria-label="Close menu" onClick={() => setOpen(false)} />}
    </>
  );
}
