/** Must match `basePath` in next.config.ts — next/image (unoptimized) does not always prefix it. */
export const BASE_PATH = '/lenswire';

export function withBasePath(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}
