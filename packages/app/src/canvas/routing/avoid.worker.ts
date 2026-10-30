/**
 * The routing worker: routes automatic lines around the shapes in their way (`avoid.ts`) off the main
 * thread, so that routing a large view never costs the canvas a frame (ADR 0039's clarification of
 * 2026-10-26). It routes one request at a time, nearest the middle of the screen first, and sends what
 * it has every few milliseconds; a newer request, or a cancel, stops the one under way between two
 * of them. It also runs the channel pass over every line drawn (`channels.ts`, ADR 0080), whole.
 */
import { Avoider } from './avoid';
import { AVOID_CHUNK_MS, routingOrder, type AvoidMessage, type AvoidReply } from './avoidMessages';
import { spreadChannels } from './channels';

/** What this file needs of its worker scope, which the DOM types do not describe. */
interface AvoidWorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<AvoidMessage>) => void): void;
  postMessage(message: AvoidReply): void;
}

const scope = self as unknown as AvoidWorkerScope;
/** The request under way; any other stops. */
let current = -1;

scope.addEventListener('message', (event) => {
  const message = event.data;
  if (message.type === 'cancel') {
    if (message.id === current) current = -1;
    return;
  }
  if (message.type === 'channels') {
    const began = performance.now();
    const output = spreadChannels(message.input);
    scope.postMessage({
      type: 'channels',
      id: message.id,
      output,
      took: performance.now() - began,
    });
    return;
  }
  const { id, shapes, lines, center, existing } = message;
  current = id;
  // Indexing the shapes counts with the first chunk.
  let began = performance.now();
  const avoider = new Avoider(shapes, existing);
  const order = routingOrder(lines, center);
  let next = 0;
  const step = () => {
    if (current !== id) return;
    began = next === 0 ? began : performance.now();
    const until = performance.now() + AVOID_CHUNK_MS;
    const results: { line: number; avoided: ReturnType<Avoider['avoid']> }[] = [];
    while (next < order.length && performance.now() < until) {
      const line = order[next] as number;
      next += 1;
      results.push({ line, avoided: avoider.avoid(lines[line] as (typeof lines)[number]) });
    }
    const done = next >= order.length;
    scope.postMessage({ type: 'routes', id, results, done, took: performance.now() - began });
    if (!done) setTimeout(step, 0);
    else if (current === id) current = -1;
  };
  step();
});
