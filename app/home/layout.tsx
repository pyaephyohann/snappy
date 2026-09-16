"use client";

import AppShell from "@/components/layout/AppShell";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="user-app-shell min-h-full">
      <AppShell>{children}</AppShell>
    </div>
  );
}
