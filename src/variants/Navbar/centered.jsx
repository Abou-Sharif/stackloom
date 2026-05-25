import { Link, NavLink } from "react-router-dom";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/common/ThemeProvider";
import { useAppPreset } from "@/hooks/useAppPreset";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { ROUTES } from "@/utils/constants";

export function Navbar({ showMenuButton = false }) {
  const { isAuthenticated, logout } = useAuth();
  const preset = useAppPreset();
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen);

  return (
    <header className="sticky top-0 z-30 bg-background">
      <div className="mx-auto flex max-w-7xl flex-col items-center px-4 sm:px-6">
        <div className="flex h-14 w-full items-center justify-between">
          <div className="flex items-center gap-2">
            {showMenuButton && (
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <div className="hidden md:block" />
          </div>
          <Link to={ROUTES.HOME} className="text-center">
            <p className="text-lg font-bold tracking-tight">{preset.brand.name}</p>
            <p className="-mt-1 text-xs text-muted-foreground">{preset.brand.tagline}</p>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isAuthenticated ? (
              <Button variant="outline" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            ) : (
              <Button asChild size="sm"><Link to={ROUTES.LOGIN}>Login</Link></Button>
            )}
          </div>
        </div>
        <nav className="hidden items-center gap-1 border-t pb-1 pt-2 md:flex" aria-label="Main navigation">
          {preset.navigation.map((item) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  "relative rounded-lg px-4 py-1.5 text-sm transition-colors hover:bg-muted",
                  isActive && "after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-3/4 after:-translate-x-1/2 after:rounded-full after:bg-primary"
                )
              }
              to={item.href}
              key={item.href}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
