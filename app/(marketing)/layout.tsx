import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Snappy — Share Moments. Stay Connected.",
  description:
    "Snappy is a private social app for friends to share quick photo snaps with each other. Share moments, stay connected.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
