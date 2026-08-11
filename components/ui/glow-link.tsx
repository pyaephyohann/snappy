import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import GlowingBorder, { type GlowRadius } from "./glowing-border";

interface GlowLinkProps extends ComponentProps<typeof Link> {
  children: ReactNode;
  radius?: GlowRadius;
  glowClassName?: string;
}

export function GlowLink({
  children,
  className = "",
  radius = "lg",
  glowClassName = "inline-block",
  ...props
}: GlowLinkProps) {
  return (
    <GlowingBorder radius={radius} className={glowClassName}>
      <Link className={className} {...props}>
        {children}
      </Link>
    </GlowingBorder>
  );
}
