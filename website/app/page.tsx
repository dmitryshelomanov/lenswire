import { CompareCell } from '@/components/CompareCell';
import { DeviceFrame } from '@/components/DeviceFrame';
import { FeatureIcon } from '@/components/FeatureIcon';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { Spotlight } from '@/components/Spotlight';
import { withBasePath } from '@/lib/basePath';
import { comparison, faqs, features, howTeaser, screens, spotlights } from '@/lib/content';
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
                src={withBasePath('/favicon.png')}
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
                  href="https://github.com/dmitryshelomanov/lenswire"
                  className="inline-flex h-12 items-center rounded-full bg-white px-6 text-base font-medium text-ink no-underline transition hover:bg-white/90"
                >
                  View on GitHub
                </a>
                <a
                  href="#screens"
                  className="inline-flex h-12 items-center rounded-full border border-white/40 bg-white/10 px-6 text-base font-medium text-white no-underline backdrop-blur transition hover:bg-white/20"
                >
                  See screens
                </a>
              </div>
              <p className="mt-5 text-sm text-white/60">iOS · Android · on-device · MIT</p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <div className="w-full max-w-[18rem] overflow-hidden rounded-[1.75rem] shadow-[0_32px_64px_-20px_rgba(0,0,0,0.45)] ring-1 ring-white/25 sm:max-w-[20rem] lg:max-w-[22rem]">
                <video
                  className="block h-auto w-full bg-black"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  poster={withBasePath('/screenshots/traffic.jpg')}
                >
                  <source src={withBasePath('/demo.mp4')} type="video/mp4" />
                  <source src={withBasePath('/demo.webm')} type="video/webm" />
                </video>
              </div>
            </div>
          </div>
        </section>

        {/* What it is */}
        <section className="mx-auto max-w-5xl px-5 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-display text-5xl tracking-tight sm:text-6xl">
              A clear view of every request
            </h2>
            <p className="mt-6 text-xl leading-relaxed text-muted sm:text-2xl">
              Domain overviews, decrypted payloads, filters, overrides, and HAR export — readable on
              the phone.
            </p>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-y border-line bg-wash">
          <div className="mx-auto max-w-5xl px-5 py-20 sm:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="font-display text-5xl tracking-tight sm:text-6xl">What you can do</h2>
              <p className="mt-5 text-xl text-muted">
                Capture, inspect, mock, and share HTTP(S) from your device.
              </p>
            </div>
            <ul className="mt-14 grid gap-5 sm:grid-cols-2">
              {features.map((feature, i) => (
                <li
                  key={feature.title}
                  className="rounded-2xl bg-paper p-8 shadow-[0_8px_30px_-12px_rgba(11,61,145,0.18)] ring-1 ring-black/[0.04] sm:p-9"
                >
                  <FeatureIcon index={i} />
                  <h3 className="mt-5 text-xl font-semibold tracking-tight text-ink">
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

        {/* How teaser */}
        <section className="mx-auto max-w-5xl px-5 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-display text-5xl tracking-tight sm:text-6xl">{howTeaser.title}</h2>
            <p className="mt-6 text-xl leading-relaxed text-muted sm:text-2xl">{howTeaser.lead}</p>
            <div className="mt-9">
              <Link
                href="/how/"
                className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-base font-medium text-white no-underline transition hover:bg-navy"
              >
                {howTeaser.cta}
              </Link>
            </div>
          </div>
        </section>

        {/* Spotlight rows */}
        <section className="mx-auto max-w-5xl space-y-24 px-5 py-20 sm:space-y-32 sm:py-28">
          {spotlights.map((item) => (
            <Spotlight key={item.title} {...item} />
          ))}
        </section>

        {/* Compare */}
        <section id="compare" className="border-y border-line bg-wash">
          <div className="mx-auto max-w-5xl px-5 py-20 sm:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="font-display text-5xl tracking-tight sm:text-6xl">
                Compared to desktop proxies
              </h2>
              <p className="mt-5 text-xl text-muted">
                Charles, Proxyman, and mitmproxy are excellent on a Mac or PC. Lenswire is built for
                capture on the phone — VPN MITM, no laptop in the loop.
              </p>
            </div>
            <div className="mt-14 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <table className="w-full min-w-[40rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="py-4 pr-4 text-sm font-medium text-muted sm:pr-6">
                      <span className="sr-only">Criterion</span>
                    </th>
                    {comparison.tools.map((tool) => {
                      const highlight = tool === comparison.highlight;
                      return (
                        <th
                          key={tool}
                          scope="col"
                          className={`px-3 py-4 text-center text-base font-semibold tracking-tight sm:px-4 ${
                            highlight ? 'bg-navy/5 text-navy' : 'text-ink'
                          }`}
                        >
                          {tool}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row) => (
                    <tr key={row.criterion} className="border-b border-line/80">
                      <th
                        scope="row"
                        className="max-w-[11rem] py-4 pr-4 text-base font-medium tracking-tight text-ink sm:max-w-none sm:pr-6"
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
                              highlight ? 'bg-navy/5' : ''
                            }`}
                          >
                            <CompareCell value={value} emphasize={highlight} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-6 text-sm leading-relaxed text-muted">{comparison.footnote}</p>
          </div>
        </section>

        {/* Screens — horizontal scroll */}
        <section id="screens" className="bg-wash pb-20 sm:pb-28">
          <div className="mx-auto max-w-5xl px-5 pt-20 sm:pt-28">
            <h2 className="font-display text-5xl tracking-tight sm:text-6xl">In the app</h2>
            <p className="mt-5 max-w-xl text-xl text-muted">
              Traffic list, domain drill-down, request/response detail, and overrides.
            </p>
          </div>
          <div className="mt-12 overflow-x-auto overscroll-x-contain scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        <section id="faq" className="mx-auto max-w-5xl px-5 py-20 sm:py-28">
          <h2 className="font-display text-5xl tracking-tight sm:text-6xl">FAQ</h2>
          <p className="mt-5 text-xl text-muted">Common questions.</p>
          <dl className="mt-12 space-y-7">
            {faqs.map((item) => (
              <div key={item.q} className="border-t border-line pt-7">
                <dt className="text-xl font-medium tracking-tight">{item.q}</dt>
                <dd className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* CTA — free lure */}
        <section className="mx-auto max-w-5xl px-5 pb-20 sm:pb-28">
          <div className="rounded-3xl bg-gradient-to-br from-[#e8f4fb] via-[#f0f7fb] to-white px-7 py-12 ring-1 ring-line sm:px-14 sm:py-16">
            <img
              src={withBasePath('/favicon.png')}
              alt=""
              width={56}
              height={56}
              className="rounded-xl shadow-sm ring-1 ring-black/5"
            />
            <h2 className="mt-6 font-display text-4xl tracking-tight sm:text-5xl">
              Free and open source
            </h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
              MIT licensed, no account, no cloud. Capture and decrypt stay on your device.
            </p>
            <div className="mt-8">
              <a
                href="https://github.com/dmitryshelomanov/lenswire"
                className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-base font-medium text-white no-underline transition hover:bg-navy"
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
