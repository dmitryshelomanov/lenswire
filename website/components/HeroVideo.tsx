'use client';

import { useEffect, useRef, useState } from 'react';
import { withBasePath } from '@/lib/basePath';

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const el = videoRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad) return;
    const el = videoRef.current;
    if (!el) return;
    void el.play().catch(() => {
      /* autoplay may be blocked; poster remains */
    });
  }, [shouldLoad]);

  return (
    <div className="w-full max-w-[18rem] overflow-hidden rounded-[1.75rem] shadow-[0_32px_64px_-20px_rgba(0,0,0,0.45)] ring-1 ring-white/25 sm:max-w-[20rem] lg:max-w-[22rem]">
      <video
        ref={videoRef}
        className="block h-auto w-full bg-black"
        muted
        loop
        playsInline
        preload="none"
        poster={withBasePath('/screenshots/traffic.jpg')}
        controls={false}
      >
        {shouldLoad ? <source src={withBasePath('/demo.mp4')} type="video/mp4" /> : null}
      </video>
    </div>
  );
}
