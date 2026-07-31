import type { Metadata } from 'next';
import Link from 'next/link';
import { HowFork, HowPipeline, HowProtocols } from '@/components/HowItWorks';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { withBasePath } from '@/lib/basePath';
import { howItWorks, REPO_URL } from '@/lib/content';

export const metadata: Metadata = {
  title: 'How the pipe works',
  description:
    'How Lenswire captures traffic: MITM when HTTPS can be decrypted, sealed byte tunnel when it can’t. Payload only on the MITM path.',
  alternates: {
    canonical: '/how/',
  },
  openGraph: {
    title: 'How the pipe works · Lenswire',
    description:
      'Local VPN → canMitm gate. Decrypt and inspect when we can; otherwise runPassthrough — sealed tunnel, no HTTP payload in the UI.',
    url: '/how/',
  },
};

export default function HowPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-[#03045E] via-[#0B3D91] to-[#0077B6]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(72,202,228,0.28),transparent_55%)]" />
          <div className="relative mx-auto max-w-5xl px-5 pb-16 pt-16 sm:pb-20 sm:pt-24">
            <p className="mb-8">
              <Link
                href="/"
                className="text-sm text-white/55 no-underline transition hover:text-white/90"
              >
                ← Lenswire
              </Link>
            </p>
            <h1 className="max-w-3xl font-display text-[clamp(2.75rem,8vw,4.75rem)] font-medium leading-[1.05] tracking-tight text-white">
              {howItWorks.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75 sm:text-xl">
              {howItWorks.lead}
            </p>

            <div className="mt-14 sm:mt-16">
              <HowPipeline />
            </div>
            <p className="mt-10 text-center text-sm tracking-wide text-white/45 sm:mt-12">
              {howItWorks.platformNote}
            </p>
          </div>
        </section>

        <section className="relative overflow-hidden border-b border-line bg-wash">
          <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-cyan/10 blur-3xl" />
          <div className="pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-navy/10 blur-3xl" />

          <div className="relative mx-auto max-w-5xl px-5 pt-20 sm:pt-28">
            <HowFork />
          </div>

          <div className="relative mx-auto max-w-5xl px-5 pt-20 sm:pt-28">
            <HowProtocols />
          </div>

          <div className="relative mx-auto max-w-5xl px-5 pb-20 pt-16 sm:pb-28 sm:pt-20">
            <div className="rounded-3xl bg-gradient-to-br from-[#e8f4fb] via-white to-white px-7 py-12 ring-1 ring-line sm:px-14 sm:py-16">
              <img
                src={withBasePath('/favicon.png')}
                alt=""
                width={56}
                height={56}
                className="rounded-xl shadow-sm ring-1 ring-black/5"
              />
              <h2 className="mt-6 font-display text-4xl tracking-tight sm:text-5xl">
                {howItWorks.ctaTitle}
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
                {howItWorks.ctaBody}
              </p>
              <div className="mt-8">
                <a
                  href={REPO_URL}
                  className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-base font-medium text-white no-underline transition hover:bg-navy"
                >
                  View on GitHub
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
