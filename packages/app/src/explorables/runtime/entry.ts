/**
 * The runtime's entry point: what the bundle runs first in the frame (`bundle.ts`). It defines
 * `window.va`, which no later script can replace.
 */
import { startVa, type VaWindow } from './va';

Object.defineProperty(window, 'va', {
  value: startVa(window as unknown as VaWindow),
  enumerable: true,
});
