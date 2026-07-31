'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { withBasePath } from '@/lib/basePath';
import { REPO_URL } from '@/lib/content';

const nav = [
  { href: '/#features', label: 'Features' },
  { href: '/how/', label: 'How' },
  { href: '/#compare', label: 'Compare' },
  { href: '/#screens', label: 'Screens' },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header
      className={`sticky top-0 z-40 border-b border-line transition-colors duration-200 ${
        scrolled || menuOpen ? 'bg-paper' : 'bg-paper/90 backdrop-blur-md'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-5">
        <Link
          href="/"
          className="flex min-w-0 shrink-0 items-center gap-2.5 no-underline"
          onClick={() => setMenuOpen(false)}
        >
          <img
            src={withBasePath('/favicon.png')}
            alt=""
            width={32}
            height={32}
            className="rounded-md"
          />
          <span className="font-display text-[1.35rem] font-medium tracking-[-0.03em] text-ink">
            Lenswire
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[0.95rem] text-muted no-underline transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/#get-started"
            className="text-[0.95rem] text-muted no-underline transition-colors hover:text-ink"
          >
            Get started
          </Link>
          <a
            href={REPO_URL}
            className="inline-flex h-10 items-center rounded-lg bg-ink px-4 text-[0.95rem] font-medium text-white no-underline transition hover:bg-navy"
          >
            GitHub
          </a>
        </nav>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink transition hover:bg-ink/5 md:hidden"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {menuOpen ? (
        <nav className="border-t border-line bg-paper md:hidden" aria-label="Mobile">
          <div className="mx-auto flex max-w-5xl flex-col px-5 py-3">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="border-b border-line/70 py-4 text-lg text-ink no-underline"
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/#get-started"
              className="border-b border-line/70 py-4 text-lg text-ink no-underline"
              onClick={() => setMenuOpen(false)}
            >
              Get started
            </Link>
            <a
              href={REPO_URL}
              className="mt-4 mb-2 inline-flex h-12 w-full items-center justify-center rounded-lg bg-ink px-4 text-base font-medium text-white no-underline transition hover:bg-navy"
              onClick={() => setMenuOpen(false)}
            >
              GitHub
            </a>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
