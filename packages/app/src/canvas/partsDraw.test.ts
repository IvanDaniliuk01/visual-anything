/**
 * What the canvas draws for anchored parts (ADR 0067): nothing of their own in the tiles, which draw
 * their drawing's picture; over the picture, the covers of parts a filter hides, the veils of faint
 * parts, their own pictures in a faint drawing and an overlay's fill, stroke and opacity; far out,
 * their simplified outlines in their main colors. A part drawn on its own draws its part's picture.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { Container, Graphics, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { beyondBoxes } from '../test/beyond';
import { DIMMED_ALPHA } from './colors';
import { drawShapeBlocks, drawShapeOutlines, writeShapeLabels } from './draw';
import { ImageStore, type ImagePlatform } from './images';
import { pictureOf, type ImageView } from './images-draw';
import { namedBeside } from './namesBeside';
import { writesNameInside } from './outlined';
import { overlayLookOfPart } from './overlays/decorate';
import {
  PARTS_PICTURES,
  PartLayer,
  drawPartBlocks,
  drawPartMarks,
  partMarksOf,
  pictureShows,
  writePartBadges,
  type DrawingMarks,
} from './partsDraw';
import { buildScene, type ElementShape, type Scene } from './scene';

const VIEW = 'anatomy';
const NONE: ReadonlySet<string> = new Set();

function shapeOf(scene: Scene, key: string): ElementShape {
  const found = scene.shapes.find((shape) => shape.key === key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

function changed(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(state, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

/** How many things a drawing holds, as PixiJS records them. */
function drawnCount(graphics: Graphics): number {
  return graphics.context.instructions.length;
}

/** The colors a drawing fills with, in order. */
function fills(graphics: Graphics): { color: number; alpha: number }[] {
  return graphics.context.instructions
    .filter((each) => each.action === 'fill')
    .map((each) => {
      const style = (each.data as { style: { color: number; alpha: number } }).style;
      return { color: style.color, alpha: style.alpha };
    });
}

const hex = (color: string) => Number.parseInt(color.slice(1), 16);

describe('anchored parts in the tiles', () => {
  it('draw nothing of their own in full, their drawing’s picture showing, and far out their main color', () => {
    const scene = buildScene(beyondBoxes(), VIEW);
    const left = shapeOf(scene, 'body/left');
    const full = new Graphics();
    drawShapeOutlines(full, [left]);
    expect(drawnCount(full)).toBe(0);
    const blocks = new Graphics();
    drawShapeBlocks(blocks, [left]);
    expect(fills(blocks)[0]?.color).toBe(hex('#C0392B'));
    // A content below the picture is drawn as any shape.
    drawShapeOutlines(full, [shapeOf(scene, 'body/extra')]);
    expect(drawnCount(full)).toBeGreaterThan(0);
  });

  it('write their name only when it fits whole in their label area, and never their component’s', () => {
    const named = (name: string) => {
      const start = beyondBoxes();
      const state: ProjectSnapshot = {
        ...start,
        model: {
          ...start.model,
          elements: start.model.elements.map((each) =>
            each.id === 'left' ? { ...each, name } : each,
          ),
        },
      };
      return shapeOf(buildScene(state, VIEW), 'body/left');
    };
    const written = (shape: ElementShape) =>
      writeShapeLabels([shape], true, (options) => {
        const label = new Container();
        label.label = String(options.text);
        return label;
      }).map((each) => each.label);
    const short = named('LV');
    expect(writesNameInside(short)).toBe(true);
    expect(namedBeside(short)).toBe(false);
    expect(written(short)).toEqual(['LV']);
    // A name too long for the part is written beside it by the marks, never cut inside it.
    const long = named('Ventriculussinistercordis');
    expect(writesNameInside(long)).toBe(false);
    expect(namedBeside(long)).toBe(true);
    expect(written(long)).toEqual([]);
  });
});

describe('what is drawn over anchored parts', () => {
  const scene = buildScene(beyondBoxes(), VIEW);
  const marksOf = (hidden = NONE, dimmed = NONE): DrawingMarks => {
    const [marks] = partMarksOf(scene, hidden, dimmed);
    if (!marks) throw new Error('No drawing with parts.');
    return marks;
  };

  it('lists each drawing’s anchored parts in its picture’s order, with nothing over them at first', () => {
    const marks = marksOf();
    expect(marks.drawing.key).toBe('body');
    expect(marks.parts.map((each) => each.shape.key)).toEqual(['body/left', 'body/right']);
    expect(marks.parts[0]).toMatchObject({
      color: '#C0392B',
      faint: false,
      covered: false,
      veiled: false,
      ownPicture: false,
    });
    const graphics = new Graphics();
    drawPartMarks(graphics, marks, 'light');
    expect(drawnCount(graphics)).toBe(0);
  });

  it('covers a part a filter hides with its drawing’s fill, opaque', () => {
    const marks = marksOf(new Set(['body/left']));
    expect(marks.parts[0]?.covered).toBe(true);
    const graphics = new Graphics();
    drawPartMarks(graphics, marks, 'light');
    expect(fills(graphics)).toEqual([{ color: hex(marks.drawing.fill), alpha: 1 }]);
    // At the middle levels it is not drawn at all.
    const middle = new Graphics();
    drawPartBlocks(middle, marks);
    expect(fills(middle)).toEqual([{ color: hex('#2980B9'), alpha: 1 }]);
  });

  it('veils a faint part in a drawing at full strength, and draws a part at full strength in a faint drawing with its own picture', () => {
    const veiled = marksOf(NONE, new Set(['body/left']));
    expect(veiled.parts[0]).toMatchObject({ faint: true, veiled: true, ownPicture: false });
    const graphics = new Graphics();
    drawPartMarks(graphics, veiled, 'light');
    expect(fills(graphics)).toEqual([{ color: hex(veiled.drawing.fill), alpha: 1 - DIMMED_ALPHA }]);

    const faintDrawing = marksOf(NONE, new Set(['body', 'body/right']));
    expect(faintDrawing.faint).toBe(true);
    expect(faintDrawing.parts.map((each) => [each.ownPicture, each.veiled])).toEqual([
      [true, false],
      [false, false],
    ]);
    // Until its picture is ready, the part is filled in its main color.
    const placeholder = new Graphics();
    drawPartMarks(placeholder, faintDrawing, 'light');
    expect(fills(placeholder)).toEqual([{ color: hex('#C0392B'), alpha: 1 }]);
    // Once it is drawn, nothing is filled in its place.
    const drawn = new Graphics();
    drawPartMarks(drawn, faintDrawing, 'light', () => true);
    expect(fills(drawn)).toEqual([]);
  });

  it('draws an overlay’s fill, opacity and stroke over a part, and its fill at the middle levels', () => {
    const [marks] = partMarksOf(scene, NONE, NONE, (shape) =>
      shape.key === 'body/left' ? { fill: '#FFAA00', stroke: '#112233', opacity: 0.5 } : undefined,
    );
    const left = marks?.parts[0];
    expect(left).toMatchObject({ fill: '#FFAA00', stroke: '#112233', opacity: 0.5 });
    const graphics = new Graphics();
    drawPartMarks(graphics, marks as DrawingMarks, 'light');
    expect(fills(graphics)).toEqual([
      { color: hex('#FFAA00'), alpha: 1 },
      { color: hex((marks as DrawingMarks).drawing.fill), alpha: 0.5 },
    ]);
    expect(
      graphics.context.instructions.filter((each) => each.action === 'stroke').length,
    ).toBeGreaterThan(0);
    const middle = new Graphics();
    drawPartBlocks(middle, marks as DrawingMarks);
    expect(fills(middle)[0]).toEqual({ color: hex('#FFAA00'), alpha: 1 });
  });

  it('writes an overlay’s badge at its part’s label point', () => {
    const [marks] = partMarksOf(scene, NONE, new Set(['body/right']), (shape) =>
      shape.key === 'body/left' || shape.key === 'body/right' ? { badge: 'Warm' } : undefined,
    );
    const texts = writePartBadges(marks as DrawingMarks, (options) => {
      const label = new Container();
      label.label = String(options.text);
      label.position.set(options.x ?? 0, options.y ?? 0);
      return label;
    });
    expect(texts.map((each) => each.label)).toEqual(['Warm', 'Warm']);
    const left = shapeOf(scene, 'body/left');
    expect(texts[0]?.x).toBeCloseTo(left.rect.x + left.rect.width / 2, 0);
    // A faint part's badge is faint too.
    expect(texts.map((each) => each.alpha)).toEqual([1, DIMMED_ALPHA]);
  });

  it('reads an overlay’s look from the decorated scene', () => {
    const start = beyondBoxes();
    const toned: ProjectSnapshot = {
      ...start,
      model: {
        ...start.model,
        elements: start.model.elements.map((each) =>
          each.id === 'left' ? { ...each, attributes: { tone: 'warm' } } : each,
        ),
      },
    };
    const state = changed(toned, {
      type: 'set-overlays',
      view: VIEW,
      overlays: [
        {
          id: 'tone',
          of: 'elements',
          attribute: 'tone',
          channel: 'fill',
          mapping: { kind: 'discrete', cases: [{ value: 'warm', color: '#FFAA00' }] },
        },
      ],
    });
    const decorated = buildScene(state, VIEW);
    expect(overlayLookOfPart(shapeOf(decorated, 'body/left'))).toMatchObject({ fill: '#FFAA00' });
    expect(overlayLookOfPart(shapeOf(decorated, 'body/extra'))).toBeUndefined();
  });

  it('leaves out the parts of a drawing that is left out', () => {
    expect(partMarksOf(scene, new Set(['body']), NONE)).toEqual([]);
  });
});

describe('where a drawing’s picture shows', () => {
  const scene = buildScene(beyondBoxes(), VIEW);
  const body = shapeOf(scene, 'body');

  it('from the scale pictures show at, below which the drawing is a plain block', () => {
    expect(pictureShows(body, 0.2)).toEqual({ shows: false, coarse: true });
    expect(pictureShows(body, 0.3)).toEqual({ shows: true, coarse: false });
  });

  it('as its levels of detail say, which its anchored parts take', () => {
    const state = changed(beyondBoxes(), {
      type: 'set-component-appearance',
      component: 'anatomy.organ',
      appearanceTraits: {
        levels: [
          { from: 0, shows: ['name'] },
          { from: 1, shows: ['name', 'image'] },
        ],
      },
    });
    const levelled = buildScene(state, VIEW);
    const drawing = shapeOf(levelled, 'body');
    // A middle level: the drawing in full, without its picture.
    expect(pictureShows(drawing, 0.5)).toMatchObject({ shows: false, coarse: false });
    expect(pictureShows(drawing, 1.5)).toMatchObject({ shows: true, coarse: false });
    expect(shapeOf(levelled, 'body/left').levels).toBe(drawing.levels);
    // The part layer draws its parts in their main colors there.
    const layer = new PartLayer(new ImageStore(new FakePlatform()));
    layer.setScene(levelled, NONE, NONE);
    layer.setScale(0.5);
    const [near, middle] = layer.container.children;
    expect([near?.visible, middle?.visible]).toEqual([false, true]);
    layer.setScale(1.5);
    expect([near?.visible, middle?.visible]).toEqual([true, false]);
    layer.destroy();
  });
});

/** A platform that decodes nothing and keeps time by hand; its textures are real, and blank. */
class FakePlatform implements ImagePlatform<Texture, { width: number; height: number }> {
  time = 0;
  loads = 0;
  now(): number {
    return this.time;
  }
  bytesOf(base64: string): Uint8Array {
    return new Uint8Array(base64.length);
  }
  decodeBitmap(_bytes: Uint8Array, _type: string, width: number, height: number) {
    return Promise.resolve({ width, height });
  }
  loadSvg(_svg: string, width: number, height: number) {
    this.loads += 1;
    return Promise.resolve({ width, height });
  }
  texture(): Texture {
    return new Texture({ source: Texture.WHITE.source });
  }
  atlasTexture(): Texture {
    return new Texture({ source: Texture.WHITE.source });
  }
  flush(): void {}
  destroyTexture(): void {}
  destroyPage(): void {}
  releasePicture(): void {}
}

const VIEWED: ImageView = {
  scale: 1,
  shown: { x: 0, y: 0, width: 1000, height: 800 },
  resolution: 1,
  settled: true,
  theme: 'light',
  spent: 0,
};

describe('the part layer', () => {
  it('draws a part’s own picture through the image store once it is ready', async () => {
    const platform = new FakePlatform();
    const store = new ImageStore(platform);
    const layer = new PartLayer(store);
    const scene = buildScene(beyondBoxes(), VIEW);
    layer.setScene(scene, NONE, new Set(['body', 'body/right']));
    layer.setScale(1);
    expect(layer.drawings).toBe(1);
    // The first frame asks; the store loads the picture in its own frames.
    expect(layer.frame(VIEWED)).toBe(true);
    for (let round = 0; round < 6; round++) {
      store.frame({ spent: 0, moving: false });
      for (let tick = 0; tick < 4; tick++) await Promise.resolve();
      platform.time += 100;
      layer.frame(VIEWED);
    }
    expect(platform.loads).toBeGreaterThan(0);
    expect(store.size).toBeGreaterThan(0);
    // Drawn with its texture, under the marks, and no longer filled in its main color.
    const near = layer.container.children[0] as Container;
    const [pictures] = near.children as Graphics[];
    expect(pictures?.context.instructions.map((each) => each.action)).toEqual(['texture']);
    // The texture it draws with is kept for it.
    store.settle(new Set([PARTS_PICTURES]));
    layer.destroy();
  });

  it('draws nothing far out, where the tiles draw the parts, and its marks close in', () => {
    const layer = new PartLayer(new ImageStore(new FakePlatform()));
    layer.setScene(buildScene(beyondBoxes(), VIEW), NONE, NONE);
    layer.setScale(0.1);
    const [near, middle, badges] = layer.container.children;
    expect([near?.visible, middle?.visible, badges?.visible]).toEqual([false, false, false]);
    layer.setScale(1);
    expect([near?.visible, middle?.visible, badges?.visible]).toEqual([true, false, true]);
    layer.destroy();
  });
});

describe('a part drawn on its own', () => {
  it('draws its part’s own picture inside its outline, the part’s bounds filling its shape', () => {
    const scene = buildScene(beyondBoxes(), VIEW);
    const loose = shapeOf(scene, 'loose');
    expect(loose.part).toMatchObject({ part: 'ring', inDrawing: false });
    const picture = pictureOf(loose);
    expect(picture).toMatchObject({ id: 'anatomy.organs#ring', placement: 'parts' });
    const { rect } = picture as NonNullable<typeof picture>;
    expect(rect.width).toBeLessThanOrEqual(loose.rect.width + 1e-9);
    expect(rect.height).toBeLessThanOrEqual(loose.rect.height + 1e-9);
    expect(rect.x + rect.width / 2).toBeCloseTo(loose.rect.x + loose.rect.width / 2);
    expect(pictureOf(loose)).toBe(picture);
    // An anchored part shows no picture of its own in the tiles.
    expect(pictureOf(shapeOf(scene, 'body/left'))).toBeUndefined();
  });
});
