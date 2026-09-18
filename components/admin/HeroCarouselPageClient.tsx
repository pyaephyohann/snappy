"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import HeroCarouselAddSnapModal from "@/components/admin/HeroCarouselAddSnapModal";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/admin/icons";
import { useToast } from "@/components/admin/ToastProvider";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AdminHeroCarouselConfig,
  AdminHeroCarouselSlide,
} from "@/lib/admin-types";
import { formatAdminDate } from "@/lib/admin-types";
import { adminFetch } from "@/lib/admin-client";

const TITLE_MAX_LENGTH = 120;

export default function HeroCarouselPageClient() {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [slides, setSlides] = useState<AdminHeroCarouselSlide[]>([]);
  const [savedTitle, setSavedTitle] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSession, setPickerSession] = useState(0);
  const [addingSnapId, setAddingSnapId] = useState<string | null>(null);

  const [removeOpen, setRemoveOpen] = useState(false);
  const [slideToRemove, setSlideToRemove] =
    useState<AdminHeroCarouselSlide | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const [reorderingSlideId, setReorderingSlideId] = useState<string | null>(
    null,
  );

  const selectedSnapIds = useMemo(
    () => new Set(slides.map((slide) => slide.snapId)),
    [slides],
  );

  const refreshSlides = useCallback(async () => {
    const response = await adminFetch("/api/admin/hero-carousel/slides");
    if (!response.ok) {
      throw new Error("Failed to load slides");
    }

    const data = (await response.json()) as {
      slides: AdminHeroCarouselSlide[];
    };
    setSlides(data.slides);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      setLoading(true);
      try {
        const [configResponse, slidesResponse] = await Promise.all([
          adminFetch("/api/admin/hero-carousel/config"),
          adminFetch("/api/admin/hero-carousel/slides"),
        ]);

        if (cancelled) return;

        if (!configResponse.ok || !slidesResponse.ok) {
          throw new Error("Failed to load hero carousel");
        }

        const configData = (await configResponse.json()) as {
          config: AdminHeroCarouselConfig;
        };
        const slidesData = (await slidesResponse.json()) as {
          slides: AdminHeroCarouselSlide[];
        };

        const title = configData.config.title ?? "";
        setSavedTitle(title);
        setTitleDraft(title);
        setSlides(slidesData.slides);
      } catch {
        if (!cancelled) {
          showToast("Failed to load hero carousel", "error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const openPicker = () => {
    setPickerSession((current) => current + 1);
    setPickerOpen(true);
  };

  const handleSaveTitle = async () => {
    if (titleSaving) return;

    const trimmed = titleDraft.trim();
    if (trimmed.length > TITLE_MAX_LENGTH) {
      showToast(`Title must be less than ${TITLE_MAX_LENGTH} characters`, "error");
      return;
    }

    setTitleSaving(true);
    try {
      const response = await adminFetch("/api/admin/hero-carousel/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed.length > 0 ? trimmed : null,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        config?: AdminHeroCarouselConfig;
      };

      if (!response.ok || !result.config) {
        showToast(result.error ?? "Failed to save title", "error");
        return;
      }

      const nextTitle = result.config.title ?? "";
      setSavedTitle(nextTitle);
      setTitleDraft(nextTitle);
      showToast("Carousel title saved");
    } catch {
      showToast("Failed to save title", "error");
    } finally {
      setTitleSaving(false);
    }
  };

  const handleAddSnap = async (snapId: string) => {
    if (addingSnapId) return;

    setAddingSnapId(snapId);
    try {
      const response = await adminFetch("/api/admin/hero-carousel/slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapId }),
      });

      const result = (await response.json()) as {
        error?: string;
        slide?: AdminHeroCarouselSlide;
      };

      if (response.status === 409) {
        showToast(
          result.error ?? "This snap is already in the hero carousel",
          "error",
        );
        return;
      }

      if (!response.ok || !result.slide) {
        showToast(result.error ?? "Failed to add image", "error");
        return;
      }

      setSlides((current) =>
        [...current, result.slide!].sort((a, b) => a.sortOrder - b.sortOrder),
      );
      showToast("Image added to hero carousel");
      setPickerOpen(false);
    } catch {
      showToast("Failed to add image", "error");
    } finally {
      setAddingSnapId(null);
    }
  };

  const handleMoveSlide = async (
    slideId: string,
    direction: "up" | "down",
  ) => {
    if (reorderingSlideId) return;

    const index = slides.findIndex((slide) => slide.id === slideId);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= slides.length) return;

    setReorderingSlideId(slideId);
    try {
      const response = await adminFetch(
        `/api/admin/hero-carousel/slides/${slideId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: targetIndex }),
        },
      );

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        showToast(result.error ?? "Failed to reorder slides", "error");
        return;
      }

      await refreshSlides();
    } catch {
      showToast("Failed to reorder slides", "error");
    } finally {
      setReorderingSlideId(null);
    }
  };

  const handleRemoveSlide = async () => {
    if (!slideToRemove || removeLoading) return;

    setRemoveLoading(true);
    try {
      const response = await adminFetch(
        `/api/admin/hero-carousel/slides/${slideToRemove.id}`,
        { method: "DELETE" },
      );

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        showToast(result.error ?? "Failed to remove image", "error");
        return;
      }

      await refreshSlides();
      showToast("Image removed from hero carousel");
      setRemoveOpen(false);
      setSlideToRemove(null);
    } catch {
      showToast("Failed to remove image", "error");
    } finally {
      setRemoveLoading(false);
    }
  };

  const titleUnchanged = titleDraft.trim() === savedTitle.trim();
  const reorderBusy = reorderingSlideId !== null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Hero Carousel</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Control the title and images displayed in the user app HeroCarousel.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-sm font-medium">Carousel Title</h2>
        {loading ? (
          <Skeleton className="mt-4 h-11 w-full max-w-xl rounded-xl" />
        ) : (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              value={titleDraft}
              maxLength={TITLE_MAX_LENGTH}
              onChange={(event) => setTitleDraft(event.target.value)}
              placeholder="Optional title shown above the carousel"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => void handleSaveTitle()}
              disabled={titleSaving || titleUnchanged}
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {titleSaving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium">Selected Images</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {loading
                ? "Loading slides..."
                : `${slides.length} image${slides.length === 1 ? "" : "s"} selected`}
            </p>
          </div>
          <button
            type="button"
            onClick={openPicker}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlusIcon className="w-4 h-4" />
            Add Existing Snap
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        ) : slides.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
            <h3 className="text-lg font-medium">No images selected</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Add existing Snaps to your HeroCarousel.
            </p>
            <button
              type="button"
              onClick={openPicker}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <PlusIcon className="w-4 h-4" />
              Add Image
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {slides.map((slide, index) => {
              const isReordering = reorderingSlideId === slide.id;

              return (
                <li
                  key={slide.id}
                  className="overflow-hidden rounded-2xl border border-border bg-card"
                >
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {index + 1}
                      </span>
                      <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-24 sm:w-32">
                        <Image
                          src={slide.snap.imageUrl}
                          alt={
                            slide.altText ??
                            slide.snap.caption ??
                            `${slide.snap.user.name}'s snap`
                          }
                          fill
                          className="object-cover"
                          sizes="128px"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Image
                            src={slide.snap.user.profileImage}
                            alt={slide.snap.user.name}
                            width={24}
                            height={24}
                            className="!h-6 !w-6 shrink-0 overflow-hidden rounded-full object-cover"
                          />
                          <p className="truncate text-sm font-medium">
                            {slide.snap.user.name}
                          </p>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {slide.snap.caption ?? "No caption"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Added {formatAdminDate(slide.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={
                          reorderBusy || index === 0 || isReordering
                        }
                        onClick={() => void handleMoveSlide(slide.id, "up")}
                        className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ChevronUpIcon />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={
                          reorderBusy ||
                          index === slides.length - 1 ||
                          isReordering
                        }
                        onClick={() => void handleMoveSlide(slide.id, "down")}
                        className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ChevronDownIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSlideToRemove(slide);
                          setRemoveOpen(true);
                        }}
                        disabled={reorderBusy}
                        className="inline-flex items-center justify-center gap-1 rounded-xl border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <TrashIcon />
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <HeroCarouselAddSnapModal
        key={pickerSession}
        open={pickerOpen}
        selectedSnapIds={selectedSnapIds}
        addingSnapId={addingSnapId}
        onClose={() => {
          if (addingSnapId) return;
          setPickerOpen(false);
        }}
        onSelect={(snapId) => void handleAddSnap(snapId)}
      />

      <ConfirmDialog
        open={removeOpen}
        title="Remove from hero carousel?"
        description="Remove this image from the HeroCarousel? The original Snap will not be deleted."
        confirmLabel="Remove"
        destructive
        loading={removeLoading}
        onCancel={() => {
          if (removeLoading) return;
          setRemoveOpen(false);
          setSlideToRemove(null);
        }}
        onConfirm={() => void handleRemoveSlide()}
      />
    </div>
  );
}
