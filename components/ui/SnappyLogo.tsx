import Image from "next/image";

interface SnappyLogoProps {
  /** Show the ADMIN badge next to the logo */
  admin?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Hide the logo image (text-only mode) */
  textOnly?: boolean;
}

const sizeConfig = {
  sm: {
    image: "w-8 h-8",
    imageSize: 32,
    text: "text-xl",
    badge: "text-[10px] px-1.5 py-0.5",
  },
  md: {
    image: "w-24 h-24",
    imageSize: 96,
    text: "text-2xl sm:text-4xl lg:text-5xl",
    badge: "text-xs px-2 py-0.5",
  },
  lg: {
    image: "w-24 h-24",
    imageSize: 96,
    text: "text-2xl sm:text-4xl lg:text-5xl",
    badge: "text-xs px-2 py-0.5",
  },
} as const;

export default function SnappyLogo({
  admin = false,
  size = "md",
  textOnly = false,
}: SnappyLogoProps) {
  const config = sizeConfig[size];

  return (
    <span className="inline-flex items-center gap-2">
      {!textOnly && (
        <Image
          src="/logo.png"
          alt="Snappy Logo"
          width={config.imageSize}
          height={config.imageSize}
          className={config.image}
          priority
        />
      )}
      <span
        className={`${config.text} font-bold text-primary caveat-font`}
      >
        Snappy
      </span>
      {admin && (
        <span
          className={`rounded-full bg-primary/10 font-medium text-primary ${config.badge}`}
        >
          Admin
        </span>
      )}
    </span>
  );
}
