/**
 * The worker that makes a drawing reaches no network (ADR 0068). Nothing it is given names anything to
 * load, and satori is given no picture and every font it uses; this guard is the second wall. Imported
 * first, it takes away every way Node.js and the page's globals reach out: `fetch` and the browser's
 * own requests, sockets, HTTP and HTTPS, TLS, HTTP/2, DNS and datagrams; and, so that nothing reaches
 * out through another process or thread, starting programs and workers. Each attempt is refused and
 * counted, and the worker answers with the count, which the tests check is 0.
 */
import childProcess from 'node:child_process';
import dgram from 'node:dgram';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import workerThreads from 'node:worker_threads';

let attempts = 0;

/** Refuses a way out, counting the attempt. */
function refuse(): never {
  attempts += 1;
  throw new Error('Making a drawing reaches no network.');
}

/** How many times something tried to reach the network since the guard went up. */
export function networkAttempts(): number {
  return attempts;
}

let guarded = false;

/** Takes every way to the network away from this thread. */
export function guardNetwork(): void {
  if (guarded) return;
  guarded = true;
  const replace = (owner: object, names: readonly string[]) => {
    for (const name of names) {
      Object.defineProperty(owner, name, {
        value: refuse,
        writable: false,
        configurable: false,
        enumerable: false,
      });
    }
  };
  replace(globalThis, ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport']);
  replace(http, ['request', 'get']);
  replace(https, ['request', 'get']);
  replace(http2, ['connect']);
  replace(net, ['connect', 'createConnection']);
  replace(net.Socket.prototype, ['connect']);
  replace(tls, ['connect']);
  replace(dgram, ['createSocket']);
  replace(childProcess, [
    'spawn',
    'spawnSync',
    'exec',
    'execSync',
    'execFile',
    'execFileSync',
    'fork',
  ]);
  replace(workerThreads, ['Worker']);
  replace(dns, ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'lookupService']);
  replace(dnsPromises, [
    'lookup',
    'resolve',
    'resolve4',
    'resolve6',
    'resolveAny',
    'lookupService',
  ]);
  // What `import { request } from 'node:http'` gives follows the replacements too.
  syncBuiltinESMExports();
}

guardNetwork();
