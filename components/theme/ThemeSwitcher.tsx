"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";

type ThemeChoice = "light" | "dark" | "system";

const OPTIONS: { value: ThemeChoice; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀️" },
  { value: "dark", label: "Dark", icon: "🌙" },
  { value: "system", label: "System", icon: "🖥️" },
];

const ICON_CLASS = "w-[1.375rem] h-[1.375rem] md:w-5 md:h-5";

const MENU_EASE = [0.22, 1, 0.36, 1] as const;

function getTriggerIconKey(theme?: string, resolvedTheme?: string): string {
  if (theme === "system") {
    return "system";
  }
  return (resolvedTheme ?? theme ?? "dark") === "light" ? "light" : "dark";
}

function ThemeTriggerIcon({
  theme,
  resolvedTheme,
}: {
  theme?: string;
  resolvedTheme?: string;
}) {
  if (theme === "system") {
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
          strokeWidth={1.8}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    );
  }

  if ((resolvedTheme ?? theme) === "light") {
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
          strokeWidth={1.8}
          d="M12 3v2m0 14v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M3 12h2m14 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 8a4 4 0 100 8 4 4 0 000-8z"
        />
      </svg>
    );
  }

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
        strokeWidth={1.8}
        d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
      />
    </svg>
  );
}

export default function ThemeSwitcher() {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { theme, setTheme, resolvedTheme } = useTheme();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        close();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const selectTheme = (value: ThemeChoice) => {
    setTheme(value);
    close();
  };

  const activeTheme = (theme ?? "dark") as ThemeChoice;
  const triggerIconKey = getTriggerIconKey(theme, resolvedTheme);

  const menuTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.16, ease: MENU_EASE };

  const iconTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: MENU_EASE };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="w-10 h-10 flex items-center justify-center rounded-lg text-foreground hover:bg-muted/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Change theme"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((prev) => !prev)}
      >
        {mounted ? (
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={triggerIconKey}
              className="flex items-center justify-center"
              initial={
                reduceMotion
                  ? false
                  : { opacity: 0, rotate: -18, scale: 0.88 }
              }
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={
                reduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, rotate: 18, scale: 0.88 }
              }
              transition={iconTransition}
            >
              <ThemeTriggerIcon theme={theme} resolvedTheme={resolvedTheme} />
            </motion.span>
          </AnimatePresence>
        ) : (
          <span className={ICON_CLASS} aria-hidden="true" />
        )}
      </button>

      <AnimatePresence>
        {open && mounted ? (
          <motion.div
            id={menuId}
            role="menu"
            aria-label="Theme options"
            className="absolute right-0 top-full z-50 mt-2 min-w-[10.5rem] origin-top-right rounded-xl border border-border bg-card py-1 shadow-lg shadow-black/20"
            initial={
              reduceMotion ? false : { opacity: 0, scale: 0.96, y: -6 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.96, y: -4 }
            }
            transition={menuTransition}
          >
            {OPTIONS.map((option) => {
              const selected = activeTheme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className={`relative flex w-full items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                    selected
                      ? "bg-muted text-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                  onClick={() => selectTheme(option.value)}
                >
                  <motion.span
                    aria-hidden="true"
                    animate={
                      reduceMotion
                        ? undefined
                        : { scale: selected ? 1.05 : 1 }
                    }
                    transition={iconTransition}
                  >
                    {option.icon}
                  </motion.span>
                  <span>{option.label}</span>
                  <AnimatePresence initial={false}>
                    {selected ? (
                      <motion.span
                        className="ml-auto text-primary"
                        aria-hidden="true"
                        initial={
                          reduceMotion ? false : { opacity: 0, x: -6 }
                        }
                        animate={{ opacity: 1, x: 0 }}
                        exit={
                          reduceMotion ? { opacity: 0 } : { opacity: 0, x: 4 }
                        }
                        transition={menuTransition}
                      >
                        ✓
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
