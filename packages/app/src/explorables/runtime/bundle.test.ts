// @vitest-environment node
/**
 * The `va` runtime the listener serves (ADR 0107) is the bundle of `entry.ts`, kept in
 * `va-runtime.generated.ts`: it must be current, one classic script with no imports, and hold
 * nothing the frame's policy refuses (no `eval`, no `Function` made of a string), and no module of
 * the app but the runtime, the theme's colors and the core's message checks.
 */
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { bundleRuntime } from './bundle';
import { runtimeModule } from './generate';
import { readFileSync } from 'node:fs';
import { VA_RUNTIME } from './va-runtime.generated';

describe('the va runtime’s bundle', () => {
  it('is the one generated, and stays small', { timeout: 60_000 }, async () => {
    const { code, modules } = await bundleRuntime();
    const generated = readFileSync(new URL('./va-runtime.generated.ts', import.meta.url), 'utf8');
    expect(
      generated,
      'Run pnpm exec tsx packages/app/src/explorables/runtime/generate.ts and commit the file.',
    ).toBe(runtimeModule(code));
    expect(VA_RUNTIME).toBe(code);
    expect(code.length).toBeLessThan(32 * 1024);
    for (const each of modules) {
      expect(each).toMatch(
        /app[\/]src[\/](explorables[\/]runtime[\/]|theme[\/]themes\.ts$)|core[\/]src[\/](ids|explorables[\/](messages|types))\.ts$/,
      );
    }
  });

  it('is a classic script that compiles no string into code', () => {
    expect(() => new Script(VA_RUNTIME)).not.toThrow();
    expect(VA_RUNTIME).not.toMatch(/\beval\b|\bFunction\(|\bimport\(|\bimport\s|\bexport\s/);
    expect(VA_RUNTIME).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });
});
