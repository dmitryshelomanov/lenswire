import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFoundPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-2xl flex-col px-5 py-20 sm:py-28">
        <p className="text-sm font-medium tracking-wide text-navy">404</p>
        <h1 className="mt-3 font-display text-5xl tracking-tight">Page not found</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          That URL is not part of the Lenswire site.
        </p>
        <div className="mt-9">
          <Link
            href="/"
            className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-base font-medium text-white no-underline transition hover:bg-navy"
          >
            Back to Lenswire
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
