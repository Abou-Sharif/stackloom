import { Link } from "react-router-dom";
import { Github, Twitter, Mail } from "lucide-react";
import { useAppPreset } from "@/hooks/useAppPreset";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/utils/constants";

const linkGroups = [
  {
    title: "Product",
    links: [
      { label: "Dashboard", href: ROUTES.DASHBOARD },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
];

export function Footer() {
  const { brand, layout } = useAppPreset();

  return (
    <footer
      className={cn(
        "border-t bg-background [border-top-width:var(--footer-border-width)]",
        layout.footer?.position === "bottom" && "mt-auto"
      )}
    >
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <p className="text-base font-semibold">{brand.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{brand.tagline}</p>
            <div className="mt-4 flex gap-3">
              <a href="#" className="text-muted-foreground hover:text-foreground" aria-label="GitHub">
                <Github className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground" aria-label="Twitter">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground" aria-label="Email">
                <Mail className="h-5 w-5" />
              </a>
            </div>
          </div>
          {linkGroups.map((group) => (
            <div key={group.title}>
              <p className="mb-3 text-sm font-medium">{group.title}</p>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 border-t pt-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} {brand.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
