import { entryUrl, type TrafficBody, type TrafficEntry } from '@/entities/traffic/types';

type HarContent = {
  size: number;
  mimeType: string;
  text?: string;
  encoding?: string;
  comment?: string;
};

type HarPostData = {
  mimeType: string;
  text: string;
  encoding?: string;
};

function mimeFromHeaders(headers: Record<string, string>): string {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'content-type') {
      return value.split(';')[0]?.trim() || value;
    }
  }
  return 'application/octet-stream';
}

function harHeaders(headers: Record<string, string>): { name: string; value: string }[] {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

function harContent(body: TrafficBody, headers: Record<string, string>): HarContent {
  const mimeType = mimeFromHeaders(headers);
  if (body.kind === 'empty') {
    return { size: 0, mimeType, text: '' };
  }
  if (body.kind === 'json' || body.kind === 'text') {
    const text = body.text ?? '';
    return {
      size: body.size,
      mimeType: body.kind === 'json' ? 'application/json' : mimeType,
      text,
      comment: body.truncated ? 'Body truncated in capture' : undefined,
    };
  }
  if (body.previewBase64) {
    return {
      size: body.size,
      mimeType: body.kind === 'image' ? mimeType : mimeType,
      text: body.previewBase64,
      encoding: 'base64',
      comment: body.truncated ? 'Preview truncated in capture' : undefined,
    };
  }
  return {
    size: body.size,
    mimeType,
    comment: 'Binary body not available in capture preview',
  };
}

function harPostData(body: TrafficBody, headers: Record<string, string>): HarPostData | undefined {
  if (body.size <= 0) return undefined;
  const isTextual = body.kind === 'json' || body.kind === 'text';
  const hasBase64Preview = Boolean(body.previewBase64);
  return {
    mimeType: mimeFromHeaders(headers),
    text: isTextual ? (body.text ?? '') : (body.previewBase64 ?? ''),
    encoding: !isTextual && hasBase64Preview ? 'base64' : undefined,
  };
}

function queryString(query: string): { name: string; value: string }[] {
  if (!query) return [];
  return query.split('&').map((pair) => {
    const eq = pair.indexOf('=');
    if (eq < 0) return { name: decodeURIComponent(pair), value: '' };
    return {
      name: decodeURIComponent(pair.slice(0, eq)),
      value: decodeURIComponent(pair.slice(eq + 1)),
    };
  });
}

/** HAR 1.2 log with a single entry. */
export function toHar(entry: TrafficEntry): string {
  const started = new Date(entry.startedAt).toISOString();
  const har = {
    log: {
      version: '1.2',
      creator: { name: 'Lenswire', version: '1.0' },
      entries: [
        {
          startedDateTime: started,
          time: entry.timing.totalMs,
          request: {
            method: entry.method,
            url: entryUrl(entry),
            httpVersion: 'HTTP/1.1',
            cookies: [],
            headers: harHeaders(entry.requestHeaders),
            queryString: queryString(entry.query),
            headersSize: -1,
            bodySize: entry.requestBody.size,
            postData: harPostData(entry.requestBody, entry.requestHeaders),
          },
          response: {
            status: entry.status,
            statusText: '',
            httpVersion: 'HTTP/1.1',
            cookies: [],
            headers: harHeaders(entry.responseHeaders),
            content: harContent(entry.responseBody, entry.responseHeaders),
            redirectURL: '',
            headersSize: -1,
            bodySize: entry.responseBody.size,
          },
          cache: {},
          timings: {
            blocked: -1,
            dns: entry.timing.dnsMs,
            connect: entry.timing.connectMs,
            send: 0,
            wait: entry.timing.ttfbMs,
            receive: entry.timing.downloadMs,
            ssl: entry.timing.tlsMs,
          },
        },
      ],
    },
  };

  return JSON.stringify(har, null, 2);
}

export function canExportHar(entry: TrafficEntry): boolean {
  return entry.method !== 'CONNECT' || entry.httpPayloadAvailable !== false;
}
