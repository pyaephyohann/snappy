'use client';

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
// Temporarily disabled for production: Share
/*
import {
  FacebookShareButton,
  FacebookIcon,
  WhatsappShareButton,
  WhatsappIcon,
  XShareButton,
  XIcon,
  TelegramShareButton,
  TelegramIcon,
} from 'react-share';
*/
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

// Temporarily disabled for production: Comments interface
/*
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
*/

// Temporarily disabled for production: Reaction types & constants
/*
const REACTION_TYPES = ['LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'ANGRY'] as const;

const REACTION_EMOJIS: Record<string, string> = {
  LIKE: '👍',
  LOVE: '❤️',
  HAHA: '😂',
  WOW: '😮',
  SAD: '😢',
  ANGRY: '😡',
};

const MAX_COMMENT_LENGTH = 500;
*/

export default function SnapCard({
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

  // Temporarily disabled for production: Emoji Picker, Comments, Share states & handlers
  /*
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  */

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

  // Temporarily disabled for production: Reaction, Comment, Share handlers
  /*
  const handleReaction = async (type: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    try {
      const response = await fetch(`/api/snaps/${_id}/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });

      if (response.ok) {
        const data = await response.json();
        setUserReaction(data.reaction?.type || null);
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
        const response = await fetch(`/api/snaps/${_id}/comments`);
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
      const response = await fetch(`/api/snaps/${_id}/comments`, {
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

  const getSnapUrl = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/friends/${encodeURIComponent(friendName)}`;
    }
    return '';
  };

  const getShareText = () => {
    return caption || 'Check out this Snap on Snappy!';
  };

  const handleCopyLink = async () => {
    const url = getSnapUrl();
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${friendName}'s Snap`,
          text: getShareText(),
          url: getSnapUrl(),
        });
        setShowShareMenu(false);
      } catch (error) {
        console.error('Native share failed:', error);
      }
    }
  };
  */

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

          {/* Caption Area */}
          <div className="p-2 sm:p-4 h-16 sm:h-20 overflow-y-auto overflow-x-hidden caption-scroll">
            {caption && (
              <p className="text-foreground text-xs sm:text-sm mb-1 sm:mb-2">{caption}</p>
            )}
            {createdAt && (
              <p className="text-muted-foreground text-xs">{formatDate(createdAt)}</p>
            )}
          </div>

          {/* Social Actions - Temporarily disabled for production */}
          {/*
          <div className="px-2 sm:px-4 pb-3 sm:pb-4">
            <div className="flex items-center gap-2 sm:gap-3 border-t border-border pt-3">
              <div className="relative flex-shrink-0">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowReactionPicker(!showReactionPicker);
                  }}
                  className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="React to snap"
                >
                  <span className="text-xl sm:text-2xl">
                    {userReaction ? REACTION_EMOJIS[userReaction] : '👍'}
                  </span>
                </motion.button>

                <AnimatePresence>
                  {showReactionPicker && (
                    <>
                      <div
                        className="fixed inset-0 z-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowReactionPicker(false);
                        }}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full left-0 mb-2 z-50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="bg-card border border-border rounded-lg shadow-xl p-2 flex gap-1">
                          {REACTION_TYPES.map((type) => (
                            <motion.button
                              key={type}
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => handleReaction(type, e)}
                              className="p-2 hover:bg-secondary/50 rounded-lg transition-colors text-2xl"
                              aria-label={type.toLowerCase()}
                              title={type}
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

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCommentToggle();
                }}
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors focus:outline-none focus:ring-2 focus:ring-ring flex-shrink-0"
                aria-label="View comments"
              >
                <svg
                  className="w-5 h-5 sm:w-6 sm:h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                {comments.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {comments.length}
                  </span>
                )}
              </motion.button>

              <div className="relative flex-shrink-0">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Share snap"
                >
                  <svg
                    className="w-5 h-5 sm:w-6 sm:h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                    />
                  </svg>
                </motion.button>

                <AnimatePresence>
                  {showShareMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-50"
                        onClick={() => setShowShareMenu(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full right-0 mb-2 z-50"
                      >
                        <div className="bg-card border border-border rounded-lg shadow-xl p-3 min-w-[200px]">
                          <div className="flex flex-col gap-2">
                            {typeof navigator !== 'undefined' && 'share' in navigator && (
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={handleNativeShare}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors text-sm"
                                aria-label="Share using native share"
                              >
                                <span className="text-lg">📱</span>
                                <span>Share</span>
                              </motion.button>
                            )}
                            
                            <FacebookShareButton
                              url={getSnapUrl()}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors text-sm"
                              aria-label="Share on Facebook"
                            >
                              <FacebookIcon size={20} round />
                              <span>Facebook</span>
                            </FacebookShareButton>
                            
                            <WhatsappShareButton
                              url={getSnapUrl()}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors text-sm"
                              aria-label="Share on WhatsApp"
                            >
                              <WhatsappIcon size={20} round />
                              <span>WhatsApp</span>
                            </WhatsappShareButton>
                            
                            <XShareButton
                              url={getSnapUrl()}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors text-sm"
                              aria-label="Share on X"
                            >
                              <XIcon size={20} round />
                              <span>X</span>
                            </XShareButton>
                            
                            <TelegramShareButton
                              url={getSnapUrl()}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors text-sm"
                              aria-label="Share on Telegram"
                            >
                              <TelegramIcon size={20} round />
                              <span>Telegram</span>
                            </TelegramShareButton>
                            
                            <div className="border-t border-border pt-2 mt-1">
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={handleCopyLink}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors text-sm w-full"
                                aria-label="Copy link"
                              >
                                <span className="text-lg">🔗</span>
                                <span>{linkCopied ? 'Link copied!' : 'Copy link'}</span>
                              </motion.button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

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
          */}
        </div>
      </GlowingBorder>
    </motion.div>
  );
}

