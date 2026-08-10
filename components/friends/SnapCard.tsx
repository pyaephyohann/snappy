'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

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
      className={`bg-card border border-border rounded-xl overflow-hidden shadow-lg transition-all duration-300 ${
        interactive ? 'hover:shadow-xl cursor-pointer' : ''
      }`}
    >
      <div className="relative aspect-square">
        <Image
          src={imageUrl}
          alt={caption || 'Snap'}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          unoptimized={imageUrl.includes('.svg') || imageUrl.includes('dicebear')}
        />
      </div>
      
      {(caption || createdAt) && (
        <div className="p-4">
          {caption && (
            <p className="text-foreground text-sm mb-2 line-clamp-2">{caption}</p>
          )}
          {createdAt && (
            <p className="text-muted-foreground text-xs">{formatDate(createdAt)}</p>
          )}
        </div>
      )}
    </motion.div>
  );
}
