import { isGrpcEntry } from './grpc';
import { headerValue } from './headers';
import type { ResourceKind, TrafficEntry } from './types';

function mimeFromHeaders(headers: Record<string, string>): string {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'content-type') {
      return value.split(';')[0]?.trim().toLowerCase() || '';
    }
  }
  return '';
}

function pathWithoutQuery(path: string): string {
  return path.split('?')[0] ?? path;
}

function extensionOf(path: string): string {
  const bare = pathWithoutQuery(path);
  const slash = bare.lastIndexOf('/');
  const name = slash >= 0 ? bare.slice(slash + 1) : bare;
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/** Google Fonts kit URLs and similar: `/l/font` with no file extension. */
function fromFontPath(path: string): ResourceKind | null {
  const bare = pathWithoutQuery(path);
  if (bare === 'font' || bare === '/font' || bare.endsWith('/font')) return 'font';
  return null;
}

function fromSecFetchDest(entry: TrafficEntry): ResourceKind | null {
  const dest = headerValue(entry.requestHeaders, 'sec-fetch-dest').toLowerCase();
  switch (dest) {
    case 'font':
      return 'font';
    case 'script':
      return 'js';
    case 'style':
      return 'css';
    case 'image':
      return 'img';
    case 'audio':
    case 'video':
      return 'media';
    case 'document':
      return 'doc';
    default:
      return null;
  }
}

function fromMime(mime: string): ResourceKind | null {
  if (!mime) return null;
  if (mime.startsWith('image/')) return 'img';
  if (
    mime.startsWith('font/') ||
    mime.startsWith('application/font-') ||
    mime === 'application/vnd.ms-fontobject'
  ) {
    return 'font';
  }
  if (mime === 'text/css') return 'css';
  if (
    mime.includes('javascript') ||
    mime.includes('ecmascript') ||
    mime === 'text/js' ||
    mime === 'application/x-javascript'
  ) {
    return 'js';
  }
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'doc';
  if (mime.startsWith('audio/') || mime.startsWith('video/')) return 'media';
  if (
    mime === 'application/json' ||
    mime.endsWith('+json') ||
    mime === 'application/xml' ||
    mime === 'text/xml' ||
    mime.endsWith('+xml') ||
    mime === 'application/x-www-form-urlencoded'
  ) {
    return 'xhr';
  }
  return null;
}

function fromExtension(ext: string): ResourceKind | null {
  switch (ext) {
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
    case 'ico':
    case 'bmp':
    case 'avif':
      return 'img';
    case 'woff':
    case 'woff2':
    case 'ttf':
    case 'otf':
    case 'eot':
      return 'font';
    case 'css':
      return 'css';
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'js';
    case 'html':
    case 'htm':
    case 'xhtml':
      return 'doc';
    case 'mp4':
    case 'webm':
    case 'mp3':
    case 'wav':
    case 'ogg':
    case 'm4a':
    case 'm4v':
    case 'mov':
      return 'media';
    case 'json':
    case 'xml':
      return 'xhr';
    default:
      return null;
  }
}

export function resourceTypeOf(entry: TrafficEntry): ResourceKind {
  if (isGrpcEntry(entry)) return 'grpc';

  const mime = mimeFromHeaders(entry.responseHeaders);
  const fromHeader = fromMime(mime);
  if (fromHeader) return fromHeader;

  const fromPathHint = fromFontPath(entry.path);
  if (fromPathHint) return fromPathHint;

  const fromFetchDest = fromSecFetchDest(entry);
  if (fromFetchDest) return fromFetchDest;

  const fromPath = fromExtension(extensionOf(entry.path));
  if (fromPath) return fromPath;

  return 'other';
}
