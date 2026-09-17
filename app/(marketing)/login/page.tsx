"use client";

import { Suspense } from "react";
import AuthForm from "@/components/auth/AuthForm";

export default function LoginPage() {
  return (
    <div className="safe-area-pt safe-area-pb min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <Suspense fallback={null}>
        <AuthForm />
      </Suspense>
    </div>
  );
}
