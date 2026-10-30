/**
 * Serves the built app: from a folder, or from the files the single executable holds. The request
 * path is decoded once and then refused when any of its segments could leave the app or name
 * something other than a file, on any platform. From a folder, what is left must still resolve,
 * symbolic links included, to a file inside it.
 */
import { readFile, realpath, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import { isInside, toForwardSlashes } from './paths';
import { SECURITY_HEADERS, sendText } from './responses';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

const REFUSALS = { 400: 'Bad request.', 403: 'Forbidden.', 404: 'Not found.' } as const;

/** The status a request for a file of the app is refused with. */
type Refusal = { ok: false; status: keyof typeof REFUSALS };

/** The content type a file is served with, from its extension. */
export function contentTypeOf(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * The file of the built app a request target names, by its path in the build with forward slashes,
 * such as `index.html` or `assets/app.js`, or the status to refuse it with.
 */
export type AppPath = { ok: true; path: string } | Refusal;

/**
 * Finds the file of the built app a request target names, without touching any file. `/` names
 * `index.html`. Dot segments, backslashes and colons (drive letters, alternate data streams) are
 * refused, before and after decoding, and so are empty segments, which name no file.
 */
export function resolveAppPath(target: string): AppPath {
  if (!target.startsWith('/')) return { ok: false, status: 400 };
  const queryStart = target.indexOf('?');
  const encoded = queryStart === -1 ? target : target.slice(0, queryStart);
  let path: string;
  try {
    path = decodeURIComponent(encoded);
  } catch {
    return { ok: false, status: 400 };
  }
  if (path.includes('\0')) return { ok: false, status: 400 };

  const segments = path === '/' ? ['index.html'] : path.slice(1).split('/');
  const leavesFolder = (segment: string) =>
    segment === '.' || segment === '..' || segment.includes('\\') || segment.includes(':');
  if (segments.some(leavesFolder)) return { ok: false, status: 403 };
  // An empty segment names a folder, or comes from a doubled slash; neither is a file to serve.
  if (segments.includes('')) return { ok: false, status: 404 };
  return { ok: true, path: segments.join('/') };
}

/** Where a request target leads inside the folder, or the status to refuse it with. */
export type StaticFile = { ok: true; file: string } | Refusal;

/**
 * Finds the file a request target names inside the folder, without touching the disk, as
 * {@link resolveAppPath} does; anything that would resolve outside the folder is refused too.
 */
export function resolveStaticFile(root: string, target: string): StaticFile {
  const resolved = resolveAppPath(target);
  if (!resolved.ok) return resolved;
  const file = join(root, ...resolved.path.split('/'));
  return isInside(root, file) ? { ok: true, file } : { ok: false, status: 403 };
}

/** The files of the built app, wherever they are kept. */
export interface AppFiles {
  /**
   * The bytes of a file, by its path in the build as {@link resolveAppPath} gives it; `undefined`
   * when the build holds no file there.
   */
  read(path: string): Promise<Uint8Array | undefined>;
}

/** The files of a folder: `root` is the real path from {@link openStaticRoot}. */
export function folderFiles(root: string): AppFiles {
  return {
    read: (path) => {
      const file = join(root, ...path.split('/'));
      return isInside(root, file) ? readFileInside(root, file) : Promise.resolve(undefined);
    },
  };
}

/** Files held in memory by their path in the build; the executable's assets work like this. */
export function memoryFiles(files: ReadonlyMap<string, Uint8Array>): AppFiles {
  return { read: (path) => Promise.resolve(files.get(path)) };
}

/** Raised when the built app has no `index.html`. */
export class AppNotBuiltError extends Error {
  override name = 'AppNotBuiltError';
}

/** Checks that a folder holds a built app, and returns its real path to serve it from. */
export async function openStaticRoot(dir: string): Promise<string> {
  const index = join(dir, 'index.html');
  if (!(await isFile(index))) {
    throw new AppNotBuiltError(
      `The app is not built: ${toForwardSlashes(index)} is missing. Run \`pnpm build\` first.`,
    );
  }
  return realpath(dir);
}

/** Answers a request with a file of the built app. */
export async function serveAppFile(
  files: AppFiles,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Only GET and HEAD requests are served.', { Allow: 'GET, HEAD' });
    return;
  }
  const resolved = resolveAppPath(request.url ?? '');
  if (!resolved.ok) {
    sendText(response, resolved.status, REFUSALS[resolved.status]);
    return;
  }
  const body = await files.read(resolved.path);
  if (body === undefined) {
    sendText(response, 404, REFUSALS[404]);
    return;
  }
  const name = resolved.path.split('/').at(-1) ?? '';
  response.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': contentTypeOf(name),
    'Content-Length': body.byteLength,
    ...(name.toLowerCase() === 'index.html' && { 'Cache-Control': 'no-store' }),
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

/**
 * Answers a request with a file of the built app in a folder. `root` is the real path from
 * {@link openStaticRoot}.
 */
export function serveStatic(
  root: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  return serveAppFile(folderFiles(root), request, response);
}

/** Reads a file whose real path, after following symbolic links, is still inside the folder. */
async function readFileInside(root: string, file: string): Promise<Buffer | undefined> {
  try {
    const real = await realpath(file);
    if (!isInside(root, real) || !(await stat(real)).isFile()) return undefined;
    return await readFile(real);
  } catch {
    return undefined;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
