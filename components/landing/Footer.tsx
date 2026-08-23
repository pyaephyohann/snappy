"use client";

import Link from "next/link";
import Image from "next/image";

const LINKS = {
  product: [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
  ],
  account: [
    { label: "Login", href: "/login" },
    { label: "Get Started", href: "/login" },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-border/50 bg-card/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-8">
          {/* Brand */}
          <div className="sm:col-span-1">
            <Link
              href="/"
              className="inline-flex items-center gap-2 group focus:outline-none focus:ring-2 focus:ring-ring rounded-lg px-2 py-1 -ml-2"
              aria-label="Snappy Home"
            >
              <Image
                src="/logo.png"
                alt=""
                width={32}
                height={32}
                className="w-8 h-8 group-hover:scale-110 transition-transform duration-200"
              />
              <span className="text-xl font-bold text-primary caveat-font">
                Snappy
              </span>
            </Link>
            <p className="mt-4 text-sm text-muted-foreground max-w-xs leading-relaxed">
              Share moments. Stay connected.
            </p>
          </div>

          {/* Product links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Product
            </h3>
            <ul className="space-y-3">
              {LINKS.product.map((link) => (
                <li key={link.href + link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Account links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Account
            </h3>
            <ul className="space-y-3">
              {LINKS.account.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Snappy. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Made with ❤️ for friends
          </p>
        </div>
      </div>
    </footer>
  );
}
