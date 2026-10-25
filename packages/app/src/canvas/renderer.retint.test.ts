/**
 * The name under a drawing is written on what its shape sits on (ADR-0027): recoloring the container
 * tints it again, in the frame that shows the container's new fill, though the drawing's own tile
 * does not change.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { ImageDefinition } from '@visual-anything/schema';
import { Color, Container, Texture } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { readableTextColors } from './colors';
import type { TextFactory } from './draw';
import { indexScene } from './hit';
import type { ImagePlatform } from './images';
import { CanvasRenderer } from './renderer';
import { buildScene } from './scene';
import type { LabelPaint } from './theme/painter';
import { SWAP_WITHIN } from './theme/restyle';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

/** A 1×1 PNG, which the core's cleaner accepts. */
const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const PHOTO: ImageDefinition = {
  kind: 'bitmap',
  id: 'clinic.photo',
  name: 'Photo',
  format: 'png',
  width: 1,
  height: 1,
  data: PIXEL,
};

/** A platform that decodes every bitmap at once, into a blank texture. */
class FakePlatform implements ImagePlatform<Texture, object> {
  now = () => performance.now();
  bytesOf = (base64: string) => new Uint8Array(base64.length);
  decodeBitmap = () => Promise.resolve({});
  loadSvg = () => Promise.resolve({});
  texture = () => new Texture({ source: Texture.WHITE.source });
  atlasTexture = () => new Texture({ source: Texture.WHITE.source });
  flush = () => undefined;
  destroyTexture = () => undefined;
  destroyPage = () => undefined;
  releasePicture = () => undefined;
}

/** Labels as plain containers named by their text, which jsdom can make. */
const counting: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

const VIEW = 'system-overview';

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

/** The sample with WhatsApp, inside Clinic booking, drawn by a photo. */
function withDrawing(): ProjectSnapshot {
  const sample = loadSample();
  return {
    ...sample,
    packages: sample.packages.map((file) =>
      file.id === 'clinic' ? { ...file, images: [PHOTO] } : file,
    ),
    model: {
      ...sample.model,
      elements: sample.model.elements.map((element) =>
        element.id === 'whatsapp'
          ? { ...element, appearance: { image: { image: 'clinic.photo', placement: 'drawing' } } }
          : element,
      ),
    },
  };
}

function applied(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
  return outcome.state;
}

async function started(): Promise<CanvasRenderer> {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1200 });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: 800 });
  const renderer = new CanvasRenderer(
    host,
    {
      onFailure: (error) => {
        throw error;
      },
    },
    { text: counting, images: new FakePlatform() },
  );
  (FakeApplication.created.at(-1) as FakeApplication).finishInit();
  await Promise.resolve();
  await Promise.resolve();
  return renderer;
}

async function frames(renderer: CanvasRenderer, count: number): Promise<void> {
  for (let frame = 0; frame < count; frame++) {
    renderer.renderNow();
    for (let tick = 0; tick < 4; tick++) await Promise.resolve();
  }
}

/** The tint of the name written under WhatsApp's picture. */
function nameTint(renderer: CanvasRenderer): number | undefined {
  const tiles = (renderer as unknown as { tiles: Map<string, { labelPaint: LabelPaint[] }> }).tiles;
  for (const tile of tiles.values()) {
    for (const record of tile.labelPaint) {
      if (record.role === 'name' && record.shape === 'clinic-booking/whatsapp') {
        return record.label.tint;
      }
    }
  }
  return undefined;
}

const tintOf = (color: string) => new Color(color).toNumber();

describe('the name under a drawing', () => {
  it('is tinted again when its container is recolored, in the frame that shows the new fill', async () => {
    const renderer = await started();
    const project = withDrawing();
    renderer.show(indexScene(buildScene(project, VIEW)));
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    await frames(renderer, 20);
    // The test's labels are written white, and only a tint colours them.
    expect(nameTint(renderer)).toBe(tintOf('#FFFFFF'));

    // A light fill: the name reads in dark text on it.
    const recolored = applied(project, {
      type: 'update-element',
      id: 'clinic-booking',
      changes: { appearanceTraits: { fill: '#FFF4D6' } },
    });
    renderer.show(indexScene(buildScene(recolored, VIEW)));
    let shown = 0;
    for (let frame = 1; frame <= SWAP_WITHIN + 2; frame++) {
      await frames(renderer, 1);
      if (!renderer.switching) {
        shown = frame;
        break;
      }
    }
    expect(shown).toBeGreaterThan(0);
    expect(readableTextColors('#FFF4D6').name).not.toBe('#FFFFFF');
    expect(nameTint(renderer)).toBe(tintOf(readableTextColors('#FFF4D6').name));
    renderer.destroy();
  });
});
