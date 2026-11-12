/**
 * Helpers for the script libraries' tests: tarballs made by hand, entry by entry, and a stand-in for
 * the npm registry on 127.0.0.1 that the fetcher reaches through an injected request, so that no test
 * reaches the internet.
 */
import { createHash } from 'node:crypto';
import { createServer, request, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import type { Requester, Resolver } from '../../live-fetch';

/** One entry of a tarball made by hand. */
export interface TarEntry {
  name: string;
  body?: string | Buffer;
  /** The type flag: `0` a file (the default), `5` a folder, `2` a symbolic link, and so on. */
  type?: string;
  linkname?: string;
  /** A size to write in place of the body's own. */
  size?: number;
  prefix?: string;
}

function field(header: Buffer, at: number, length: number, value: string): void {
  header.write(value, at, length, 'utf8');
}

/** A ustar header and body for an entry, its checksum worked out. */
export function tarEntry(entry: TarEntry): Buffer {
  const body = Buffer.isBuffer(entry.body) ? entry.body : Buffer.from(entry.body ?? '', 'utf8');
  const header = Buffer.alloc(512);
  field(header, 0, 100, entry.name);
  field(header, 100, 8, '0000644\0');
  field(header, 108, 8, '0000000\0');
  field(header, 116, 8, '0000000\0');
  field(header, 124, 12, `${(entry.size ?? body.length).toString(8).padStart(11, '0')}\0`);
  field(header, 136, 12, '00000000000\0');
  field(header, 156, 1, entry.type ?? '0');
  if (entry.linkname !== undefined) field(header, 157, 100, entry.linkname);
  field(header, 257, 6, 'ustar\0');
  field(header, 263, 2, '00');
  if (entry.prefix !== undefined) field(header, 345, 155, entry.prefix);
  header.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of header) sum += byte;
  field(header, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `);
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding]);
}

/** A pax header giving the next entry's path. */
export function paxEntry(records: Record<string, string>): Buffer {
  const lines = Object.entries(records).map(([key, value]) => {
    const rest = ` ${key}=${value}\n`;
    let length = rest.length + 1;
    while (`${length}${rest}`.length !== length) length = `${length}${rest}`.length;
    return `${length}${rest}`;
  });
  return tarEntry({ name: 'PaxHeader', type: 'x', body: lines.join('') });
}

/** A tar archive of entries, with its two blocks of zeros. */
export function tar(entries: readonly (TarEntry | Buffer)[]): Buffer {
  return Buffer.concat([
    ...entries.map((each) => (Buffer.isBuffer(each) ? each : tarEntry(each))),
    Buffer.alloc(1024),
  ]);
}

/** A gzipped tarball of files under `package/`. */
export function tarball(files: Record<string, string | Buffer>): Buffer {
  return gzipSync(
    tar(Object.entries(files).map(([name, body]) => ({ name: `package/${name}`, body }))),
  );
}

/** The registry's integrity of a tarball: `sha512-` and its digest in base64. */
export function integrityOf(bytes: Buffer): string {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

/** What the stand-in registry answers, by path: a status and a body. */
export type Routes = Map<string, { status?: number; body: Buffer | string; delay?: number }>;

/** A stand-in for the npm registry on 127.0.0.1, with the request and resolver that reach it. */
export interface RegistryStub {
  routes: Routes;
  /** The paths asked for, in order. */
  asked: string[];
  request: Requester;
  resolve: Resolver;
  close(): Promise<void>;
}

/** The address the stand-in resolver gives the registry's name: one on the internet. */
export const PUBLIC_ADDRESS = '104.16.0.35';

export async function startRegistryStub(routes: Routes = new Map()): Promise<RegistryStub> {
  const asked: string[] = [];
  const server: Server = createServer((incoming, response) => {
    const path = incoming.url ?? '';
    asked.push(path);
    const route = routes.get(path);
    const answer = () => {
      if (route === undefined) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(route.status ?? 200, { 'content-type': 'application/octet-stream' });
      response.end(route.body);
    };
    if (route?.delay !== undefined) setTimeout(answer, route.delay);
    else answer();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    routes,
    asked,
    // The fetcher's options name the registry; the stand-in on 127.0.0.1 answers in its place.
    request: (_secure, options, onResponse) =>
      request(
        {
          host: '127.0.0.1',
          port,
          path: options.path ?? '/',
          method: 'GET',
          headers: options.headers ?? {},
          agent: false,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        },
        onResponse,
      ),
    resolve: () => Promise.resolve([{ address: PUBLIC_ADDRESS, family: 4 }]),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A version's document as the registry gives it, with its tarball's address and integrity. */
export function versionDocument(
  npm: string,
  version: string,
  bytes: Buffer,
  fields: Record<string, unknown> = {},
): string {
  const name = npm.includes('/') ? npm.slice(npm.indexOf('/') + 1) : npm;
  return JSON.stringify({
    name: npm,
    version,
    license: 'ISC',
    dist: {
      tarball: `https://registry.npmjs.org/${npm}/-/${name}-${version}.tgz`,
      integrity: integrityOf(bytes),
    },
    ...fields,
  });
}
