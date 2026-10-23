/**
 * Serves the built app from a folder. The request path is decoded once and then refused when any of
 * its segments could leave the folder or name something other than a file, on any platform; what is
 * left must still resolve, symbolic links included, to a file inside the folder.
 */
import { readFile, realpath, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, extname, join } from 'node:path';
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
  '.txt': 'text/plain; charset=utf-8',
};

const REFUSALS = { 400: 'Bad request.', 403: 'Forbidden.', 404: 'Not found.' } as const;

/** The content type a file is served with, from its extension. */
export function contentTypeOf(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** Where a request target leads inside the folder, or the status to refuse it with. */
export type StaticFile = { ok: true; file: string } | { ok: false; status: keyof typeof REFUSALS };

/**
 * Finds the file a request target names inside the folder, without touching the disk. `/` names
 * `index.html`. Dot segments, backslashes and colons (drive letters, alternate data streams) are
 * refused, before and after decoding, and so is anything that would resolve outside the folder.
 */
export function resolveStaticFile(root: string, target: string): StaticFile {
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

  const file = join(root, ...segments);
  return isInside(root, file) ? { ok: true, file } : { ok: false, status: 403 };
}

/** Raised when the folder of the built app has no `index.html`. */
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

/**
 * Answers a request with a file of the built app. `root` is the real path from
 * {@link openStaticRoot}.
 */
export async function serveStatic(
  root: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Only GET and HEAD requests are served.', { Allow: 'GET, HEAD' });
    return;
  }
  const resolved = resolveStaticFile(root, request.url ?? '');
  if (!resolved.ok) {
    sendText(response, resolved.status, REFUSALS[resolved.status]);
    return;
  }
  const body = await readFileInside(root, resolved.file);
  if (body === undefined) {
    sendText(response, 404, REFUSALS[404]);
    return;
  }
  response.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': contentTypeOf(resolved.file),
    'Content-Length': body.length,
    ...(basename(resolved.file).toLowerCase() === 'index.html' && { 'Cache-Control': 'no-store' }),
  });
  response.end(request.method === 'HEAD' ? undefined : body);
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
