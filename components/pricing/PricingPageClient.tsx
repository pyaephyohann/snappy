"use client";

import { motion } from "framer-motion";
import SparkBalanceCard from "@/components/sparks/SparkBalanceCard";
import SparkTransferSoonCard from "@/components/sparks/SparkTransferSoonCard";
import SparkPlanSection from "@/components/sparks/SparkPlanSection";

/** Outer container: delays children so the page header can land first. */
const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.08,
      staggerChildren: 0.12,
    },
  },
};

/**
 * Every direct child inherits this variant.
 * Starts transparent and 50 px below its resting position, then springs
 * into place with a soft easeOut feel.
 */
const cardVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 60,
      damping: 18,
      mass: 0.8,
    },
  },
};

/**
 * Animated wrapper for a single pricing card so the stagger propagates
 * through the container correctly.
 */
function AnimatedCard({ children }: { children: React.ReactNode }) {
  return <motion.div variants={cardVariants}>{children}</motion.div>;
}

/**
 * Pricing page client component.
 *
 * Renders the three pricing / Spark widgets (balance, transfer-soon, plan
 * comparison) inside a staggered Framer Motion container so each card
 * fades in and slides up sequentially after the page heading appears.
 *
 * No pricing state or logic lives here — all data and purchase flow logic
 * remain inside SparkBalanceCard, SparkTransferSoonCard, and SparkPlanSection.
 */
export default function PricingPageClient() {
  return (
    <motion.div
      className="mx-auto max-w-5xl space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <AnimatedCard>
        <SparkBalanceCard />
      </AnimatedCard>

      <AnimatedCard>
        <SparkTransferSoonCard />
      </AnimatedCard>

      {/* SparkPlanSection is itself a <section> element so we wrap it in a
          plain div to avoid nesting sections while still letting the motion
          variant cascade correctly. */}
      <AnimatedCard>
        <SparkPlanSection />
      </AnimatedCard>
    </motion.div>
  );
}
