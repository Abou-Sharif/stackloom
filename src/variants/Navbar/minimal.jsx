import { Link } from "react-router-dom";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/common/ThemeProvider";
import { useAppPreset } from "@/hooks/useAppPreset";
import { useAuth } from "@/hooks/useAuth";
import { topbarPositionClasses } from "@/lib/layout-classes";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { ROUTES } from "@/utils/constants";

export function Navbar({ showMenuButton = false }) {
  const { isAuthenticated, logout } = useAuth();
  const preset = useAppPreset();
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen);
  const topbar = preset.layout.topbar || {};

  return (
    <header
      className={cn(
        "z-30 border-b bg-background [border-bottom-width:var(--topbar-border-width)]",
        topbarPositionClasses[topbar.position || "sticky"]
      )}
    >
      <div className="mx-auto flex h-12 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          {showMenuButton && (
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu className="h-4 w-4" />
            </Button>
          )}
          <Link to={ROUTES.HOME} className="text-sm font-semibold">{preset.brand.name}</Link>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {isAuthenticated ? (
            <Button variant="ghost" size="sm" onClick={logout} aria-label="Logout">
              <LogOut className="h-4 w-4" />
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm"><Link to={ROUTES.LOGIN}>Login</Link></Button>
          )}
        </div>
      </div>
    </header>
  );
}
