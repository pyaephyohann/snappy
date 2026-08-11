'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import GlowingBorder from '@/components/ui/glowing-border';

interface SnapCardProps {
  imageUrl: string;
  caption?: string | null;
  createdAt: Date | string;
  interactive?: boolean;
  onClick?: () => void;
}

export default function SnapCard({ imageUrl, caption, createdAt, interactive = false, onClick }: SnapCardProps) {
  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className={`h-full ${interactive ? 'cursor-pointer' : ''}`}
    >
      <GlowingBorder radius="xl" className="h-full">
        <div
          className={`bg-card border border-border rounded-xl overflow-hidden shadow-lg transition-all duration-300 h-full ${
            interactive ? 'hover:shadow-xl' : ''
          }`}
        >
          <div className="relative aspect-square">
            <Image
              src={imageUrl}
              alt={caption || 'Snap'}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 50vw, 33vw"
              unoptimized={imageUrl.includes('.svg') || imageUrl.includes('dicebear')}
            />
          </div>

          {(caption || createdAt) && (
            <div className="p-2 sm:p-4">
              {caption && (
                <p className="text-foreground text-xs sm:text-sm mb-1 sm:mb-2 line-clamp-2">{caption}</p>
              )}
              {createdAt && (
                <p className="text-muted-foreground text-xs">{formatDate(createdAt)}</p>
              )}
            </div>
          )}
        </div>
      </GlowingBorder>
    </motion.div>
  );
}
