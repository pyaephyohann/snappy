'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

interface SnapCardProps {
  imageUrl: string;
  caption?: string | null;
  createdAt: Date;
}

export default function SnapCard({ imageUrl, caption, createdAt }: SnapCardProps) {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
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
      className="bg-card border border-border rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300"
    >
      <div className="relative aspect-square">
        <Image
          src={imageUrl}
          alt={caption || 'Snap'}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
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
