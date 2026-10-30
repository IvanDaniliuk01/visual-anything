/**
 * The notice names only what ships. libavoid-js left the shipped app on 2026-10-30 (ADR 0080's
 * clarification "libavoid leaves the shipped app", ADR 0047): it is a development dependency of the
 * app, used by the quality tests alone, so the notice does not name it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { noticeText } from './notices';

describe('the notice of what ships', () => {
  it('does not name libavoid-js, which the app keeps for its tests alone', () => {
    const app = JSON.parse(
      readFileSync(new URL('../../app/package.json', import.meta.url), 'utf8'),
    ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(app.dependencies['libavoid-js']).toBeUndefined();
    expect(app.devDependencies['libavoid-js']).toBeDefined();
    const text = noticeText([], '22.13.0');
    expect(text).not.toContain('libavoid');
  });
});
