"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import BottomNavCameraFlow from "@/components/mobile/BottomNavCameraFlow";

interface BottomNavProps {
  username: string;
}

type NavItem = {
  key: string;
  label: string;
  href: string;
  match: (path: string) => boolean;
  icon: (active: boolean) => ReactNode;
  showSoonBadge?: boolean;
};

const ICON_CLASS = "h-6 w-6 shrink-0";

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={ICON_CLASS}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={active ? 2.25 : 1.75}
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      className="h-[1.65rem] w-[1.65rem] text-primary-foreground"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.85}
        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.85}
        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
      />
    </svg>
  );
}

function NavLinkItem({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={`group flex min-h-[44px] min-w-[52px] flex-1 translate-y-3 flex-col items-center justify-end gap-0.5 pb-0 pt-1 text-[10px] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg ${
        active
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground"
      }`}
      aria-current={active ? "page" : undefined}
      aria-label={
        item.showSoonBadge ? `${item.label}, coming soon` : undefined
      }
    >
      <span className="relative inline-flex">
        {item.icon(active)}
        {item.showSoonBadge ? (
          <span
            className="absolute -right-3 -top-1 rounded-full border border-border bg-card px-1 py-px text-[8px] font-semibold uppercase leading-tight tracking-wide text-primary shadow-sm"
            aria-hidden="true"
          >
            Soon
          </span>
        ) : null}
      </span>
      <span className="leading-none">{item.label}</span>
    </Link>
  );
}

export default function BottomNav({ username }: BottomNavProps) {
  void username;
  const pathname = usePathname();
  const [cameraFlowOpen, setCameraFlowOpen] = useState(false);

  const navItems: NavItem[] = useMemo(
    () => [
      {
        key: "search",
        label: "Search",
        href: "/search",
        match: (path) => path === "/search" || path.startsWith("/search/"),
        icon: (active) => <SearchIcon active={active} />,
      },
    ],
    [],
  );

  const leftItems = navItems.slice(0, 2);
  const rightItems = navItems.slice(2);

  return (
    <>
      {!cameraFlowOpen ? (
        <nav
          className="bottom-nav-root fixed inset-x-0 bottom-0 z-40 lg:hidden"
          aria-label="Main navigation"
        >
          <div className="relative mx-auto max-w-lg overflow-hidden">
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[calc(var(--bottom-nav-height)+var(--safe-area-inset-bottom))]"
              aria-hidden="true"
            >
              <svg
                className="h-full w-full drop-shadow-[0_-4px_24px_rgba(0,0,0,0.16)]"
                viewBox="0 0 400 92"
                preserveAspectRatio="none"
                role="presentation"
              >
                <defs>
                  <linearGradient
                    id="snappyBottomNavFill"
                    x1="0%"
                    y1="0%"
                    x2="0%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="var(--card)" />
                    <stop offset="100%" stopColor="var(--card)" stopOpacity="0.98" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 34 H108 C124 34 136 30 152 22 C166 15 182 12 200 12 C218 12 234 15 248 22 C264 30 276 34 292 34 H400 V92 H0 Z"
                  fill="url(#snappyBottomNavFill)"
                />
                <path
                  d="M0 34 H108 C124 34 136 30 152 22 C166 15 182 12 200 12 C218 12 234 15 248 22 C264 30 276 34 292 34"
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>

            <div className="safe-area-pb relative flex items-end justify-between px-1 pb-1.5 pt-6">
              <div className="flex flex-1 justify-around pt-2">
                {leftItems.map((item) => (
                  <NavLinkItem
                    key={item.key}
                    item={item}
                    active={item.match(pathname)}
                  />
                ))}
              </div>

              <div className="relative flex w-[4.85rem] shrink-0 flex-col items-center justify-end pb-0.5">
                <motion.button
                  type="button"
                  className="relative z-10 flex h-[3.35rem] w-[3.35rem] cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30 ring-[3px] ring-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                  style={{ marginTop: "-0.35rem" }}
                  aria-label="Create a snap with camera"
                  whileTap={{ scale: 0.93 }}
                  transition={{ type: "spring", stiffness: 520, damping: 28 }}
                  onClick={() => setCameraFlowOpen(true)}
                >
                  <CameraIcon />
                </motion.button>
              </div>

              <div className="flex flex-1 justify-around pt-2">
                {rightItems.map((item) => (
                <NavLinkItem
                  key={item.key}
                  item={item}
                  active={item.match(pathname)}
                />
              ))}
              </div>
            </div>
          </div>
        </nav>
      ) : null}

      {cameraFlowOpen ? (
        <BottomNavCameraFlow onClose={() => setCameraFlowOpen(false)} />
      ) : null}
    </>
  );
}
