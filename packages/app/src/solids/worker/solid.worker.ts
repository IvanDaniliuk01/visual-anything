/**
 * The solid worker's entry, which `startSolidWorker` starts by its address (ADR 0075). three.js runs
 * here and nowhere else: one renderer on one `OffscreenCanvas` draws every picture and turning frame.
 * The worker keeps the policy every worker has, which allows no connection (ADR 0027, ADR 0054): it is
 * handed bytes and gives back pictures, decodes textures from bytes with `createImageBitmap`, and
 * makes no address. A worker without WebGL says its limits and refuses everything as `unavailable`,
 * so that every solid stays its placeholder.
 */
import type { SolidWorkerReply } from '../protocol';
import type { DecodedImage } from './build';
import { createThreeGpu } from './gpu';
import { SolidWorkerHost, type SolidGpu } from './host';

/** What this file needs of its worker scope, which the DOM types do not describe. */
interface SolidWorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  postMessage(message: SolidWorkerReply, transfer: Transferable[]): void;
  requestAnimationFrame?: (callback: () => void) => number;
}

const scope = self as unknown as SolidWorkerScope;

function startGpu(): SolidGpu | undefined {
  if (typeof OffscreenCanvas === 'undefined') return undefined;
  try {
    return createThreeGpu(new OffscreenCanvas(1, 1));
  } catch {
    return undefined;
  }
}

/** Decodes a texture from its bytes, as glTF reads it: not flipped, its alpha and colors untouched. */
async function decodeImage(bytes: Uint8Array, mimeType: string): Promise<DecodedImage | undefined> {
  if (typeof createImageBitmap === 'undefined') return undefined;
  const blob = new Blob([bytes.slice()], { type: mimeType });
  return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}

/** The SHA-256 of a file, by the platform's own digest, which is far faster than the core's. */
async function digest(bytes: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice()));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const host = new SolidWorkerHost({
  post: (reply, transfer) => scope.postMessage(reply, transfer),
  gpu: startGpu(),
  decodeImage,
  ...(typeof crypto !== 'undefined' && crypto.subtle ? { digest } : {}),
  schedule: (callback) => {
    if (scope.requestAnimationFrame) scope.requestAnimationFrame(callback);
    else setTimeout(callback, 16);
  },
  now: () => performance.now(),
});
host.start();
scope.addEventListener('message', (event) => {
  void host.receive(event.data);
});
