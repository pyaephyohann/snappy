"use client";

import { useState } from "react";
import { GlowButton } from "@/components/ui/glow-button";
import SnapCreateComposerModal from "@/components/snaps/SnapCreateComposerModal";

interface SnapUploaderProps {
  onUpload?: (file: File, caption?: string) => Promise<void>;
}

export default function SnapUploader({ onUpload }: SnapUploaderProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <GlowButton
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background sm:text-base"
        aria-label="Add snap"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        Add Snap
      </GlowButton>

      {isOpen ? (
        <SnapCreateComposerModal
          onClose={() => setIsOpen(false)}
          onUpload={onUpload}
          enableInModalCamera
        />
      ) : null}
    </>
  );
}
