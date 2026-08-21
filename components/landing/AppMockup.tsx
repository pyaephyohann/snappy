"use client";

import { motion } from "framer-motion";
import Image from "next/image";

const FRIENDS = [
  { name: "Alex", avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Alex&backgroundColor=c0aede" },
  { name: "Maya", avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Maya&backgroundColor=ffd5dc" },
  { name: "Sam", avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Sam&backgroundColor=b6e3f4" },
  { name: "Jordan", avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Jordan&backgroundColor=d1d4f9" },
  { name: "Riley", avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Riley&backgroundColor=c0aede" },
];

const SNAP_IMAGES = [
  "https://picsum.photos/seed/snap1/400/400",
  "https://picsum.photos/seed/snap2/400/400",
  "https://picsum.photos/seed/snap3/400/400",
];

const FLOATING_REACTIONS = ["❤️", "😂", "👍", "😮"];

function NotificationDot() {
  return (
    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-primary rounded-full border-2 border-card">
      <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-40" />
    </span>
  );
}

export default function AppMockup() {
  return (
    <div className="relative w-full max-w-md lg:max-w-lg">
      {/* Main phone frame */}
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="relative"
      >
        {/* Glow behind phone */}
        <div
          className="absolute inset-0 -m-8 bg-primary/10 rounded-3xl blur-3xl"
          aria-hidden="true"
        />

        {/* Phone frame */}
        <div className="relative bg-card rounded-3xl border border-border/60 shadow-2xl shadow-black/40 overflow-hidden">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-4 pb-2">
            <span className="text-xs text-muted-foreground font-medium">9:41</span>
            <div className="w-20 h-5 bg-foreground rounded-full" />
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-foreground" viewBox="0 0 24 24" fill="currentColor">
                <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" />
              </svg>
              <svg className="w-3.5 h-3.5 text-foreground" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z" />
              </svg>
            </div>
          </div>

          {/* App header */}
          <div className="px-5 py-3 flex items-center gap-3 border-b border-border/40">
            <div className="relative">
              <Image
                src="/logo.png"
                alt=""
                width={32}
                height={32}
                className="w-8 h-8"
              />
            </div>
            <span className="text-lg font-bold text-primary caveat-font">
              Snappy
            </span>
          </div>

          {/* Friend avatars row */}
          <div className="px-5 py-3 border-b border-border/40">
            <div className="flex items-center gap-3 overflow-x-auto">
              {FRIENDS.map((friend, i) => (
                <motion.div
                  key={friend.name}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.08, duration: 0.4 }}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0"
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full p-[2px] bg-gradient-to-br from-primary to-purple-400">
                      <div className="w-full h-full rounded-full overflow-hidden bg-card p-[1px]">
                        <Image
                          src={friend.avatar}
                          alt={friend.name}
                          width={44}
                          height={44}
                          className="w-full h-full object-cover rounded-full"
                        />
                      </div>
                    </div>
                    {i === 0 && <NotificationDot />}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium truncate w-12 text-center">
                    {friend.name}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Snap cards */}
          <div className="p-4 space-y-3">
            {SNAP_IMAGES.map((img, i) => (
              <motion.div
                key={img}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 + i * 0.15, duration: 0.5 }}
                className="bg-secondary/30 rounded-2xl overflow-hidden border border-border/30"
              >
                <div className="relative aspect-[4/3]">
                  <Image
                    src={img}
                    alt={`Snap from ${FRIENDS[i].name}`}
                    fill
                    className="object-cover"
                    sizes="320px"
                  />
                </div>
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Image
                      src={FRIENDS[i].avatar}
                      alt=""
                      width={20}
                      height={20}
                      className="w-5 h-5 rounded-full"
                    />
                    <span className="text-xs font-medium text-foreground">
                      {FRIENDS[i].name}
                    </span>
                  </div>
                  {i === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Beautiful day today! ☀️
                    </p>
                  )}
                  {i === 1 && (
                    <p className="text-xs text-muted-foreground">
                      Coffee time ☕
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1">
                      {FLOATING_REACTIONS.slice(0, i + 2).map((emoji, j) => (
                        <motion.span
                          key={j}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 1.2 + i * 0.15 + j * 0.05, type: "spring", stiffness: 400 }}
                          className="text-sm"
                        >
                          {emoji}
                        </motion.span>
                      ))}
                    </div>
                    {i < 2 && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <span className="text-[10px]">{i === 0 ? "3" : "1"}</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Bottom nav */}
          <div className="flex items-center justify-around py-3 border-t border-border/40 bg-card/50">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <div className="relative">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center -mt-4 shadow-lg shadow-primary/30">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        </div>
      </motion.div>

      {/* Floating decorative elements */}
      <motion.div
        animate={{ y: [0, -12, 0], rotate: [0, 5, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute -top-4 -left-6 sm:-left-12 bg-card border border-border/60 rounded-2xl px-3 py-2 shadow-xl"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">📸</span>
          <span className="text-xs font-medium text-foreground">New snap!</span>
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, -10, 0], rotate: [0, -3, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute -bottom-2 -right-4 sm:-right-10 bg-card border border-border/60 rounded-2xl px-3 py-2 shadow-xl"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">❤️</span>
          <span className="text-xs font-medium text-foreground">3 reactions</span>
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 3 }}
        className="absolute top-1/3 -right-6 sm:-right-14 bg-card border border-border/60 rounded-2xl px-3 py-2 shadow-xl hidden sm:block"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <span className="text-xs font-medium text-foreground">2 comments</span>
        </div>
      </motion.div>
    </div>
  );
}
