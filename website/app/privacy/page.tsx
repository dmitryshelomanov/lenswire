import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for the Lenswire HTTP(S) inspector app.',
};

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
        <p className="mb-8">
          <Link href="/" className="text-sm text-muted no-underline transition hover:text-ink">
            ← Lenswire
          </Link>
        </p>

        <h1 className="font-display text-4xl tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-muted">Last updated: 2026-07-30</p>

        <div className="mt-10 space-y-5 text-[1.05rem] leading-relaxed text-ink/90">
          <p>
            Lenswire (“the App”) is a local HTTP(S) inspector for iOS and Android. This policy
            describes how Lenswire handles information.
          </p>

          <h2 className="!mt-10 font-display text-2xl tracking-tight">Who we are</h2>
          <p>Lenswire is developed by Dmitry Shelomanov.</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>
              Email:{' '}
              <a
                className="text-navy underline-offset-2 hover:underline"
                href="mailto:dmitryshelomanov@mail.ru"
              >
                dmitryshelomanov@mail.ru
              </a>
            </li>
            <li>
              Website:{' '}
              <a
                className="text-navy underline-offset-2 hover:underline"
                href="https://dmitryshelomanov.github.io/"
              >
                dmitryshelomanov.github.io
              </a>
            </li>
            <li>
              App site:{' '}
              <a
                className="text-navy underline-offset-2 hover:underline"
                href="https://dmitryshelomanov.github.io/lenswire/"
              >
                dmitryshelomanov.github.io/lenswire
              </a>
            </li>
            <li>
              Repository:{' '}
              <a
                className="text-navy underline-offset-2 hover:underline"
                href="https://github.com/dmitryshelomanov/lenswire"
              >
                github.com/dmitryshelomanov/lenswire
              </a>
            </li>
          </ul>

          <h2 className="!mt-10 font-display text-2xl tracking-tight">Data we process</h2>
          <p>
            Lenswire does <strong>not</strong> collect, sell, or transmit personal data to our
            servers. There is no Lenswire backend and no third-party analytics in the App.
          </p>

          <h3 className="!mt-8 text-lg font-semibold tracking-tight">Network traffic</h3>
          <p>
            When you start the local VPN / proxy, the App intercepts network traffic on your device
            so you can inspect it. Captured requests and responses are stored locally on your device
            only. Lenswire does not upload captures to remote servers.
          </p>

          <h3 className="!mt-8 text-lg font-semibold tracking-tight">Certificates</h3>
          <p>
            HTTPS decryption uses a locally generated Lenswire CA certificate that you install on
            the device. Certificate material stays on your device.
          </p>

          <h3 className="!mt-8 text-lg font-semibold tracking-tight">Local settings</h3>
          <p>
            Preferences (listen host/port, HTTPS decryption toggle, override rules, and similar) are
            stored locally on your device. They are not synced to Lenswire servers.
          </p>

          <h3 className="!mt-8 text-lg font-semibold tracking-tight">Export / share</h3>
          <p>
            If you use Copy as cURL, Share HAR, or similar export actions, you choose where that data
            goes (clipboard, share sheet, etc.). Lenswire does not send those exports to us.
          </p>

          <h2 className="!mt-10 font-display text-2xl tracking-tight">Permissions</h2>
          <p>Depending on the platform, Lenswire may request:</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>VPN configuration (to capture device traffic)</li>
            <li>Notifications (Android foreground service status)</li>
            <li>Network access</li>
          </ul>
          <p className="text-muted">
            You can revoke permissions in system settings. Capture will stop working without VPN
            permission.
          </p>

          <h2 className="!mt-10 font-display text-2xl tracking-tight">Children’s privacy</h2>
          <p>
            Lenswire is not directed at children under 13. We do not knowingly collect personal
            information from children.
          </p>

          <h2 className="!mt-10 font-display text-2xl tracking-tight">Changes</h2>
          <p>
            We may update this policy. The “Last updated” date at the top will change when we do.
            Continued use of the App after changes means you accept the updated policy.
          </p>

          <h2 className="!mt-10 font-display text-2xl tracking-tight">Contact</h2>
          <p>
            Questions about privacy:{' '}
            <a
              className="text-navy underline-offset-2 hover:underline"
              href="mailto:dmitryshelomanov@mail.ru"
            >
              dmitryshelomanov@mail.ru
            </a>
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
