"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import GlowingBorder from "@/components/ui/glowing-border";
import type { PublicHeroCarouselSlide } from "@/lib/hero-carousel";

type CarouselImage = {
  id: string;
  image: string;
  alt: string;
};

const STATIC_FALLBACK_IMAGES: CarouselImage[] = [
  {
    id: "static-banner-1",
    image: "/images/home/banner-1.jpeg",
    alt: "Snappy hero banner 1",
  },
  {
    id: "static-banner-2",
    image: "/images/home/banner-2.jpeg",
    alt: "Snappy hero banner 2",
  },
  {
    id: "static-banner-3",
    image: "/images/home/banner-3.jpeg",
    alt: "Snappy hero banner 3",
  },
];

function mapSlidesToCarouselImages(
  slides: PublicHeroCarouselSlide[],
): CarouselImage[] {
  return slides.map((slide) => ({
    id: slide.id,
    image: slide.imageUrl,
    alt: slide.altText,
  }));
}

interface HeroCarouselProps {
  title?: string | null;
  slides?: PublicHeroCarouselSlide[];
  /** When set, the carousel follows this slide index (e.g. payment method selection). */
  activeSlideIndex?: number;
  onActiveSlideIndexChange?: (index: number) => void;
  /** Defaults to true when uncontrolled; payment flows typically pass false. */
  autoPlay?: boolean;
}

const AUTO_PLAY_MS = 5000;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0.6,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0.6,
  }),
};

const controlledSlideVariants = {
  enter: { opacity: 0, scale: 0.98 },
  center: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
};

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 19l-7-7 7-7"
      />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}

export default function HeroCarousel({
  title = null,
  slides = [],
  activeSlideIndex,
  onActiveSlideIndexChange,
  autoPlay = activeSlideIndex === undefined,
}: HeroCarouselProps) {
  const [[currentIndex, direction], setSlide] = useState([0, 0]);
  const isControlled = activeSlideIndex !== undefined;
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const carouselImages = useMemo(() => {
    if (slides.length >= 1) {
      return mapSlidesToCarouselImages(slides);
    }
    return STATIC_FALLBACK_IMAGES;
  }, [slides]);

  const displayTitle = title?.trim() ? title.trim() : null;
  const total = carouselImages.length;

  const activeIndex = (() => {
    if (total <= 0) return 0;
    if (isControlled && activeSlideIndex !== undefined) {
      return Math.min(activeSlideIndex, total - 1);
    }
    return Math.min(currentIndex, total - 1);
  })();

  const current = carouselImages[activeIndex];

  const paginate = useCallback(
    (newDirection: number) => {
      const nextIndex = (activeIndex + newDirection + total) % total;
      if (isControlled) {
        onActiveSlideIndexChange?.(nextIndex);
        return;
      }
      setSlide(([index]) => {
        const computed = (index + newDirection + total) % total;
        return [computed, newDirection];
      });
    },
    [activeIndex, isControlled, onActiveSlideIndexChange, total],
  );

  const goToIndex = useCallback(
    (index: number) => {
      if (isControlled) {
        if (index !== activeIndex) {
          onActiveSlideIndexChange?.(index);
        }
        return;
      }
      setSlide(([currentIdx]) => {
        if (index === currentIdx) return [currentIdx, 0];
        const forward = (index - currentIdx + total) % total;
        const backward = (currentIdx - index + total) % total;
        const newDirection = forward <= backward ? 1 : -1;
        return [index, newDirection];
      });
    },
    [activeIndex, isControlled, onActiveSlideIndexChange, total],
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!autoPlay || isPaused || prefersReducedMotion || total <= 1) return;

    intervalRef.current = setInterval(() => {
      paginate(1);
    }, AUTO_PLAY_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoPlay, isPaused, prefersReducedMotion, total, paginate]);

  if (total === 0) return null;

  return (
    <section aria-label="Featured banners" className="mb-8 sm:mb-10">
      {displayTitle && (
        <h2 className="mb-4 text-xl font-semibold text-foreground sm:mb-5 sm:text-2xl">
          {displayTitle}
        </h2>
      )}
      <GlowingBorder
        radius="xl"
        intensity="strong"
        featured
        className="w-full"
      >
        <div
          className="relative bg-card rounded-xl border border-border overflow-hidden"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="relative w-full aspect-[16/9] sm:aspect-[21/8] md:aspect-[21/7] min-h-[180px] sm:min-h-[220px] md:min-h-[260px] overflow-hidden">
            <AnimatePresence initial={false} custom={isControlled ? undefined : direction}>
              <motion.div
                key={current.id}
                custom={isControlled ? undefined : direction}
                variants={isControlled ? controlledSlideVariants : slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
                className="absolute inset-0"
              >
                <Image
                  src={current.image}
                  alt={current.alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1280px"
                  priority={activeIndex === 0}
                />
              </motion.div>
            </AnimatePresence>

            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => paginate(-1)}
                  className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 p-2 sm:p-2.5 rounded-full bg-background/80 backdrop-blur-sm border border-border text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Previous slide"
                >
                  <ChevronLeftIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>

                <button
                  type="button"
                  onClick={() => paginate(1)}
                  className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 p-2 sm:p-2.5 rounded-full bg-background/80 backdrop-blur-sm border border-border text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Next slide"
                >
                  <ChevronRightIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </>
            )}
          </div>

          {total > 1 && (
            <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 sm:gap-2">
              {carouselImages.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goToIndex(index)}
                  className={`rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                    index === activeIndex
                      ? "w-6 sm:w-8 h-2 sm:h-2.5 bg-primary"
                      : "w-2 sm:w-2.5 h-2 sm:h-2.5 bg-muted-foreground/40 hover:bg-muted-foreground/60"
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                  aria-current={index === activeIndex ? "true" : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </GlowingBorder>
    </section>
  );
}
