import Link from 'next/link';
import { withBasePath } from '@/lib/basePath';

const nav = [
  { href: '/#features', label: 'Features' },
  { href: '/#screens', label: 'Screens' },
  { href: '/privacy/', label: 'Privacy' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <img
            src={withBasePath('/favicon.png')}
            alt=""
            width={32}
            height={32}
            className="rounded-md"
          />
          <span className="font-display text-xl tracking-tight">Lenswire</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
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
            className="ml-1 hidden rounded-full bg-ink px-4 py-2 text-base font-medium text-white no-underline transition hover:bg-navy sm:inline-flex"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
