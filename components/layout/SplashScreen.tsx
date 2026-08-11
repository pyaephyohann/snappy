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
    <div className="h-screen flex items-center justify-center">
      <div className="relative flex items-center gap-8 ml-[6rem]">
        {/* Camera Splash */}
        <div className="absolute -left-32 -top-20">
          <CameraSplash />
        </div>

        {/* Text */}
        <motion.h1
          variants={container}
          initial="hidden"
          animate="visible"
          className="text-5xl ml-[1rem] font-bold flex caveat-font"
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
