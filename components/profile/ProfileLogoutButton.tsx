"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ProfileLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
          router.push("/");
          router.refresh();
        } finally {
          setLoading(false);
        }
      }}
      className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 sm:w-auto"
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
