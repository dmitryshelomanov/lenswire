import type { Metadata } from 'next';
import Link from 'next/link';
import { HowFork, HowPipeline, HowProtocols } from '@/components/HowItWorks';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
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
        <section className="border-b border-white/10 bg-gradient-to-br from-[#03045E] via-[#0B3D91] to-[#0077B6]">
          <div className="mx-auto max-w-5xl px-5 pb-14 pt-14 sm:pb-20 sm:pt-20">
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

            <div className="mt-12 sm:mt-14">
              <HowPipeline />
            </div>
            <p className="mt-10 text-center text-sm tracking-wide text-white/45 sm:mt-12">
              {howItWorks.platformNote}
            </p>
          </div>
        </section>

        <section className="border-b border-line bg-wash">
          <div className="mx-auto max-w-5xl px-5 pt-16 sm:pt-24">
            <HowFork />
          </div>

          <div className="mx-auto max-w-5xl px-5 pt-16 sm:pt-24">
            <HowProtocols />
          </div>
        </section>

        <section className="bg-navy">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
            <h2 className="font-display text-4xl tracking-tight text-white sm:text-5xl">
              {howItWorks.ctaTitle}
            </h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/75 sm:text-xl">
              {howItWorks.ctaBody}
            </p>
            <div className="mt-8">
              <a
                href={REPO_URL}
                className="inline-flex h-12 items-center rounded-lg bg-white px-6 text-base font-medium text-ink no-underline transition hover:bg-white/90"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
