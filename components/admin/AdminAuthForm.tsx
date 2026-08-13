"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import GlowingBorder from "@/components/ui/glowing-border";
import { adminFetch } from "@/lib/admin-client";

export default function AdminAuthForm() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await adminFetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });

      if (response.ok) {
        router.refresh();
        return;
      }

      const result = (await response.json()) as { error?: string };
      setError(result.error ?? "Invalid admin passcode");
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Image
                src="/logo.png"
                alt="Snappy Logo"
                width={64}
                height={64}
                className="w-16 h-16"
              />
              <h1 className="text-3xl font-bold text-primary caveat-font">Snappy</h1>
            </div>
            <p className="text-sm font-medium text-foreground">Admin Dashboard</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your administrator passcode
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="admin-passcode"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Passcode
              </label>
              <div className="relative">
                <input
                  id="admin-passcode"
                  type={showPasscode ? "text" : "password"}
                  value={passcode}
                  onChange={(event) => setPasscode(event.target.value)}
                  placeholder="Enter admin passcode"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 pr-12 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode(!showPasscode)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPasscode ? "Hide passcode" : "Show passcode"}
                >
                  {showPasscode ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <GlowingBorder radius="lg" className="block w-full">
              <button
                type="submit"
                disabled={isSubmitting || passcode.length === 0}
                className="w-full bg-primary text-primary-foreground font-medium py-3 px-4 rounded-xl hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isSubmitting ? "Signing in..." : "Login"}
              </button>
            </GlowingBorder>
          </form>

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-xl"
            >
              <p className="text-destructive text-sm text-center">{error}</p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
