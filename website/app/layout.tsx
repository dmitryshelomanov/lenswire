import type { Metadata } from 'next';
import { Fraunces, Outfit } from 'next/font/google';
import { BASE_PATH, withBasePath } from '@/lib/basePath';
import './globals.css';

const SITE_URL = 'https://dmitryshelomanov.github.io/lenswire';
const SITE_TITLE = 'Lenswire — Local HTTP(S) inspector';
const SITE_DESCRIPTION =
  'Capture, decrypt, and debug HTTP(S) traffic on iOS and Android — VPN MITM, overrides, and HAR export. On-device.';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: '%s · Lenswire',
  },
  description: SITE_DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [{ url: `${BASE_PATH}/favicon.png`, type: 'image/png' }],
    apple: [{ url: `${BASE_PATH}/icon.png`, type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'Lenswire',
    title: 'Lenswire',
    description: SITE_DESCRIPTION,
    images: [
      {
        url: '/og.png?v=2',
        width: 1200,
        height: 630,
        alt: 'Lenswire — Local HTTP(S) inspector',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lenswire',
    description: SITE_DESCRIPTION,
    images: ['/og.png?v=2'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Lenswire',
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  image: `${SITE_URL}/og.png?v=2`,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'iOS, Android',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  codeRepository: 'https://github.com/dmitryshelomanov/lenswire',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable}`}>
      <head>
        <link rel="icon" href={withBasePath('/favicon.png')} type="image/png" />
        <link rel="apple-touch-icon" href={withBasePath('/icon.png')} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
