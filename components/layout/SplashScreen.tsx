"use client";

import { motion } from "framer-motion";
import CameraSplash from "./CameraSplash";

const SplashScreen = () => {
  const text = "Snappy";

  const container = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const letter = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center">
      {/* Camera + Text as a single centered group */}
      <div className="flex flex-col items-center">
        <CameraSplash />

        {/* Text — naturally centered below camera */}
        <motion.h1
          variants={container}
          initial="hidden"
          animate="visible"
          className="text-5xl font-bold flex caveat-font mt-2"
        >
          {text.split("").map((char, index) => (
            <motion.span key={index} variants={letter}>
              {char === " " ? "\u00A0" : char}
            </motion.span>
          ))}
        </motion.h1>
      </div>
    </div>
  );
};

export default SplashScreen;
