"use client";

import ThemeSwitcher from "@/components/theme/ThemeSwitcher";

export default function MobileThemeSwitcher() {
  return (
    <div className="md:hidden shrink-0">
      <ThemeSwitcher />
    </div>
  );
}
