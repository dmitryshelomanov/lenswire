import { withBasePath } from '@/lib/basePath';

export function DeviceFrame({
  src,
  alt,
  priority = false,
}: {
  src: string;
  alt: string;
  priority?: boolean;
}) {
  return (
    <div className="rounded-[2rem] bg-[#111] p-[7px] shadow-[0_28px_60px_-32px_rgba(11,61,145,0.45)] ring-1 ring-black/10">
      <div className="overflow-hidden rounded-[1.55rem] bg-black">
        <img
          src={withBasePath(src)}
          alt={alt}
          width={394}
          height={860}
          className="block h-auto w-full"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
        />
      </div>
    </div>
  );
}
