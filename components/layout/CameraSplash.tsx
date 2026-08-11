import { motion } from "framer-motion";
import Image from "next/image";

const CameraSplash = () => {
  return (
    <div className="relative">
      {/* Hanger */}
      <Image
        src="/hanger.png"
        alt="Hanger"
        width={128}
        height={128}
        className="absolute -top-12 w-32 z-10"
      />

      {/* Camera */}
      <motion.div
        initial={{ y: -400, rotate: 0 }}
        animate={{
          y: 0,
          rotate: [0, 4, -4, 2, 0], // swing
        }}
        transition={{
          y: {
            type: "spring",
            stiffness: 140,
            damping: 12,
            mass: 1.2,
          },
          rotate: {
            duration: 1.2,
            ease: "easeOut",
          },
        }}
        className="absolute top-14 -translate-x-1/2 origin-top ml-[1rem]"
      >
        <Image src="/logo.png" alt="Camera" width={200} height={200} />
      </motion.div>
    </div>
  );
};

export default CameraSplash;
