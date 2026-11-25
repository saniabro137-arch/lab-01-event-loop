import { z } from 'zod';

export const ManifestSchema = z.array(z.object({
  id: z.string(),
  type: z.enum(['image', 'audio', 'json']),
  url: z.string()
}));

type Manifest = z.infer<typeof ManifestSchema>;
type Item = Manifest[number];

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, url: string) {
    super('HTTP ' + status + ': ' + url);
    this.status = status;
  }
}

export async function fetchChecked(url: string, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new HttpError(response.status, url);
  return response;
}

export async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  return (await fetchChecked(url, signal)).json();
}

async function loadImage(url: string, signal: AbortSignal): Promise<ImageBitmap> {
  const blob = await (await fetchChecked(url, signal)).blob();
  signal.throwIfAborted();
  const image = await createImageBitmap(blob);
  if (signal.aborted) {
    image.close();
    signal.throwIfAborted();
  }
  return image;
}

async function loadAudio(
  url: string, signal: AbortSignal, context: AudioContext
): Promise<AudioBuffer> {
  const data = await (await fetchChecked(url, signal)).arrayBuffer();
  signal.throwIfAborted();
  const buffer = await context.decodeAudioData(data);
  signal.throwIfAborted();
  return buffer;
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function retry<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let i = 0; ; i++) {
    signal.throwIfAborted();
    try {
      return await run();
    } catch (error: unknown) {
      if (signal.aborted || i >= 2 || error instanceof SyntaxError ||
          (error instanceof Error && error.name === 'AbortError') ||
          (error instanceof HttpError && error.status >= 400 && error.status < 500)) {
        throw error;
      }
      await delay(150 * 2 ** i + Math.random() * 100, signal);
    }
  }
}

export async function loadAll(
  manifest: readonly Item[],
  context: AudioContext,
  signal: AbortSignal,
  progress: (done: number, total: number, id: string) => void = () => {},
  sequential = false
): Promise<Record<string, unknown>> {
  let done = 0;
  async function load(item: Item): Promise<[string, unknown]> {
    const value = await retry<unknown>(() => {
      const kind = item.type;
      switch (kind) {
        case 'image': return loadImage(item.url, signal);
        case 'audio': return loadAudio(item.url, signal, context);
        case 'json': return fetchJson(item.url, signal);
        default: {
          const unexpected: never = kind;
          return unexpected;
        }
      }
    }, signal);
    progress(++done, manifest.length, item.id);
    return [item.id, value];
  }

  if (!sequential) return Object.fromEntries(await Promise.all(manifest.map(load)));
  const entries: [string, unknown][] = [];
  for (const item of manifest) entries.push(await load(item));
  return Object.fromEntries(entries);
}
