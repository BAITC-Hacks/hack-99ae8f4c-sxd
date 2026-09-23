import type { FutureFactor } from '../../types/outlook.ts';

export const TRUSTED_DOMAINS = ['gov.kz', 'stat.gov.kz', 'un.org', 'undp.org', 'worldbank.org', 'oecd.org', 'ipcc.ch', 'wmo.int', 'adb.org', 'nu.edu.kz'];
export const MAX_SOURCES = 3;
export function sourceURL(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname === '/') return;
    if (!TRUSTED_DOMAINS.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) return;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href.replace(/\/$/, '');
  } catch { return; }
}
export function cleanSources(value: unknown): FutureFactor['sources'] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 30).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const url = sourceURL(item.url);
    if (!url || seen.has(url) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 300) return [];
    seen.add(url);
    const date = typeof item.publishedAt === 'string' ? Date.parse(item.publishedAt) : NaN;
    return [{ title: item.title.trim(), url, publisher: new URL(url).hostname,
      ...(Number.isFinite(date) && date <= Date.now() ? { publishedAt: new Date(date).toISOString() } : {}) }];
  }).slice(0, MAX_SOURCES);
}

export class ResearchFailure extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = false) { super(message); this.retryable = retryable; }
}
/** A hard deadline also bounds fetch implementations/providers that ignore AbortSignal. */
export async function deadline<T>(operation: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new ResearchFailure('Research timed out', true)); }, ms);
    })]);
  } finally { clearTimeout(timer); controller.abort(); }
}

export function createSearch(apiKey: string, fetcher: typeof fetch = fetch, timeoutMs = 4500) {
  const cache = new Map<string, { expires: number; value: unknown }>();
  const pending = new Map<string, Promise<unknown>>();
  return async (query: string): Promise<unknown> => {
    const cached = cache.get(query);
    if (cached && cached.expires > Date.now()) return structuredClone(cached.value);
    if (pending.has(query)) return structuredClone(await pending.get(query));
    const work = (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const value = await deadline(async signal => {
            let response: Response;
            try {
              response = await fetcher('https://api.tavily.com/search', {
                method: 'POST', signal, redirect: 'error',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({ query, search_depth: 'basic', max_results: 6, include_domains: TRUSTED_DOMAINS,
                  include_answer: false, include_raw_content: false }),
              });
            } catch { throw new ResearchFailure('Search connection failed', true); }
            if (!response.ok) throw new ResearchFailure(`Search HTTP ${response.status}`, response.status === 429 || response.status >= 500);
            // Stream cap prevents an untrusted upstream from allocating an unbounded response.
            const reader = response.body?.getReader();
            if (!reader) throw new ResearchFailure('Empty search response');
            const decoder = new TextDecoder();
            let body = '', bytes = 0;
            try {
              while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                bytes += chunk.value.byteLength;
                if (bytes > 250_000) throw new ResearchFailure('Search response too large');
                body += decoder.decode(chunk.value, { stream: true });
              }
              body += decoder.decode();
              return JSON.parse(body) as unknown;
            } finally { void reader.cancel().catch(() => {}); }
          }, timeoutMs);
          if (!value || typeof value !== 'object' || !Array.isArray((value as { results?: unknown }).results)) throw new ResearchFailure('Malformed search response');
          if (cache.size >= 100) cache.delete(cache.keys().next().value!);
          cache.set(query, { value: structuredClone(value), expires: Date.now() + 15 * 60_000 });
          return value;
        } catch (error) {
          console.warn('[Future Research]', { provider: 'tavily', attempt: attempt + 1, reason: error instanceof ResearchFailure ? error.message : 'Malformed search response' });
          if (attempt >= 1 || !(error instanceof ResearchFailure) || !error.retryable) throw error;
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }
    })();
    pending.set(query, work);
    try { return structuredClone(await work); } finally { pending.delete(query); }
  };
}
