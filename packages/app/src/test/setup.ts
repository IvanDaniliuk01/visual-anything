import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { setTabUseForTests, trackTabUse } from '../guidance/tabs';
import { resetLanguageForTests } from '../i18n/language';

/**
 * Whether the test runs in jsdom. A test of what runs outside the browser, such as the exports the
 * command line writes, runs in Node instead (`@vitest-environment node`), where there is no page.
 */
const inPage = typeof window !== 'undefined';

// jsdom draws nothing: like a browser without canvas support, it has no 2D or WebGL context. Answer
// that directly instead of letting jsdom report "not implemented" when PixiJS probes for one on import.
if (inPage) HTMLCanvasElement.prototype.getContext = () => null;

// Each test file is one tab alone: Node's own BroadcastChannel would let test files running at the
// same time hear each other as tabs of one browser (`guidance/tabs.ts`).
setTabUseForTests(trackTabUse({ channel: undefined, shown: true }));

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  resetLanguageForTests();
  if (!inPage) return;
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
