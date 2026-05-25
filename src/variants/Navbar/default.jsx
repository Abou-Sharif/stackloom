import { Link, NavLink } from "react-router-dom";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/common/ThemeProvider";
import { useAppPreset } from "@/hooks/useAppPreset";
import { useAuth } from "@/hooks/useAuth";
import { maxWidthClasses, topbarPositionClasses } from "@/lib/layout-classes";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { ROUTES } from "@/utils/constants";

export function Navbar({ showMenuButton = false }) {
  const { isAuthenticated, logout } = useAuth();
  const preset = useAppPreset();
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen);
  const topbar = preset.layout.topbar || {};
  const align = topbar.alignment || "end";

  return (
    <header
      className={cn(
        "z-30 border-b bg-background/95 backdrop-blur [border-bottom-width:var(--topbar-border-width)]",
        topbarPositionClasses[topbar.position || "sticky"]
      )}
    >
      <div
        className={cn(
          "mx-auto grid h-16 grid-cols-[1fr_auto] items-center gap-3 px-4 sm:px-6 lg:px-8",
          align === "center" && "grid-cols-[1fr_auto_1fr]",
          maxWidthClasses[topbar.maxWidth || "6xl"]
        )}
      >
        <div className="flex items-center gap-2">
          {showMenuButton && (
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <Link to={ROUTES.HOME} className="font-semibold">{preset.brand.name}</Link>
        </div>
        {align === "center" && (
          <nav className="hidden items-center justify-center gap-2 md:flex" aria-label="Main navigation">
            {preset.navigation.map((item) => (
              <NavLink
                className={({ isActive }) => cn("rounded-[var(--radius-nav)] px-3 py-2 text-sm hover:bg-muted", isActive && "bg-muted")}
                to={item.href}
                key={item.href}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
        <nav className={cn("flex items-center gap-2", align === "center" && "justify-end")} aria-label="Account navigation">
          <ThemeToggle />
          {isAuthenticated ? (
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" /> Logout
            </Button>
          ) : (
            <Button asChild size="sm"><Link to={ROUTES.LOGIN}>Login</Link></Button>
          )}
        </nav>
      </div>
    </header>
  );
}
