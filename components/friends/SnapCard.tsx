'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import GlowingBorder from '@/components/ui/glowing-border';
import { GlowButton } from '@/components/ui/glow-button';
import { buildSnapFilename, downloadImage } from '@/lib/download-image';

interface SnapCardProps {
  id: string;
  imageUrl: string;
  caption?: string | null;
  createdAt: Date | string;
  friendName: string;
  snapIndex: number;
  interactive?: boolean;
  onClick?: () => void;
}

interface Comment {
  id: string;
  content: string;
  createdAt: Date | string;
  user: {
    id: string;
    name: string;
    profileImage: string;
  };
  likeCount: number;
  liked: boolean;
}

const REACTION_TYPES = ['LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'ANGRY'] as const;

const REACTION_EMOJIS: Record<string, string> = {
  LIKE: '👍',
  LOVE: '❤️',
  HAHA: '😂',
  WOW: '😮',
  SAD: '😢',
  ANGRY: '😡',
};

const REACTION_NAMES: Record<string, string> = {
  LIKE: 'Like',
  LOVE: 'Love',
  HAHA: 'Haha',
  WOW: 'Wow',
  SAD: 'Sad',
  ANGRY: 'Angry',
};

const MAX_COMMENT_LENGTH = 500;

export default function SnapCard({
  id,
  imageUrl,
  caption,
  createdAt,
  friendName,
  snapIndex,
  interactive = false,
  onClick,
}: SnapCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [reactionCount, setReactionCount] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleDownload = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();

      if (isDownloading) return;

      setIsDownloading(true);
      setDownloadError(null);

      try {
        const filename = buildSnapFilename(friendName, snapIndex, imageUrl);
        await downloadImage(imageUrl, filename);
      } catch {
        setDownloadError('Download failed');
      } finally {
        setIsDownloading(false);
      }
    },
    [friendName, snapIndex, imageUrl, isDownloading],
  );

  const handleReaction = async (type: string) => {
    try {
      const response = await fetch(`/api/snaps/${id}/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });

      if (response.ok) {
        const data = await response.json();
        setUserReaction(data.reaction?.type || null);
        setReactionCount(prev => data.reaction ? prev + 1 : prev - 1);
      }
    } catch (error) {
      console.error('Reaction error:', error);
    }
    setShowReactionPicker(false);
  };

  const handleCommentToggle = async () => {
    if (!showComments) {
      setCommentsLoading(true);
      setCommentsError(null);
      try {
        const response = await fetch(`/api/snaps/${id}/comments`);
        if (response.ok) {
          const data = await response.json();
          setComments(data.comments);
        } else {
          setCommentsError('Couldn\'t load comments.');
        }
      } catch (error) {
        console.error('Comments error:', error);
        setCommentsError('Couldn\'t load comments.');
      } finally {
        setCommentsLoading(false);
      }
    }
    setShowComments(!showComments);
  };

  const handleCommentSubmit = async () => {
    const trimmedComment = commentInput.trim();
    if (!trimmedComment || trimmedComment.length > MAX_COMMENT_LENGTH) return;

    setCommentSubmitting(true);
    try {
      const response = await fetch(`/api/snaps/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmedComment }),
      });

      if (response.ok) {
        const data = await response.json();
        setComments(prev => [data.comment, ...prev]);
        setCommentInput('');
      } else {
        const errorData = await response.json();
        setCommentsError(errorData.error || 'Failed to post comment.');
      }
    } catch (error) {
      console.error('Comment submit error:', error);
      setCommentsError('Failed to post comment.');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleCommentLike = async (commentId: string) => {
    try {
      const response = await fetch(`/api/comments/${commentId}/like`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        setComments(prev => prev.map(comment => 
          comment.id === commentId 
            ? { ...comment, liked: data.liked, likeCount: data.likeCount }
            : comment
        ));
      }
    } catch (error) {
      console.error('Comment like error:', error);
    }
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

            <div
              className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 z-10 flex flex-col items-end gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {downloadError && (
                <p
                  className="text-[10px] sm:text-xs text-destructive bg-background/90 backdrop-blur-sm px-1.5 py-0.5 rounded max-w-[120px] text-right"
                  role="alert"
                >
                  {downloadError}
                </p>
              )}
              <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
                <GlowButton
                  onClick={handleDownload}
                  disabled={isDownloading}
                  radius="full"
                  glowClassName="inline-block"
                  className="p-2 sm:p-2.5 rounded-full bg-background/80 backdrop-blur-sm border border-border/60 text-primary hover:bg-background/95 hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  aria-label={`Download snap ${snapIndex + 1}`}
                >
                  {isDownloading ? (
                    <svg
                      className="w-4 h-4 sm:w-5 sm:h-5 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4 sm:w-5 sm:h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"
                      />
                    </svg>
                  )}
                </GlowButton>
              </motion.div>
            </div>
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

          {/* Social Actions */}
          <div className="px-2 sm:px-4 pb-3 sm:pb-4">
            <div className="flex items-center gap-3 sm:gap-4 border-t border-border pt-3">
              {/* Reaction */}
              <div className="relative">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowReactionPicker(!showReactionPicker)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                  aria-label="React to snap"
                >
                  <span className="text-lg">
                    {userReaction ? REACTION_EMOJIS[userReaction] : '👍'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {userReaction ? REACTION_NAMES[userReaction] : 'React'}
                  </span>
                  {reactionCount > 0 && (
                    <span className="text-xs text-muted-foreground ml-1">
                      {reactionCount}
                    </span>
                  )}
                </motion.button>

                <AnimatePresence>
                  {showReactionPicker && (
                    <>
                      <div
                        className="fixed inset-0 z-50"
                        onClick={() => setShowReactionPicker(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full left-0 mb-2 z-50"
                      >
                        <div className="bg-card border border-border rounded-lg shadow-xl p-2 flex gap-1">
                          {REACTION_TYPES.map((type) => (
                            <motion.button
                              key={type}
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleReaction(type)}
                              className="p-2 hover:bg-secondary/50 rounded-lg transition-colors text-2xl"
                              aria-label={REACTION_NAMES[type]}
                              title={REACTION_NAMES[type]}
                            >
                              {REACTION_EMOJIS[type]}
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Comment */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleCommentToggle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                aria-label="Comment on snap"
              >
                <span className="text-lg">💬</span>
                <span className="text-xs text-muted-foreground">
                  Comment
                </span>
                {comments.length > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    {comments.length}
                  </span>
                )}
              </motion.button>

              {/* Share (placeholder for Milestone 8C) */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors focus:outline-none focus:ring-2 focus:ring-ring text-sm opacity-50 cursor-not-allowed"
                aria-label="Share snap"
                disabled
              >
                <span className="text-lg">📤</span>
                <span className="text-xs text-muted-foreground">
                  Share
                </span>
              </motion.button>
            </div>

            {/* Comments Section */}
            <AnimatePresence>
              {showComments && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 border-t border-border pt-3"
                >
                  {commentsLoading ? (
                    <div className="text-center py-4">
                      <div className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : commentsError ? (
                    <div className="text-center py-4">
                      <p className="text-destructive text-sm">{commentsError}</p>
                      <button
                        onClick={handleCommentToggle}
                        className="mt-2 text-xs text-primary hover:underline"
                      >
                        Retry
                      </button>
                    </div>
                  ) : comments.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-muted-foreground text-sm">No comments yet. Be the first!</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {comments.map((comment) => (
                        <div key={comment.id} className="flex gap-2 sm:gap-3">
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-muted overflow-hidden">
                              <Image
                                src={comment.user.profileImage}
                                alt={comment.user.name}
                                width={32}
                                height={32}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs sm:text-sm font-medium text-foreground">
                                {comment.user.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(comment.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-foreground line-clamp-2">
                              {comment.content}
                            </p>
                            <div className="flex items-center gap-3 mt-1">
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleCommentLike(comment.id)}
                                className={`flex items-center gap-1 text-xs transition-colors ${
                                  comment.liked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                                }`}
                                aria-label={`Like comment by ${comment.user.name}`}
                              >
                                <span>{comment.liked ? '❤️' : '🤍'}</span>
                                <span>{comment.likeCount}</span>
                              </motion.button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Comment Input */}
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        placeholder="Write a comment..."
                        maxLength={MAX_COMMENT_LENGTH}
                        disabled={commentSubmitting}
                        className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleCommentSubmit}
                        disabled={!commentInput.trim() || commentSubmitting}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {commentSubmitting ? '...' : 'Send'}
                      </motion.button>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground">
                        {commentInput.length}/{MAX_COMMENT_LENGTH}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </GlowingBorder>
    </motion.div>
  );
}
