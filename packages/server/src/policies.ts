/**
 * What the local program lets a page and its workers do, and how large a message the live connection
 * takes. The page may run only the app's own scripts, connect only to the local program, and, in static
 * mode, turn no string into HTML except through its Trusted Types policy; a worker may make no
 * connection at all; and dev mode never serves a file of the open project.
 */
import { createHash, randomBytes } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import type {
  IncomingMessage,
  OutgoingHttpHeader,
  OutgoingHttpHeaders,
  ServerResponse,
} from 'node:http';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { isInside } from './paths';

/**
 * The largest message the live connection takes from an app, in bytes. A larger one closes the
 * connection with code 1009; ws's own default would be 100 MiB.
 */
export const LIVE_MAX_PAYLOAD = 4 * 1024 * 1024;

/**
 * The policy of every JavaScript response. A policy on a script's response applies only when the script
 * runs as a worker, so the layout worker, which holds a copy of the project, can make no connection.
 * It may start workers of the page's own origin only: the layout worker runs ELK in workers of its own
 * (ADR 0015).
 */
export const WORKER_POLICY =
  "default-src 'none'; script-src 'self'; connect-src 'none'; worker-src 'self'";

/**
 * The policy of the code worker's script, which runs package code in QuickJS (ADR 0054): the worker
 * policy, and compiling WebAssembly, which the interpreter is, with `'wasm-unsafe-eval'`; still no
 * connection, no code from text and no worker of its own. Only this script gets it.
 */
export const CODE_WORKER_POLICY =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'none'; worker-src 'none'";

/** Whether a request names the code worker's script: built, `code.worker-<hash>.js`, or its source in dev mode. */
export function isCodeWorkerPath(url: string | undefined): boolean {
  const path = (url ?? '').split(/[?#]/, 1)[0] ?? '';
  return /\/code\.worker(?:-[A-Za-z0-9_-]+)?\.(?:js|ts)$/.test(path);
}

/** What a page's policy allows beyond the app's own files. */
export interface PagePolicyOptions {
  /** Whether the page must turn strings into HTML only through its `default` Trusted Types policy. */
  trustedTypes: boolean;
  /** A nonce the page's own inline scripts carry, as Vite adds it in dev mode. */
  nonce?: string;
  /** The hashes of the inline scripts the page holds, as `sha256-…`. */
  scriptHashes?: readonly string[];
}

/** The content security policy of the app's page, served from `port`. */
export function pagePolicy(port: number, options: PagePolicyOptions): string {
  const scripts = [
    "'self'",
    ...(options.nonce === undefined ? [] : [`'nonce-${options.nonce}'`]),
    ...(options.scriptHashes ?? []).map((hash) => `'${hash}'`),
  ];
  const directives = [
    "default-src 'self'",
    `script-src ${scripts.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ws://127.0.0.1:${port} ws://localhost:${port}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    ...(options.trustedTypes
      ? ["require-trusted-types-for 'script'", 'trusted-types default']
      : []),
  ];
  return directives.join('; ');
}

/** A nonce for one run of the local program: 16 random bytes in base64. */
export function createNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * The hashes of a page's inline scripts, as a policy names them. The built page may hold one, such as
 * the script that applies the theme before the first paint; it is the app's own code.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const [, attributes = '', body = ''] = match;
    if (/\bsrc\s*=/i.test(attributes)) continue;
    hashes.push(`sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`);
  }
  return [...new Set(hashes)];
}

/** The policies a response gets, by what it holds. */
export interface ContentPolicies {
  /** For HTML. */
  page: string;
  /** For JavaScript. */
  worker: string;
  /** For the code worker's script, when it differs from the other JavaScript's (ADR 0054). */
  codeWorker?: string;
}

/**
 * Gives a response, once it is written, the policy of what it holds: the page's policy to HTML, the
 * worker policy to JavaScript; every other response keeps the one set before. It works however the
 * response is written, through `writeHead` or implicitly, as Vite writes it.
 */
export function applyContentPolicies(response: ServerResponse, policies: ContentPolicies): void {
  const writeHead = response.writeHead.bind(response) as (...args: unknown[]) => ServerResponse;
  response.writeHead = (statusCode: number, ...rest: unknown[]) => {
    const at = typeof rest[0] === 'string' ? 1 : 0;
    const headers = rest[at] as OutgoingHttpHeaders | OutgoingHttpHeader[] | undefined;
    const type = contentTypeIn(headers) ?? response.getHeader('content-type');
    const codeWorker =
      policies.codeWorker !== undefined && isCodeWorkerPath(response.req?.url)
        ? policies.codeWorker
        : undefined;
    const policy = policyFor(type, { ...policies, worker: codeWorker ?? policies.worker });
    if (policy !== undefined) {
      if (headers === undefined || Array.isArray(headers)) {
        response.setHeader('Content-Security-Policy', policy);
        if (Array.isArray(headers)) rest[at] = withoutPolicy(headers);
      } else {
        rest[at] = { ...withoutPolicyKeys(headers), 'Content-Security-Policy': policy };
      }
    }
    return writeHead(statusCode, ...rest);
  };
}

function policyFor(type: unknown, policies: ContentPolicies): string | undefined {
  const value = Array.isArray(type) ? String(type[0]) : typeof type === 'string' ? type : '';
  const essence = value.split(';')[0]?.trim().toLowerCase() ?? '';
  if (essence === 'text/html') return policies.page;
  if (essence === 'text/javascript' || essence === 'application/javascript') return policies.worker;
  return undefined;
}

function contentTypeIn(headers: OutgoingHttpHeaders | OutgoingHttpHeader[] | undefined): unknown {
  if (headers === undefined) return undefined;
  if (Array.isArray(headers)) {
    for (let i = 0; i + 1 < headers.length; i += 2) {
      if (String(headers[i]).toLowerCase() === 'content-type') return headers[i + 1];
    }
    return undefined;
  }
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === 'content-type') return value;
  }
  return undefined;
}

function withoutPolicyKeys(headers: OutgoingHttpHeaders): OutgoingHttpHeaders {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'content-security-policy'),
  );
}

function withoutPolicy(headers: OutgoingHttpHeader[]): OutgoingHttpHeader[] {
  const kept: OutgoingHttpHeader[] = [];
  for (let i = 0; i + 1 < headers.length; i += 2) {
    const name = headers[i];
    const value = headers[i + 1];
    if (name === undefined || value === undefined) continue;
    if (String(name).toLowerCase() !== 'content-security-policy') kept.push(name, value);
  }
  return kept;
}

/**
 * Whether dev mode must refuse a request because it would serve a file of the open project: a path
 * under Vite's `/@fs/`, under `/@id/`, or under its root that, its links followed, lies inside the
 * project folder's real path. Vite's own deny list matches glob patterns, which a folder named
 * `a{b,c}` breaks, and its default allow list holds the whole workspace, sample project included.
 */
export async function servesProjectFile(
  request: Pick<IncomingMessage, 'url'>,
  folders: { project: string; root: string },
): Promise<boolean> {
  const target = request.url ?? '/';
  const query = target.search(/[?#]/);
  let path: string;
  try {
    path = decodeURIComponent(query === -1 ? target : target.slice(0, query));
  } catch {
    // Vite refuses what it cannot decode too; nothing is served.
    return false;
  }
  const project = await realPathOf(resolve(folders.project));
  for (const candidate of filesNamed(path, folders.root)) {
    const real = await realPathOf(candidate);
    if (real === project || isInside(project, real)) return true;
  }
  return false;
}

/** The files a request path may name for Vite: through `/@fs/`, `/@id/`, or under its root. */
function filesNamed(path: string, root: string): string[] {
  const files: string[] = [];
  for (const prefix of ['/@fs/', '/@id/']) {
    if (path.startsWith(prefix)) {
      const rest = path.slice(prefix.length);
      // On Windows the path after the prefix starts with a drive; elsewhere it lost its leading slash.
      files.push(
        /^[A-Za-z]:[\\/]/.test(rest) || isAbsolute(rest) ? resolve(rest) : resolve(`/${rest}`),
      );
    }
  }
  files.push(join(root, path));
  return files;
}

/** A path's real path, links followed; for a path that does not exist, its nearest existing folder's. */
async function realPathOf(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) return path;
    return join(await realPathOf(parent), basename(path));
  }
}
