/**
 * The solid worker's entry, which `startSolidWorker` starts (ADR 0075). Until M9's solid worker task
 * builds it with three.js, it draws nothing: it says its limits, and refuses every load, draw, turning
 * and pick as `unavailable`, so that every solid stays its placeholder. It imports only the protocol.
 */
import {
  LARGEST_SOLID_PICTURE,
  SOLID_WORKER_MEMORY,
  readSolidWorkerRequest,
  type SolidWorkerReply,
} from '../protocol';

/** What this file needs of its worker scope, which the DOM types do not describe. */
interface SolidWorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  postMessage(message: SolidWorkerReply): void;
}

const scope = self as unknown as SolidWorkerScope;
const UNAVAILABLE = 'This build of Visual Anything draws no solids yet.';

scope.postMessage({
  type: 'ready',
  limits: { largestPicture: LARGEST_SOLID_PICTURE, memoryBytes: SOLID_WORKER_MEMORY },
});

scope.addEventListener('message', (event) => {
  const read = readSolidWorkerRequest(event.data);
  if (!read.ok) return;
  const request = read.value;
  switch (request.type) {
    case 'load':
    case 'draw':
    case 'pick':
      scope.postMessage({
        type: 'refused',
        id: request.id,
        code: 'unavailable',
        message: UNAVAILABLE,
      });
      return;
    case 'turn/start':
      scope.postMessage({
        type: 'refused',
        turn: request.turn,
        code: 'unavailable',
        message: UNAVAILABLE,
      });
      return;
    default:
      return;
  }
});
