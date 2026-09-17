export const REACTION_TYPES = [
  'LIKE',
  'LOVE',
  'HAHA',
  'WOW',
  'SAD',
  'ANGRY',
] as const;

export type SnapReactionType = (typeof REACTION_TYPES)[number];

export const REACTION_EMOJIS: Record<SnapReactionType, string> = {
  LIKE: '👍',
  LOVE: '❤️',
  HAHA: '😂',
  WOW: '😮',
  SAD: '😢',
  ANGRY: '😡',
};

export const MAX_COMMENT_LENGTH = 500;
