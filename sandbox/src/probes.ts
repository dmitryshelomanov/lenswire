export type ProbeMethod = 'GET' | 'POST';

export type Probe = {
  id: string;
  label: string;
  method: ProbeMethod;
  url: string;
  body?: Record<string, unknown>;
  /** What jsonplaceholder returns without a Lenswire mock. */
  expectedLive: string;
};

export const PROBES: Probe[] = [
  {
    id: 'get-post',
    label: 'GET post',
    method: 'GET',
    url: 'https://jsonplaceholder.typicode.com/posts/1',
    expectedLive:
      '200 · userId: 1, id: 1, title starts with "sunt aut facere…" (real jsonplaceholder post)',
  },
  {
    id: 'get-todos',
    label: 'GET todos',
    method: 'GET',
    url: 'https://jsonplaceholder.typicode.com/todos/1',
    expectedLive: '200 · title: "delectus aut autem", completed: false, id: 1, userId: 1',
  },
  {
    id: 'post-create',
    label: 'POST create',
    method: 'POST',
    url: 'https://jsonplaceholder.typicode.com/posts',
    body: {
      title: 'lenswire sandbox',
      body: 'probe post for mock verification',
      userId: 1,
    },
    expectedLive: '201 · echoes title/body/userId and adds id: 101 (jsonplaceholder fake create)',
  },
];

export type ProbeResult = {
  probeId: string;
  ok: boolean;
  status: number | null;
  durationMs: number;
  bodyText: string;
  error: string | null;
};

export async function runProbe(probe: Probe): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const response = await fetch(probe.url, {
      method: probe.method,
      headers:
        probe.body != null ? { 'Content-Type': 'application/json; charset=UTF-8' } : undefined,
      body: probe.body != null ? JSON.stringify(probe.body) : undefined,
    });

    const raw = await response.text();
    let bodyText = raw;
    try {
      bodyText = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      // keep raw text
    }

    return {
      probeId: probe.id,
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - started,
      bodyText,
      error: null,
    };
  } catch (error) {
    return {
      probeId: probe.id,
      ok: false,
      status: null,
      durationMs: Date.now() - started,
      bodyText: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
