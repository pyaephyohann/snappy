"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ProfileLogoutButtonProps {
  variant?: "default" | "destructive";
}

export default function ProfileLogoutButton({
  variant = "default",
}: ProfileLogoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const className =
    variant === "destructive"
      ? "w-full rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/15 disabled:opacity-50"
      : "w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 sm:w-auto";

  return (
    <div className="space-y-2">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            const response = await fetch("/api/auth/logout", {
              method: "POST",
              credentials: "include",
            });
            if (!response.ok) {
              throw new Error("Could not sign out");
            }
            router.push("/");
            router.refresh();
          } catch {
            setError("Sign out failed. Please try again.");
          } finally {
            setLoading(false);
          }
        }}
        className={className}
      >
        {loading ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
