"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminSnap } from "@/lib/admin-types";
import { formatAdminDate, getGreeting } from "@/lib/admin-types";
import { adminFetch, readAdminError } from "@/lib/admin-client";

interface DashboardStats {
  totalUsers: number;
  totalSnaps: number;
  adminCount: number;
}

export default function DashboardPageClient({ username }: { username: string }) {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentSnaps, setRecentSnaps] = useState<AdminSnap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await adminFetch("/api/admin/stats");

      if (response.status === 401) {
        router.replace("/admin");
        router.refresh();
        return;
      }

      if (!response.ok) {
        setError(await readAdminError(response));
        return;
      }

      const data = (await response.json()) as {
        stats: DashboardStats;
        recentSnaps: AdminSnap[];
      };

      setStats(data.stats);
      setRecentSnaps(data.recentSnaps);
    } catch {
      setError("Unable to load dashboard. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialDashboard() {
      try {
        const response = await adminFetch("/api/admin/stats");

        if (cancelled) return;

        if (response.status === 401) {
          router.replace("/admin");
          router.refresh();
          return;
        }

        if (!response.ok) {
          setError(await readAdminError(response));
          return;
        }

        const data = (await response.json()) as {
          stats: DashboardStats;
          recentSnaps: AdminSnap[];
        };

        setStats(data.stats);
        setRecentSnaps(data.recentSnaps);
      } catch {
        if (!cancelled) {
          setError("Unable to load dashboard. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInitialDashboard();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
        <h2 className="text-lg font-semibold">Unable to load dashboard</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        {error.toLowerCase().includes("unauthorized") && (
          <p className="mt-2 text-sm text-muted-foreground">
            Your admin session may have expired.
          </p>
        )}
        <button
          type="button"
          onClick={() => void loadDashboard(true)}
          className="mt-6 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">
          {getGreeting()}, {username} 👋
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Manage your Snappy community from here.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))
        ) : (
          [
            { label: "Total Users", value: stats?.totalUsers ?? 0 },
            { label: "Total Snaps", value: stats?.totalSnaps ?? 0 },
            { label: "Admins", value: stats?.adminCount ?? 0 },
          ].map((item) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="mt-3 text-3xl font-semibold text-primary">{item.value}</p>
            </motion.div>
          ))
        )}
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Snaps</h2>
          <Link
            href="/admin/snaps"
            className="text-sm font-medium text-primary hover:opacity-90"
          >
            View all
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-56 rounded-2xl" />
            ))}
          </div>
        ) : recentSnaps.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">No snaps yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recentSnaps.map((snap) => (
              <motion.div
                key={snap.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-2xl border border-border bg-card"
              >
                <div className="relative aspect-[4/3] bg-muted">
                  <Image
                    src={snap.imageUrl}
                    alt={snap.caption ?? `${snap.user.name}'s snap`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <Image
                      src={snap.user.profileImage}
                      alt={snap.user.name}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                    <div>
                      <p className="text-sm font-medium">{snap.user.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatAdminDate(snap.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/admin/snaps"
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    Manage
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
