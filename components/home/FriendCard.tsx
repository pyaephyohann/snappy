'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';

interface FriendCardProps {
  name: string;
  profileImage: string;
}

export default function FriendCard({ name, profileImage }: FriendCardProps) {
  const router = useRouter();

  const handleClick = () => {
    const encodedName = encodeURIComponent(name);
    router.push(`/friends/${encodedName}`);
  };

  return (
    <motion.div
      whileHover={{ scale: 1.05, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      className="bg-card border border-border rounded-xl p-6 cursor-pointer shadow-lg hover:shadow-xl transition-all duration-300"
    >
      <div className="flex flex-col items-center text-center">
        <div className="w-24 h-24 rounded-full overflow-hidden mb-4 ring-2 ring-primary/20 hover:ring-primary/40 transition-all duration-300 relative">
          <Image
            src={profileImage}
            alt={name}
            fill
            className="object-cover"
            sizes="96px"
          />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{name}</h3>
      </div>
    </motion.div>
  );
}
