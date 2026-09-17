"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { FriendPickerUser } from "@/components/friends/FriendsPickerPanel";
import {
  detectMacPlatform,
  filterFriendsByQuery,
} from "@/lib/friends-search";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
  );
}

export default function NavbarDesktopFriendSearch() {
  const router = useRouter();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<FriendPickerUser[] | null>(null);
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "error" | "ready"
  >("idle");
  const [activeIndex, setActiveIndex] = useState(-1);

  const shortcutLabel = useSyncExternalStore(
    () => () => {},
    () => (detectMacPlatform() ? "⌘ K" : "Ctrl K"),
    () => null,
  );

  const loadFriends = useCallback(async () => {
    if (loadState === "loading" || friends !== null) {
      return;
    }
    setLoadState("loading");
    try {
      const response = await fetch("/api/users/list", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load friends");
      }
      const data = (await response.json()) as FriendPickerUser[];
      setFriends(data);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [friends, loadState]);

  const trimmedQuery = query.trim();
  const showPanel = open && trimmedQuery.length > 0;

  const results = useMemo(() => {
    if (!friends || !trimmedQuery) {
      return [];
    }
    return filterFriendsByQuery(friends, trimmedQuery);
  }, [friends, trimmedQuery]);

  const focusInput = useCallback(() => {
    void loadFriends();
    inputRef.current?.focus();
    setOpen(true);
  }, [loadFriends]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isModK =
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "k";

      if (isModK) {
        event.preventDefault();
        focusInput();
        return;
      }

      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focusInput, open]);

  useEffect(() => {
    if (!showPanel) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showPanel]);

  function openFriend(friend: FriendPickerUser) {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
    router.push(`/friends/${encodeURIComponent(friend.name)}`);
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!showPanel || results.length === 0) {
      if (event.key === "ArrowDown" && trimmedQuery) {
        event.preventDefault();
        void loadFriends();
        setOpen(true);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        index >= results.length - 1 ? 0 : index + 1,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        index <= 0 ? results.length - 1 : index - 1,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target =
        activeIndex >= 0 ? results[activeIndex] : results[0];
      if (target) {
        openFriend(target);
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative hidden min-w-0 flex-1 lg:block lg:max-w-md"
    >
      <label htmlFor={listboxId} className="sr-only">
        Search friends
      </label>
      <div className="relative flex items-center">
        <SearchIcon className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          id={listboxId}
          type="search"
          value={query}
          autoComplete="off"
          placeholder="Search friends..."
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={`${listboxId}-listbox`}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 && results[activeIndex]
              ? `${listboxId}-option-${results[activeIndex].id}`
              : undefined
          }
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
            void loadFriends();
          }}
          onFocus={() => {
            setOpen(true);
            void loadFriends();
          }}
          onKeyDown={onInputKeyDown}
          className="h-9 w-full rounded-xl border border-border bg-background py-2 pl-9 pr-[4.5rem] text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {shortcutLabel ? (
          <kbd
            className="pointer-events-none absolute right-2 hidden select-none rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline"
            aria-hidden="true"
          >
            {shortcutLabel}
          </kbd>
        ) : (
          <span
            className="pointer-events-none absolute right-2 h-5 w-10 rounded-md bg-muted/40 sm:inline"
            aria-hidden="true"
          />
        )}
      </div>

      {showPanel ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          role="presentation"
        >
          {loadState === "loading" || loadState === "idle" ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Loading…</p>
          ) : loadState === "error" ? (
            <p className="px-4 py-3 text-sm text-destructive" role="alert">
              Could not load friends. Try again.
            </p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No friends found
            </p>
          ) : (
            <ul
              id={`${listboxId}-listbox`}
              role="listbox"
              className="max-h-72 divide-y divide-border overflow-y-auto"
            >
              {results.map((friend, index) => {
                const isActive = index === activeIndex;
                return (
                  <li key={friend.id} role="presentation">
                    <button
                      type="button"
                      id={`${listboxId}-option-${friend.id}`}
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => openFriend(friend)}
                      className={`flex min-h-[52px] w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                        isActive ? "bg-muted/70" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border">
                        <Image
                          src={friend.profileImage}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="36px"
                        />
                      </div>
                      <span className="font-medium text-foreground">
                        {friend.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
