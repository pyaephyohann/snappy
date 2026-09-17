"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  TELEGRAM_MINI_APP_ROUTES,
  type TelegramMiniAppScreen,
} from "@/lib/telegram/mini-app-routes";

type NavItem = {
  id: TelegramMiniAppScreen;
  href: string;
  label: string;
  icon: string;
};

const NAV_ITEMS: NavItem[] = [
  { id: "home", href: TELEGRAM_MINI_APP_ROUTES.home, label: "Home", icon: "🏠" },
  { id: "find", href: TELEGRAM_MINI_APP_ROUTES.find, label: "Find", icon: "🔍" },
  {
    id: "upload",
    href: TELEGRAM_MINI_APP_ROUTES.upload,
    label: "Upload",
    icon: "📤",
  },
  {
    id: "profile",
    href: TELEGRAM_MINI_APP_ROUTES.profile,
    label: "Me",
    icon: "👤",
  },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === TELEGRAM_MINI_APP_ROUTES.home) {
    return pathname === href || pathname === `${href}/`;
  }
  return pathname.startsWith(href);
}

export default function TelegramBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md"
      style={{
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
      aria-label="Mini App navigation"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-2">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.id} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-xs transition-colors ${
                  active
                    ? "font-medium text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
