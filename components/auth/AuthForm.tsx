"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import GlowingBorder from "@/components/ui/glowing-border";
import Image from "next/image";

const authSchema = z.object({
  username: z
    .string()
    .min(2, "Username must be at least 2 characters")
    .max(50, "Username must be less than 50 characters")
    .trim(),
  passcode: z
    .string()
    .min(4, "Passcode must be at least 4 characters")
    .max(128, "Passcode must be less than 128 characters"),
});

type AuthFormData = z.infer<typeof authSchema>;

export default function AuthForm() {
  const [showPasscode, setShowPasscode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    mode: "onBlur",
  });

  const onSubmit = useCallback(
    async (data: AuthFormData) => {
      setIsSubmitting(true);
      setAuthError(null);

      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(data),
        });

        if (response.ok) {
          const result = (await response.json()) as { redirectTo?: string };
          // Use the server-determined redirect URL (role-based)
          const redirectUrl = result.redirectTo || "/home";
          router.push(redirectUrl);
        } else if (response.status === 401) {
          setAuthError("Invalid username or passcode.");
        } else if (response.status === 400) {
          setAuthError("Invalid request. Please check your input.");
        } else {
          setAuthError("An error occurred. Please try again.");
        }
      } catch {
        setAuthError("An error occurred. Please try again.");
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [router],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full max-w-md px-4"
    >
      <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-xl">
        {/* Logo and Tagline */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-center mb-6 sm:mb-8"
        >
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-2">
            <Image
              src="/logo.png"
              alt="Snappy Logo"
              width={96}
              height={96}
              className="w-24 h-24"
            />
            <h1 className="text-3xl sm:text-4xl font-bold text-primary">
              Snappy
            </h1>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm">
            A private space for friends to share and discover snaps
          </p>
        </motion.div>

        {/* Form */}
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (isSubmittingRef.current) return;
            isSubmittingRef.current = true;
            void handleSubmit(onSubmit, () => {
              isSubmittingRef.current = false;
            })(event);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            if (!(event.target instanceof HTMLInputElement)) return;

            // Enter in an input should submit the form. Some environments do not
            // fire implicit submission reliably, so trigger the same native submit
            // path used by the Sign In button.
            event.preventDefault();
            event.currentTarget.requestSubmit();
          }}
          className="space-y-4 sm:space-y-6"
        >
          {/* Username Field */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <label
              htmlFor="username"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              placeholder="Enter your desired name"
              autoComplete="username"
              disabled={isSubmitting}
              {...register("username")}
              aria-invalid={errors.username ? "true" : "false"}
              aria-describedby={errors.username ? "username-error" : undefined}
              className="w-full px-4 py-3 sm:py-2.5 text-base border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
            />
            {errors.username && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                id="username-error"
                className="text-destructive text-sm mt-1"
                role="alert"
              >
                {errors.username.message}
              </motion.p>
            )}
          </motion.div>

          {/* Passcode Field */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <label
              htmlFor="passcode"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Passcode
            </label>
            <div className="relative">
              <input
                id="passcode"
                type={showPasscode ? "text" : "password"}
                placeholder="Enter passcode"
                autoComplete="current-password"
                disabled={isSubmitting}
                {...register("passcode")}
                aria-invalid={errors.passcode ? "true" : "false"}
                aria-describedby={
                  errors.passcode ? "passcode-error" : undefined
                }
                className="w-full px-4 py-3 sm:py-2.5 text-base pr-12 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPasscode(!showPasscode)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded p-1"
                aria-label={showPasscode ? "Hide passcode" : "Show passcode"}
              >
                {showPasscode ? (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
            {errors.passcode && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                id="passcode-error"
                className="text-destructive text-sm mt-1"
                role="alert"
              >
                {errors.passcode.message}
              </motion.p>
            )}
          </motion.div>

          {/* Submit Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            <GlowingBorder radius="lg" className="block w-full">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary text-primary-foreground font-medium py-3 sm:py-2.5 px-4 rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-base"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>
            </GlowingBorder>
          </motion.div>
        </form>

        {/* General Error State */}
        {authError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
          >
            <p className="text-destructive text-sm text-center">{authError}</p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
