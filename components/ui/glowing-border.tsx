import type { ElementType, ReactNode } from "react";

const radiusMap = {
  full: "rounded-full",
  "2xl": "rounded-2xl",
  xl: "rounded-xl",
  lg: "rounded-lg",
  md: "rounded-md",
  none: "rounded-none",
} as const;

export type GlowRadius = keyof typeof radiusMap;

interface GlowingBorderProps {
  children: ReactNode;
  className?: string;
  radius?: GlowRadius;
  intensity?: "default" | "strong";
  /** Keeps animated glow on mobile inside `.user-app-shell` (e.g. home HeroCarousel). */
  featured?: boolean;
  as?: ElementType;
}

export default function GlowingBorder({
  children,
  className = "",
  radius = "xl",
  intensity = "default",
  featured = false,
  as: Component = "div",
}: GlowingBorderProps) {
  const radiusClass = radiusMap[radius];
  const intensityClass = intensity === "strong" ? "glow-border-strong" : "";
  const featuredClass = featured ? "glow-border-featured" : "";

  return (
    <Component
      className={`glow-border ${radiusClass} ${intensityClass} ${featuredClass} ${className}`.trim()}
    >
      {children}
    </Component>
  );
}
