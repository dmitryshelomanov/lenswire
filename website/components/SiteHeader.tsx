'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { withBasePath } from '@/lib/basePath';

const nav = [
  { href: '/#features', label: 'Features' },
  { href: '/how/', label: 'How' },
  { href: '/#compare', label: 'Compare' },
  { href: '/#screens', label: 'Screens' },
  { href: '/privacy/', label: 'Privacy' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-5">
        <Link
          href="/"
          className="flex min-w-0 shrink-0 items-center gap-2.5 no-underline"
          onClick={() => setOpen(false)}
        >
          <img
            src={withBasePath('/favicon.png')}
            alt=""
            width={32}
            height={32}
            className="rounded-md"
          />
          <span className="font-display text-xl tracking-tight">Lenswire</span>
        </Link>

        {/* Desktop */}
        <nav className="hidden items-center gap-1 md:flex md:gap-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-2 text-base text-muted no-underline transition hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          <a
            href="https://github.com/dmitryshelomanov/lenswire"
            className="ml-1 inline-flex rounded-full bg-ink px-4 py-2 text-base font-medium text-white no-underline transition hover:bg-navy"
          >
            GitHub
          </a>
        </nav>

        {/* Mobile toggle */}
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink transition hover:bg-ink/5 md:hidden"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            {open ? (
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile panel */}
      {open ? (
        <div id={menuId} className="border-t border-line/80 bg-paper md:hidden">
          <nav className="mx-auto flex max-w-5xl flex-col px-5 py-3">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl px-3 py-3 text-lg text-ink no-underline transition hover:bg-wash"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <a
              href="https://github.com/dmitryshelomanov/lenswire"
              className="mt-2 mb-1 inline-flex h-12 items-center justify-center rounded-full bg-ink px-4 text-base font-medium text-white no-underline transition hover:bg-navy"
              onClick={() => setOpen(false)}
            >
              GitHub
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
