/** The notice names libavoid-js as the app ships it (ADR 0080, ADR 0047). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIBAVOID_JS_VERSION, noticeText } from './notices';

describe('the notice of what ships', () => {
  it('names the libavoid-js the app depends on, its license, and its replaceable WebAssembly', () => {
    const app = JSON.parse(
      readFileSync(new URL('../../app/package.json', import.meta.url), 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(app.dependencies['libavoid-js']).toBe(LIBAVOID_JS_VERSION);
    const text = noticeText([], '22.13.0');
    expect(text).toContain(`libavoid-js ${LIBAVOID_JS_VERSION}`);
    expect(text).toContain('License: LGPL-2.1-or-later');
    expect(text).toContain('libavoid.wasm');
  });
});
