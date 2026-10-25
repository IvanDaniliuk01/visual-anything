import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { resetLanguageForTests } from '../i18n/language';

// jsdom draws nothing: like a browser without canvas support, it has no 2D or WebGL context. Answer
// that directly instead of letting jsdom report "not implemented" when PixiJS probes for one on import.
HTMLCanvasElement.prototype.getContext = () => null;

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  resetLanguageForTests();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
