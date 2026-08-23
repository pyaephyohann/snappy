"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import AdminSidebar, { AdminSidebarFooter } from "@/components/admin/AdminSidebar";
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
              <AdminSidebar uuid={uuid} />
              <AdminSidebarFooter
                username={username}
                onLogout={handleLogout}
                isLoggingOut={isLoggingOut}
              />
            </div>
          </div>

          <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
            <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur-sm lg:hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground"
                  aria-label="Open menu"
                >
                  <MenuIcon />
                </button>
                <span className="text-sm font-medium text-primary">Snappy Admin</span>
                <span className="text-xs text-muted-foreground">{username}</span>
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
                className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-card lg:hidden"
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
                  <AdminSidebar uuid={uuid} onNavigate={() => setMobileOpen(false)} />
                </div>
                <AdminSidebarFooter
                  username={username}
                  onLogout={handleLogout}
                  isLoggingOut={isLoggingOut}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
    </div>
  );
}
