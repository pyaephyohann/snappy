"use client";

import { motion } from "framer-motion";

export default function SocialProof() {
  return (
    <section className="relative py-16 sm:py-20" id="about">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Made for the moments you don&apos;t want to lose. Snappy focuses on
            sharing simple everyday moments with people who matter — no followers,
            no likes, no noise.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-10 sm:mt-12 flex items-center justify-center gap-8 sm:gap-12"
        >
          {[
            { value: "Private", label: "By default" },
            { value: "Ad-free", label: "Always" },
            { value: "Friends", label: "Only" },
          ].map((stat) => (
            <div key={stat.value} className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-foreground">
                {stat.value}
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1">
                {stat.label}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
