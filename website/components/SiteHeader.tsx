import Link from 'next/link';
import { withBasePath } from '@/lib/basePath';
import { REPO_URL } from '@/lib/content';

const nav = [
  { href: '/#features', label: 'Features' },
  { href: '/how/', label: 'How' },
  { href: '/#get-started', label: 'Get started' },
  { href: '/#compare', label: 'Compare' },
  { href: '/#screens', label: 'Screens' },
  { href: '/privacy/', label: 'Privacy' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-5">
        <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2.5 no-underline">
          <img
            src={withBasePath('/favicon.png')}
            alt=""
            width={32}
            height={32}
            className="rounded-md"
          />
          <span className="font-display text-xl tracking-tight">Lenswire</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex md:gap-2" aria-label="Primary">
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
            href={REPO_URL}
            className="ml-1 inline-flex rounded-full bg-ink px-4 py-2 text-base font-medium text-white no-underline transition hover:bg-navy"
          >
            GitHub
          </a>
        </nav>

        <details className="group relative md:hidden">
          <summary
            className="inline-flex h-10 w-10 list-none items-center justify-center rounded-full text-ink transition hover:bg-ink/5 [&::-webkit-details-marker]:hidden"
            aria-label="Open menu"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className="group-open:hidden"
            >
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className="hidden group-open:block"
            >
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </summary>
          <nav
            className="absolute right-0 top-[calc(100%+0.5rem)] w-[min(18rem,calc(100vw-2.5rem))] rounded-2xl border border-line bg-paper p-3 shadow-[0_18px_40px_-20px_rgba(11,18,32,0.35)]"
            aria-label="Mobile"
          >
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-xl px-3 py-3 text-lg text-ink no-underline transition hover:bg-wash"
              >
                {item.label}
              </Link>
            ))}
            <a
              href={REPO_URL}
              className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-full bg-ink px-4 text-base font-medium text-white no-underline transition hover:bg-navy"
            >
              GitHub
            </a>
          </nav>
        </details>
      </div>
    </header>
  );
}
