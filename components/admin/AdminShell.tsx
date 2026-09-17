"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import AdminSidebar, {
  AdminNavbarUserActions,
} from "@/components/admin/AdminSidebar";
import { CloseIcon, MenuIcon } from "@/components/admin/icons";
import { adminFetch } from "@/lib/admin-client";

interface AdminShellProps {
  username: string;
  uuid: string;
  children: React.ReactNode;
}

export default function AdminShell({ username, uuid, children }: AdminShellProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      const response = await adminFetch("/api/admin/auth/logout", { method: "POST" });
      if (response.ok) {
        router.push("/");
        router.refresh();
      }
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
        <div className="flex min-h-screen">
          <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
            <div className="flex h-full flex-col">
              <AdminSidebar
                uuid={uuid}
                showUserActions
                username={username}
                onLogout={handleLogout}
                isLoggingOut={isLoggingOut}
              />
            </div>
          </div>

          <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
            <header className="safe-area-pt sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur-sm lg:hidden">
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="shrink-0 cursor-pointer rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Open menu"
                >
                  <MenuIcon />
                </button>
                <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-primary">
                  Snappy Admin
                </span>
                <AdminNavbarUserActions
                  username={username}
                  onLogout={handleLogout}
                  isLoggingOut={isLoggingOut}
                  compact
                />
              </div>
            </header>

            <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/60 lg:hidden"
                aria-label="Close menu overlay"
                onClick={() => setMobileOpen(false)}
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
                className="safe-area-pt safe-area-pb fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-card lg:hidden"
              >
                <div className="flex items-center justify-end px-3 py-3">
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground"
                    aria-label="Close menu"
                  >
                    <CloseIcon />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <AdminSidebar
                    uuid={uuid}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
    </div>
  );
}
