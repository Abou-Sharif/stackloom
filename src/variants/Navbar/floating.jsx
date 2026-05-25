import { Link, NavLink } from "react-router-dom";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/common/ThemeProvider";
import { useAppPreset } from "@/hooks/useAppPreset";
import { useAuth } from "@/hooks/useAuth";
import { maxWidthClasses } from "@/lib/layout-classes";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { ROUTES } from "@/utils/constants";

export function Navbar({ showMenuButton = false }) {
  const { isAuthenticated, logout } = useAuth();
  const preset = useAppPreset();
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen);
  const topbar = preset.layout.topbar || {};

  return (
    <header className="sticky top-4 z-30 mx-auto w-full max-w-7xl px-4">
      <div className="flex h-14 items-center justify-between gap-3 rounded-2xl border bg-background/80 px-5 shadow-[var(--shadow-panel)] backdrop-blur-xl">
        <div className="flex items-center gap-2">
          {showMenuButton && (
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <Link to={ROUTES.HOME} className="font-semibold">{preset.brand.name}</Link>
        </div>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {preset.navigation.map((item) => (
            <NavLink
              className={({ isActive }) => cn("rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-muted", isActive && "bg-muted font-medium")}
              to={item.href}
              key={item.href}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isAuthenticated ? (
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" /> Logout
            </Button>
          ) : (
            <Button asChild size="sm"><Link to={ROUTES.LOGIN}>Login</Link></Button>
          )}
        </div>
      </div>
    </header>
  );
}
