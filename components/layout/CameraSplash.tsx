import { motion } from "framer-motion";

const CameraSplash = () => {
  return (
    <div className="relative">
      {/* Hanger */}
      <img
        src="/hanger.png"
        alt="Hanger"
        className="absoute -top-12 w-32 z-10 "
      />

      {/* Camera */}
      <motion.img
        src="/logo.png"
        alt="Camera"
        className="absolute top-18 origin-top ml-4"
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
      />
    </div>
  );
};

export default CameraSplash;
