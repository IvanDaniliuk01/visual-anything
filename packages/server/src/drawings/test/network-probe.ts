/**
 * A worker for the network guard's test: with the guard up, as the drawing's worker has it, it tries
 * each way to the network, and answers with what each did and how many attempts the guard counted.
 */
import { networkAttempts } from '../network';
import dns from 'node:dns';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import { request } from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { parentPort } from 'node:worker_threads';

const tries: [string, () => unknown][] = [
  ['fetch', () => fetch('http://127.0.0.1:9/')],
  ['XMLHttpRequest', () => new (globalThis as unknown as { XMLHttpRequest: new () => unknown }).XMLHttpRequest()],
  ['WebSocket', () => new WebSocket('ws://127.0.0.1:9/')],
  ['http.get', () => http.get('http://127.0.0.1:9/')],
  ['https.request', () => request('https://127.0.0.1:9/')],
  ['net.connect', () => net.connect(9, '127.0.0.1')],
  ['a socket', () => new net.Socket().connect(9, '127.0.0.1')],
  ['tls.connect', () => tls.connect(9, '127.0.0.1')],
  ['dns.lookup', () => dns.lookup('example.com', () => undefined)],
  ['dns/promises lookup', () => lookup('example.com')],
];

const results: Record<string, string> = {};
for (const [name, attempt] of tries) {
  try {
    const value = attempt();
    // A promise that was made at all is a way out that the guard missed.
    results[name] = value instanceof Promise ? 'made a request' : 'made a connection';
  } catch (error) {
    results[name] = error instanceof Error ? error.message : String(error);
  }
}
parentPort?.postMessage({ results, attempts: networkAttempts() });
