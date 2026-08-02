import { CompareCell } from '@/components/CompareCell';
import { DeviceFrame } from '@/components/DeviceFrame';
import { HeroVideo } from '@/components/HeroVideo';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { Spotlight } from '@/components/Spotlight';
import { withBasePath } from '@/lib/basePath';
import {
  comparison,
  faqs,
  features,
  getStarted,
  howTeaser,
  REPO_URL,
  screens,
  spotlights,
} from '@/lib/content';
import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero — brand + phone-sized video side-by-side on desktop */}
        <section className="relative overflow-hidden border-b border-line bg-gradient-to-br from-[#0B3D91] via-[#0077B6] to-[#48CAE4]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.22),transparent_55%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 lg:grid-cols-2 lg:gap-16 lg:py-28">
            <div className="text-center lg:text-left">
              <img
                src={withBasePath('/icon.png')}
                alt=""
                width={64}
                height={64}
                className="mx-auto rounded-2xl shadow-lg shadow-black/20 ring-1 ring-white/30 lg:mx-0"
              />
              <h1 className="mt-7 font-display text-[clamp(4.25rem,13vw,7rem)] font-medium leading-none tracking-tight text-white">
                Lenswire
              </h1>
              <p className="mt-6 font-display text-3xl leading-snug text-white/90 sm:text-4xl">
                Capture HTTP(S) traffic on your phone
              </p>
              <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-white/75 sm:text-xl lg:mx-0">
                Inspect, decrypt, and override network requests from your iOS and Android apps —
                local VPN MITM, no desktop required.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3 lg:justify-start">
                <a
                  href={getStarted.primaryHref}
                  className="inline-flex h-12 items-center rounded-lg bg-white px-6 text-base font-medium text-ink no-underline transition hover:bg-white/90"
                >
                  {getStarted.primaryLabel}
                </a>
                <a
                  href="#get-started"
                  className="inline-flex h-12 items-center rounded-lg border border-white/40 bg-white/10 px-6 text-base font-medium text-white no-underline backdrop-blur transition hover:bg-white/20"
                >
                  Get the app
                </a>
              </div>
              <p className="mt-5 text-sm text-white/60">iOS · Android · on-device · MIT</p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <HeroVideo />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-b border-line bg-wash">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
            <div className="max-w-2xl">
              <h2 className="font-display text-5xl tracking-tight sm:text-6xl">What you can do</h2>
              <p className="mt-5 text-xl leading-relaxed text-muted">
                Domain overviews, decrypted payloads, filters, overrides, and HAR export — readable
                on the phone.
              </p>
            </div>
            <ul className="mt-12 grid border-t border-line sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, i) => (
                <li
                  key={feature.title}
                  className="border-b border-line px-0 py-7 sm:px-6 sm:py-8 sm:odd:border-r lg:border-r lg:[&:nth-child(3n)]:border-r-0"
                >
                  <h3 className="text-xl font-semibold tracking-tight text-ink">
                    <span className="mr-2.5 font-display text-sm font-medium tracking-widest text-muted">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-muted sm:text-lg">
                    {feature.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Get started */}
        <section id="get-started" className="border-b border-line">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
            <div className="max-w-2xl">
              <h2 className="font-display text-5xl tracking-tight sm:text-6xl">
                {getStarted.title}
              </h2>
              <p className="mt-5 text-xl leading-relaxed text-muted sm:text-2xl">
                {getStarted.lead}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={getStarted.primaryHref}
                  className="inline-flex h-12 items-center rounded-lg bg-ink px-6 text-base font-medium text-white no-underline transition hover:bg-navy"
                >
                  {getStarted.primaryLabel}
                </a>
                <a
                  href={getStarted.secondaryHref}
                  className="inline-flex h-12 items-center rounded-lg border border-line bg-paper px-6 text-base font-medium text-ink no-underline transition hover:bg-wash"
                >
                  {getStarted.secondaryLabel}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* How teaser */}
        <section className="border-b border-line bg-wash">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
            <div className="max-w-2xl">
              <h2 className="font-display text-5xl tracking-tight sm:text-6xl">
                {howTeaser.title}
              </h2>
              <p className="mt-5 text-xl leading-relaxed text-muted sm:text-2xl">
                {howTeaser.lead}
              </p>
              <div className="mt-8">
                <Link
                  href="/how/"
                  className="inline-flex h-12 items-center rounded-lg bg-ink px-6 text-base font-medium text-white no-underline transition hover:bg-navy"
                >
                  {howTeaser.cta}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Spotlight rows */}
        <section className="mx-auto max-w-5xl space-y-16 px-0 py-16 sm:space-y-24 sm:px-5 sm:py-24">
          {spotlights.map((item) => (
            <Spotlight key={item.title} {...item} />
          ))}
        </section>

        {/* Compare */}
        <section id="compare" className="border-y border-line bg-wash">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
            <div className="max-w-2xl">
              <h2 className="font-display text-5xl tracking-tight sm:text-6xl">
                Compared to desktop proxies
              </h2>
              <p className="mt-5 text-xl text-muted">
                Charles, Proxyman, and mitmproxy are excellent on a Mac or PC. Lenswire is built for
                capture on the phone — VPN MITM, no laptop in the loop.
              </p>
            </div>

            <div className="compare-frame mt-12 overflow-hidden rounded-lg bg-paper ring-1 ring-line">
              <div className="overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <table className="w-full min-w-[42rem] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line">
                      <th
                        scope="col"
                        className="compare-sticky sticky left-0 z-10 bg-paper py-4 pl-5 pr-4 text-sm font-medium text-muted sm:pl-6 sm:pr-6"
                      >
                        <span className="sr-only">Criterion</span>
                      </th>
                      {comparison.tools.map((tool) => {
                        const highlight = tool === comparison.highlight;
                        return (
                          <th
                            key={tool}
                            scope="col"
                            className={`px-3 py-4 text-center text-base font-semibold tracking-tight sm:px-4 ${
                              highlight ? 'bg-navy/[0.06] text-navy' : 'text-ink'
                            }`}
                          >
                            {tool}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.rows.map((row, rowIndex) => {
                      const zebra = rowIndex % 2 === 1;
                      return (
                        <tr
                          key={row.criterion}
                          className={`border-b border-line/70 last:border-b-0 ${
                            zebra ? 'bg-wash/60' : 'bg-paper'
                          }`}
                        >
                          <th
                            scope="row"
                            className={`compare-sticky sticky left-0 z-10 max-w-[11rem] py-4 pl-5 pr-4 text-base font-medium tracking-tight text-ink sm:max-w-none sm:pl-6 sm:pr-6 ${
                              zebra ? 'bg-wash' : 'bg-paper'
                            }`}
                          >
                            {row.criterion}
                          </th>
                          {row.values.map((value, i) => {
                            const tool = comparison.tools[i];
                            const highlight = tool === comparison.highlight;
                            return (
                              <td
                                key={`${row.criterion}-${tool}`}
                                className={`px-3 py-4 text-center text-base sm:px-4 ${
                                  highlight ? 'bg-navy/[0.06]' : ''
                                }`}
                              >
                                <CompareCell value={value} emphasize={highlight} />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted">
              {comparison.footnote}
            </p>
          </div>
        </section>

        {/* Screens — horizontal scroll */}
        <section id="screens" className="pb-16 sm:pb-24">
          <div className="mx-auto max-w-5xl px-5 pt-16 sm:pt-24">
            <h2 className="font-display text-5xl tracking-tight sm:text-6xl">In the app</h2>
            <p className="mt-5 max-w-xl text-xl text-muted">
              Traffic list, domain drill-down, request/response detail, and overrides.
            </p>
          </div>
          <div className="mt-10 overflow-x-auto overscroll-x-contain scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul className="flex w-max snap-x snap-mandatory gap-6 px-5 sm:gap-8 sm:px-[max(1.25rem,calc((100vw-64rem)/2+1.25rem))]">
              {screens.map((screen) => (
                <li key={screen.src} className="w-[15.5rem] shrink-0 snap-start sm:w-[17rem]">
                  <figure>
                    <DeviceFrame src={screen.src} alt={screen.alt} />
                    <figcaption className="mt-5">
                      <p className="text-lg font-medium tracking-tight text-ink">{screen.title}</p>
                      <p className="mt-1.5 text-base leading-relaxed text-muted">{screen.body}</p>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-line bg-wash">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
            <h2 className="font-display text-5xl tracking-tight sm:text-6xl">FAQ</h2>
            <p className="mt-5 text-xl text-muted">Common questions.</p>
            <div className="mt-10 divide-y divide-line border-y border-line">
              {faqs.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 py-5 text-xl font-medium tracking-tight marker:content-none [&::-webkit-details-marker]:hidden">
                    <span>{item.q}</span>
                    <span
                      className="shrink-0 font-display text-lg text-muted group-open:hidden"
                      aria-hidden
                    >
                      +
                    </span>
                    <span
                      className="hidden shrink-0 font-display text-lg text-muted group-open:inline"
                      aria-hidden
                    >
                      −
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-5 text-lg leading-relaxed text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-navy">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
            <h2 className="font-display text-4xl tracking-tight text-white sm:text-5xl">
              Free and open source
            </h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/75 sm:text-xl">
              MIT licensed, no account, no cloud. Capture and decrypt stay on your device.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={getStarted.primaryHref}
                className="inline-flex h-12 items-center rounded-lg bg-white px-6 text-base font-medium text-ink no-underline transition hover:bg-white/90"
              >
                {getStarted.primaryLabel}
              </a>
              <a
                href={REPO_URL}
                className="inline-flex h-12 items-center rounded-lg border border-white/35 bg-transparent px-6 text-base font-medium text-white no-underline transition hover:bg-white/10"
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
