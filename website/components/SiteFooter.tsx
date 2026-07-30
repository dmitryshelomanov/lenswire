import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-wash">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-xl">Lenswire</p>
          <p className="mt-1.5 text-base text-muted">Local HTTP(S) inspector. On-device MITM.</p>
        </div>
        <div className="flex flex-wrap gap-5 text-base text-muted">
          <a
            href="https://github.com/dmitryshelomanov/lenswire"
            className="no-underline transition hover:text-ink"
          >
            GitHub
          </a>
          <Link href="/privacy/" className="no-underline transition hover:text-ink">
            Privacy Policy
          </Link>
          <a
            href="mailto:dmitryshelomanov@mail.ru"
            className="no-underline transition hover:text-ink"
          >
            Contact
          </a>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-5xl px-5 py-4 text-sm text-muted">
          © {new Date().getFullYear()} Dmitry Shelomanov · MIT
        </p>
      </div>
    </footer>
  );
}
