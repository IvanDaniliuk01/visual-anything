/**
 * The routing worker: routes automatic lines around the shapes in their way off the main thread, so
 * that routing a large view never costs the canvas a frame (ADR 0039's clarification of 2026-10-26).
 * It routes one request at a time, nearest the middle of the screen first, and sends what it has
 * every few milliseconds; a newer request, or a cancel, stops the one under way between two of them.
 * It also runs the channel pass over every line drawn (`channels.ts`, ADR 0080), whole.
 *
 * When a request names libavoid's WebAssembly (ADR 0080, section 2), the worker loads it once and
 * routes with it first, container by container within its budget (`libavoid.ts`), keeping each
 * container's router for the next request; the program's router (`avoid.ts`) routes what libavoid did
 * not, and everything when the WebAssembly fails to load.
 */
import { Avoider, type AvoidLine } from './avoid';
import { AVOID_CHUNK_MS, routingOrder, type AvoidMessage, type AvoidReply } from './avoidMessages';
import { spreadChannels } from './channels';
import { LibavoidRouter, loadLibavoid } from './libavoid';

/** What this file needs of its worker scope, which the DOM types do not describe. */
interface AvoidWorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<AvoidMessage>) => void): void;
  postMessage(message: AvoidReply): void;
}

const scope = self as unknown as AvoidWorkerScope;
/** The request under way; any other stops. */
let current = -1;
/** libavoid's routers, once it loaded; null once it failed to. */
let libavoid: LibavoidRouter | null | undefined;

/** libavoid's routers, loading the WebAssembly at `wasm` the first time; null when it fails. */
async function libavoidAt(wasm: string): Promise<LibavoidRouter | null> {
  if (libavoid !== undefined) return libavoid;
  const lib = await loadLibavoid(wasm);
  libavoid = lib ? new LibavoidRouter(lib) : null;
  return libavoid;
}

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
  const { id, shapes, lines, center, existing = [] } = message;
  current = id;
  void (async () => {
    const router = message.libavoid ? await libavoidAt(message.libavoid) : null;
    if (current !== id) return;
    let began = performance.now();
    let order = routingOrder(lines, center);
    let drawn: AvoidLine[] = existing;
    if (router) {
      const routed = router.route(shapes, lines, existing);
      const results: { line: number; avoided: NonNullable<(typeof routed.results)[number]> }[] = [];
      routed.results.forEach((avoided, line) => {
        if (avoided) results.push({ line, avoided });
      });
      const others: typeof results = [];
      routed.others.forEach((avoided, line) => {
        if (avoided) others.push({ line, avoided });
      });
      // The rest keep apart from what libavoid routed, as it routed it.
      drawn = existing.map((line, at) => {
        const route = routed.others[at]?.route;
        return route ? { ...line, route } : line;
      });
      for (const { line, avoided } of results) {
        if (avoided.route) drawn.push({ ...(lines[line] as AvoidLine), route: avoided.route });
      }
      order = order.filter((line) => routed.results[line] === undefined);
      scope.postMessage({
        type: 'routes',
        id,
        results,
        ...(others.length > 0 ? { others } : {}),
        containers: routed.containers,
        done: order.length === 0,
        took: performance.now() - began,
      });
      if (order.length === 0) {
        current = -1;
        return;
      }
      began = performance.now();
    }
    // Indexing the shapes counts with the first chunk.
    const avoider = new Avoider(shapes, drawn);
    let next = 0;
    const step = () => {
      if (current !== id) return;
      began = next === 0 ? began : performance.now();
      const until = performance.now() + AVOID_CHUNK_MS;
      const results: { line: number; avoided: ReturnType<Avoider['avoid']> }[] = [];
      while (next < order.length && performance.now() < until) {
        const line = order[next] as number;
        next += 1;
        results.push({ line, avoided: avoider.avoid(lines[line] as AvoidLine) });
      }
      const done = next >= order.length;
      scope.postMessage({ type: 'routes', id, results, done, took: performance.now() - began });
      if (!done) setTimeout(step, 0);
      else if (current === id) current = -1;
    };
    step();
  })();
});
