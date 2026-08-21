"use client";

import { motion } from "framer-motion";
import Image from "next/image";

const FRIENDS = [
  { name: "Alex", avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Alex&backgroundColor=c0aede", online: true },
  { name: "Maya", avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Maya&backgroundColor=ffd5dc", online: true },
  { name: "Sam", avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Sam&backgroundColor=b6e3f4", online: false },
  { name: "Jordan", avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Jordan&backgroundColor=d1d4f9", online: true },
  { name: "Riley", avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Riley&backgroundColor=c0aede", online: false },
  { name: "Casey", avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Casey&backgroundColor=ffd5dc", online: true },
];

const SNAP_PHOTOS = [
  { img: "https://picsum.photos/seed/preview1/600/400", user: "Alex", caption: "Morning vibes ☀️", reactions: ["❤️", "🔥", "😮"] },
  { img: "https://picsum.photos/seed/preview2/600/400", user: "Maya", caption: "Weekend adventure!", reactions: ["👍", "❤️"] },
  { img: "https://picsum.photos/seed/preview3/600/400", user: "Jordan", caption: "Good times with friends", reactions: ["😂", "❤️", "👍"] },
];

const COMMENTS = [
  { user: "Sam", text: "Love this! 😍", avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Sam&backgroundColor=b6e3f4" },
  { user: "Riley", text: "We need to do this again!", avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Riley&backgroundColor=c0aede" },
];

export default function AppPreview() {
  return (
    <section className="relative py-20 sm:py-28 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 sm:mb-16"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            A simpler way to{" "}
            <span className="text-primary">share your world.</span>
          </h2>
          <p className="mt-4 sm:mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
            A clean, focused experience built around what matters — your friends and their moments.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative max-w-5xl mx-auto"
        >
          {/* Glow behind */}
          <div className="absolute inset-0 -m-12 bg-primary/5 rounded-3xl blur-3xl" aria-hidden="true" />

          {/* Main preview card */}
          <div className="relative bg-card border border-border/60 rounded-3xl shadow-2xl shadow-black/30 overflow-hidden">
            <div className="grid lg:grid-cols-[280px_1fr] min-h-[500px]">
              {/* Sidebar — friends list */}
              <div className="border-r border-border/40 p-5 hidden lg:block">
                <div className="flex items-center gap-2.5 mb-6">
                  <Image
                    src="/logo.png"
                    alt=""
                    width={28}
                    height={28}
                    className="w-7 h-7"
                  />
                  <span className="text-lg font-bold text-primary caveat-font">
                    Snappy
                  </span>
                </div>

                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Friends
                </h3>

                <div className="space-y-1">
                  {FRIENDS.map((friend, i) => (
                    <motion.div
                      key={friend.name}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 + i * 0.05 }}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                        i === 0
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-white/5 text-foreground"
                      }`}
                    >
                      <div className="relative shrink-0">
                        <Image
                          src={friend.avatar}
                          alt=""
                          width={32}
                          height={32}
                          className="w-8 h-8 rounded-full"
                        />
                        {friend.online && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-card" />
                        )}
                      </div>
                      <span className="text-sm font-medium truncate">
                        {friend.name}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Main content — snap feed */}
              <div className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-foreground">
                    Your Feed
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                    <span className="text-xs text-muted-foreground">
                      {FRIENDS.filter((f) => f.online).length} friends online
                    </span>
                  </div>
                </div>

                <div className="space-y-5">
                  {SNAP_PHOTOS.map((snap, i) => (
                    <motion.div
                      key={snap.img}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.4 + i * 0.1 }}
                      className="bg-secondary/20 border border-border/30 rounded-2xl overflow-hidden"
                    >
                      {/* Snap header */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <Image
                          src={FRIENDS[i].avatar}
                          alt=""
                          width={36}
                          height={36}
                          className="w-9 h-9 rounded-full"
                        />
                        <div>
                          <span className="text-sm font-medium text-foreground block">
                            {snap.user}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {i === 0 ? "2 min ago" : i === 1 ? "1 hour ago" : "Yesterday"}
                          </span>
                        </div>
                      </div>

                      {/* Snap image */}
                      <div className="relative aspect-[3/2]">
                        <Image
                          src={snap.img}
                          alt={snap.caption}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, 600px"
                        />
                      </div>

                      {/* Snap footer */}
                      <div className="px-4 py-3">
                        <p className="text-sm text-foreground mb-2">{snap.caption}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            {snap.reactions.map((emoji, j) => (
                              <span key={j} className="text-sm">
                                {emoji}
                              </span>
                            ))}
                            <span className="text-xs text-muted-foreground ml-1">
                              {snap.reactions.length}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            <span className="text-xs">{i === 0 ? "2" : "1"}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Comment preview */}
                <div className="mt-5 pt-5 border-t border-border/30">
                  <div className="space-y-3">
                    {COMMENTS.map((comment, i) => (
                      <motion.div
                        key={comment.text}
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.8 + i * 0.1 }}
                        className="flex items-start gap-2.5"
                      >
                        <Image
                          src={comment.avatar}
                          alt=""
                          width={28}
                          height={28}
                          className="w-7 h-7 rounded-full mt-0.5"
                        />
                        <div className="bg-secondary/20 rounded-xl px-3 py-2">
                          <span className="text-xs font-medium text-foreground">
                            {comment.user}
                          </span>
                          <p className="text-xs text-muted-foreground">{comment.text}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
