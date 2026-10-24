import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom draws nothing: like a browser without canvas support, it has no 2D or WebGL context. Answer
// that directly instead of letting jsdom report "not implemented" when PixiJS probes for one on import.
HTMLCanvasElement.prototype.getContext = () => null;

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
