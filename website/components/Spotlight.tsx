import { DeviceFrame } from '@/components/DeviceFrame';

export function Spotlight({
  eyebrow,
  title,
  body,
  src,
  alt,
  reverse = false,
  wash,
}: {
  eyebrow: string;
  title: string;
  body: string;
  src: string;
  alt: string;
  reverse?: boolean;
  wash: string;
}) {
  return (
    <div
      className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}
    >
      <div>
        <p className="text-base font-medium tracking-wide text-navy">{eyebrow}</p>
        <h3 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">{title}</h3>
        <p className="mt-5 text-lg leading-relaxed text-muted sm:text-xl">{body}</p>
      </div>
      <div
        className={`mx-auto flex w-full max-w-md justify-center rounded-3xl bg-gradient-to-br ${wash} p-8 sm:p-10`}
      >
        <div className="w-[min(16.5rem,78%)]">
          <DeviceFrame src={src} alt={alt} />
        </div>
      </div>
    </div>
  );
}
