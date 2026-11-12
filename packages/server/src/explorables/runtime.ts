/**
 * The `va` runtime the frame builder puts first in every explorable's frame (ADR 0107). The app's own
 * runtime, with html-to-image built in, is A10.2's; until it lands, the listener serves this stand-in,
 * which answers the app's hello and pings and gives the page `va.data`, so that a frame runs and its
 * watchdog keeps it. The listener takes the runtime as a function, so that the real one replaces this
 * without touching the listener.
 */
export const STAND_IN_RUNTIME = `(() => {
  'use strict';
  const listeners = [];
  let port;
  const va = {
    api: 1,
    data: undefined,
    on(kind, listener) {
      if (kind === 'change' && typeof listener === 'function') listeners.push(listener);
    },
    ready() {
      if (port) port.postMessage({ kind: 'va/ready' });
    },
    select(id) {
      if (port && typeof id === 'string') port.postMessage({ kind: 'va/select', id });
    },
    onStill() {},
  };
  Object.defineProperty(window, 'va', { value: Object.freeze(va) });
  const take = (data) => {
    va.data = data;
    for (const listener of listeners) {
      try {
        listener(data);
      } catch (error) {
        if (port) port.postMessage({ kind: 'va/error', message: String(error).slice(0, 2000) });
      }
    }
  };
  window.addEventListener('message', (event) => {
    if (port || event.source !== window.parent || !event.ports[0]) return;
    const hello = event.data;
    if (!hello || hello.kind !== 'va/hello' || hello.api !== 1) return;
    port = event.ports[0];
    port.onmessage = (message) => {
      const data = message.data;
      if (!data || typeof data !== 'object') return;
      if (data.kind === 'va/ping') port.postMessage({ kind: 'va/pong', at: data.at });
      else if (data.kind === 'va/data') take(data.data);
    };
    take(hello.data);
  });
})();`;

/** The runtime the listener serves now. */
export function frameRuntime(): string {
  return STAND_IN_RUNTIME;
}
