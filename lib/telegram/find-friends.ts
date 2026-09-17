import type { Context } from "grammy";
import { isTelegramCommandText } from "@/lib/snap-code";
import { matchFriendsByNamePartial } from "@/lib/friends-search";
import { listSnappyFriendsForUser } from "@/lib/snappy-friends";
import { getLinkedAccountByTelegramUserId } from "./account";
import {
  beginFindFriendsBrowse,
  getFindFriendsState,
  isAwaitingFindFriends,
  setFindFriendsPagination,
} from "./chat-state";
import { sanitizeTelegramError } from "./errors";
import {
  FIND_FRIENDS_SNAPS_PAGE_SIZE,
  listFriendSnapsForTelegramPage,
} from "./find-friends-snaps";
import { getTelegramIdentity } from "./identity";
import {
  FIND_FRIENDS_LOOKUP_ERROR_MESSAGE,
  FIND_FRIENDS_NOT_FOUND_MESSAGE,
  FIND_FRIENDS_NOT_LINKED_MESSAGE,
  FIND_FRIENDS_NO_FRIENDS_MESSAGE,
  formatFindFriendsAllDone,
  formatFindFriendsIntro,
  formatFindFriendsMoreHint,
  formatFindFriendsMultipleMatches,
  formatFindFriendsNoSnaps,
  formatFindFriendsPageIntro,
  formatFindFriendsShowingRange,
} from "./messages";

export async function beginFindFriendsFlow(ctx: Context): Promise<void> {
  const identity = getTelegramIdentity(ctx);
  if (!identity?.chatId) {
    await ctx.reply(FIND_FRIENDS_LOOKUP_ERROR_MESSAGE);
    return;
  }

  const linked = await getLinkedAccountByTelegramUserId(identity.telegramUserId);
  if (!linked) {
    await ctx.reply(FIND_FRIENDS_NOT_LINKED_MESSAGE);
    return;
  }

  let friends;
  try {
    friends = await listSnappyFriendsForUser(linked.userId);
  } catch (error) {
    console.error(
      "[TELEGRAM] Find friends list failed:",
      sanitizeTelegramError(error),
    );
    await ctx.reply(FIND_FRIENDS_LOOKUP_ERROR_MESSAGE);
    return;
  }

  if (friends.length === 0) {
    await ctx.reply(FIND_FRIENDS_NO_FRIENDS_MESSAGE);
    return;
  }

  await beginFindFriendsBrowse(identity.chatId);
  await ctx.reply(formatFindFriendsIntro(friends.map((friend) => friend.name)));
}

export async function handleFindFriendsNameMessage(
  ctx: Context,
): Promise<boolean> {
  const identity = getTelegramIdentity(ctx);
  const chatId = identity?.chatId;
  const text = ctx.message?.text;

  if (!chatId || !text || isTelegramCommandText(text)) {
    return false;
  }

  const awaiting = await isAwaitingFindFriends(chatId);
  if (!awaiting) {
    return false;
  }

  const linked = await getLinkedAccountByTelegramUserId(
    identity.telegramUserId,
  );
  if (!linked) {
    await ctx.reply(FIND_FRIENDS_NOT_LINKED_MESSAGE);
    return true;
  }

  let friends;
  try {
    friends = await listSnappyFriendsForUser(linked.userId);
  } catch (error) {
    console.error(
      "[TELEGRAM] Find friends lookup failed:",
      sanitizeTelegramError(error),
    );
    await ctx.reply(FIND_FRIENDS_LOOKUP_ERROR_MESSAGE);
    return true;
  }

  const matches = matchFriendsByNamePartial(friends, text);
  if (matches.length === 0) {
    await ctx.reply(FIND_FRIENDS_NOT_FOUND_MESSAGE);
    return true;
  }

  if (matches.length > 1) {
    await ctx.reply(formatFindFriendsMultipleMatches(matches));
    return true;
  }

  const friend = matches[0];
  const session = await getFindFriendsState(chatId);
  const sameFriend = session?.friendId === friend.id;
  const offset = sameFriend ? (session?.offset ?? 0) : 0;

  let snaps;
  try {
    snaps = await listFriendSnapsForTelegramPage({
      friendUserId: friend.id,
      offset,
      limit: FIND_FRIENDS_SNAPS_PAGE_SIZE,
    });
  } catch (error) {
    console.error(
      "[TELEGRAM] Friend snaps query failed:",
      sanitizeTelegramError(error),
    );
    await ctx.reply(FIND_FRIENDS_LOOKUP_ERROR_MESSAGE);
    return true;
  }

  if (snaps.length === 0) {
    if (offset > 0) {
      await ctx.reply(formatFindFriendsAllDone(friend.name));
    } else {
      await ctx.reply(formatFindFriendsNoSnaps(friend.name));
    }
    await setFindFriendsPagination(chatId, friend.id, offset);
    return true;
  }

  const rangeStart = offset + 1;
  const rangeEnd = offset + snaps.length;
  const footer = [
    formatFindFriendsShowingRange(rangeStart, rangeEnd),
    formatFindFriendsMoreHint(),
  ].join("\n");

  if (offset === 0) {
    await ctx.reply(formatFindFriendsPageIntro(friend.name));
  }

  try {
    if (snaps.length === 1) {
      const snap = snaps[0];
      const caption = snap.caption?.trim()
        ? `${snap.caption.trim()}\n\n${footer}`
        : footer;
      await ctx.replyWithPhoto(snap.imageUrl, { caption });
    } else {
      await ctx.replyWithMediaGroup(
        snaps.map((snap, index) => ({
          type: "photo" as const,
          media: snap.imageUrl,
          caption:
            index === snaps.length - 1
              ? footer
              : snap.caption?.trim() || undefined,
        })),
      );
    }
  } catch (error) {
    console.error(
      "[TELEGRAM] Find friends media send failed:",
      sanitizeTelegramError(error),
    );
    for (const snap of snaps) {
      try {
        await ctx.replyWithPhoto(snap.imageUrl, {
          caption: snap.caption?.trim() || undefined,
        });
      } catch (innerError) {
        console.error(
          "[TELEGRAM] Find friends photo fallback failed:",
          sanitizeTelegramError(innerError),
        );
      }
    }
    await ctx.reply(footer);
  }

  await setFindFriendsPagination(
    chatId,
    friend.id,
    offset + snaps.length,
  );

  return true;
}
