"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Search, Settings, ShoppingCart, Zap } from "lucide-react";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: "/recherche", label: "Trouver des produits", icon: Search },
  { href: "/produits", label: "Produits & annonces", icon: Package },
  { href: "/commandes", label: "Commandes", icon: ShoppingCart },
  { href: "/reglages", label: "Réglages", icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950 px-4 py-6 max-md:hidden">
      <div className="mb-10 flex items-center gap-2.5 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-900/40">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-white">E-dropship</div>
          <div className="text-xs text-zinc-500">eBay × CJ, 8 pays</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active ? "bg-accent-soft font-medium text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
              )}
            >
              <Icon className={cx("h-4 w-4", active && "text-violet-400")} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

/** Barre de navigation compacte sur mobile. */
export function MobileNav() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-950/90 px-3 py-2 backdrop-blur md:hidden">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cx("flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs", active ? "bg-accent-soft text-white" : "text-zinc-400")}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
