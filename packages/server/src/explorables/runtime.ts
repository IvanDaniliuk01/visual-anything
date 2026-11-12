/**
 * The `va` runtime the frame builder puts first in every explorable's frame (ADR 0107): the app's
 * own, `app/src/explorables/runtime/` (A10.2), bundled into one plain script and kept as a generated
 * module, so that the sources and the single executable serve the same text and nothing is built
 * while the program runs. It answers the app's hello and pings, gives the page `va.data` and the
 * theme's variables, and takes the still pictures. The listener takes the runtime as a function
 * (`startServer`'s `explorableRuntime`), so that tests can give it another.
 */
import { VA_RUNTIME } from '@visual-anything/app/src/explorables/runtime/va-runtime.generated';

/** The runtime the listener serves. */
export function frameRuntime(): string {
  return VA_RUNTIME;
}
