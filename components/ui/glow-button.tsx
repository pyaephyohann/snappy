import type { ButtonHTMLAttributes, ReactNode } from "react";
import GlowingBorder, { type GlowRadius } from "./glowing-border";

interface GlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  radius?: GlowRadius;
  glowClassName?: string;
}

export function GlowButton({
  children,
  className = "",
  radius = "lg",
  glowClassName = "inline-block",
  type = "button",
  ...props
}: GlowButtonProps) {
  return (
    <GlowingBorder radius={radius} className={glowClassName}>
      <button {...props} type={type} className={className}>
        {children}
      </button>
    </GlowingBorder>
  );
}
