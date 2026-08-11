'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import GlowingBorder from '@/components/ui/glowing-border';

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
      className="cursor-pointer"
    >
      <GlowingBorder radius="xl" className="h-full">
        <div className="bg-card border border-border rounded-xl p-3 sm:p-6 shadow-lg hover:shadow-xl transition-all duration-300 h-full">
          <div className="flex flex-col items-center text-center">
            <GlowingBorder radius="full" className="w-16 h-16 sm:w-24 sm:h-24 mb-2 sm:mb-4 shrink-0">
              <div className="w-full h-full rounded-full overflow-hidden relative">
                <Image
                  src={profileImage}
                  alt={name}
                  fill
                  className="object-cover"
                  sizes="64px, 96px"
                  unoptimized={profileImage.includes('.svg') || profileImage.includes('dicebear')}
                  priority
                />
              </div>
            </GlowingBorder>
            <h3 className="text-sm sm:text-lg font-semibold text-foreground truncate w-full">{name}</h3>
          </div>
        </div>
      </GlowingBorder>
    </motion.div>
  );
}
