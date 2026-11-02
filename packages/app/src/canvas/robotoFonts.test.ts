import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ROBOTO,
  ROBOTO_MONO,
  forgetRobotoFonts,
  loadRobotoFonts,
  robotoLoaded,
} from './robotoFonts';

/** Gives the document a set of fonts, which jsdom lacks. */
function withFonts(add: (face: unknown) => unknown): void {
  Object.defineProperty(document, 'fonts', { value: { add }, configurable: true });
}

afterEach(() => {
  forgetRobotoFonts();
  vi.unstubAllGlobals();
  delete (document as { fonts?: unknown }).fonts;
});

describe('Roboto on the canvas (ADR 0083, F0)', () => {
  it('loads nothing where fonts cannot be made, and says so', async () => {
    vi.stubGlobal('FontFace', undefined);
    await expect(loadRobotoFonts()).resolves.toBe(false);
    expect(robotoLoaded()).toBe(false);
  });

  it('loads the six fonts from the bytes the app ships, under families of their own', async () => {
    const made: { family: string; bytes: unknown; descriptors: FontFaceDescriptors }[] = [];
    const added: unknown[] = [];
    class FakeFace {
      constructor(
        readonly family: string,
        bytes: unknown,
        descriptors: FontFaceDescriptors,
      ) {
        made.push({ family, bytes, descriptors });
      }
      load(): Promise<this> {
        return Promise.resolve(this);
      }
    }
    vi.stubGlobal('FontFace', FakeFace);
    withFonts((face) => added.push(face));
    await expect(loadRobotoFonts()).resolves.toBe(true);
    expect(robotoLoaded()).toBe(true);
    expect(
      made.map(({ family, descriptors }) => [family, descriptors.weight, descriptors.style]),
    ).toEqual([
      [ROBOTO, '400', 'normal'],
      [ROBOTO, '500', 'normal'],
      [ROBOTO, '700', 'normal'],
      [ROBOTO, '400', 'italic'],
      [ROBOTO, '700', 'italic'],
      [ROBOTO_MONO, '400', 'normal'],
    ]);
    // Bytes, not addresses: nothing is fetched. WOFF files start with "wOFF".
    for (const { bytes } of made) {
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(String.fromCharCode(...(bytes as Uint8Array).slice(0, 4))).toBe('wOFF');
    }
    expect(added).toHaveLength(6);
    // Loaded once, however often asked.
    await loadRobotoFonts();
    expect(made).toHaveLength(6);
  });

  it('never rejects: a font that fails to load leaves the system’s fonts', async () => {
    class FailingFace {
      load(): Promise<never> {
        return Promise.reject(new Error('broken'));
      }
    }
    vi.stubGlobal('FontFace', FailingFace);
    withFonts(() => undefined);
    await expect(loadRobotoFonts()).resolves.toBe(false);
  });
});
