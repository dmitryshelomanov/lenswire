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
      className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-16 ${
        reverse ? 'lg:[&>*:first-child]:order-2' : ''
      }`}
    >
      <div className="px-5 sm:px-0">
        <p className="text-base font-medium tracking-wide text-navy">{eyebrow}</p>
        <h3 className="mt-3 font-display text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.05] tracking-tight">
          {title}
        </h3>
        <p className="mt-5 max-w-md text-lg leading-relaxed text-muted sm:text-xl">{body}</p>
      </div>
      <div
        className={`mx-auto flex w-full max-w-md justify-center bg-gradient-to-br ${wash} px-4 py-10 sm:rounded-2xl sm:px-10 sm:py-12`}
      >
        <div className="w-[min(17rem,82%)]">
          <DeviceFrame src={src} alt={alt} />
        </div>
      </div>
    </div>
  );
}
