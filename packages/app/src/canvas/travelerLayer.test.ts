/**
 * The canvas's travelers (ADR 0110): what the scene gives a line whose appearance sends one, and what
 * the layer draws of it, moving, still and hidden, on screen only and within the frame's most.
 */
import type { CleanedImage } from '@visual-anything/core';
import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { TRAVELERS_VIEW, withTravelers } from '../test/travelers';
import { DIMMED_ALPHA } from './colors';
import type { Point } from './geometry';
import { buildScene, type RelationLine } from './scene';
import { TravelerLayer, type TravelerTextures } from './travelerLayer';
import { headsLeft } from './travelers';

const VIEW = TRAVELERS_VIEW;

describe('a line whose appearance sends a traveler', () => {
  it('carries it, its picture as the catalog cleaned it, its defaults filled in', () => {
    const scene = buildScene(withTravelers(), VIEW);
    const lines = scene.relations.filter((line) => line.traveler);
    expect(lines.length).toBe(scene.relations.length);
    const first = lines[0]?.traveler;
    expect(first).toMatchObject({ image: 'clinic.truck', size: 20, speed: 120, spacing: 240 });
    expect(first?.picture).toMatchObject({ kind: 'svg', width: 40, height: 20 });
  });

  it('goes one way on a directed line, from both ends on an undirected one', () => {
    const scene = buildScene(withTravelers(), VIEW);
    for (const line of scene.relations) {
      if (line.arrowhead) expect(line.traveler?.directed).toBe(true);
    }
  });

  it('carries none where the appearance sends none, or a picture the project does not hold', () => {
    expect(buildScene(loadSample(), VIEW).relations.some((line) => line.traveler)).toBe(false);
    const missing = buildScene(withTravelers({ image: 'clinic.nothing' }), VIEW);
    expect(missing.relations.some((line) => line.traveler)).toBe(false);
  });
});

// --- The layer ----------------------------------------------------------------------------------

const PICTURE = { kind: 'svg', width: 40, height: 20 } as unknown as CleanedImage;

/** Textures that are made at once, or never, counting what the layer asks for and uses. */
function textures(made = true): TravelerTextures<Texture> & { asked: number; used: string[][] } {
  const source = {
    asked: 0,
    used: [] as string[][],
    texture(_picture: CleanedImage, devicePixels: number) {
      source.asked += 1;
      return made
        ? { texture: Texture.WHITE, key: `truck:${devicePixels}`, exact: true }
        : undefined;
    },
    broken: () => false,
    use(keys: readonly string[]) {
      source.used.push([...keys]);
    },
  };
  return source;
}

function lineOf(
  route: Point[],
  key = 'r1',
  traveler: Partial<RelationLine['traveler']> = {},
): RelationLine {
  return {
    relation: key,
    route,
    from: route[0] as Point,
    to: route.at(-1) as Point,
    middle: route[0] as Point,
    stroke: '#000000',
    width: 1,
    dash: 'solid',
    traveler: {
      image: 'clinic.truck',
      picture: PICTURE,
      size: 20,
      speed: 120,
      spacing: 250,
      directed: true,
      ...traveler,
    },
  };
}

const straight = (y = 0, length = 1000): Point[] => [
  { x: 0, y },
  { x: length, y },
];
const NONE = new Set<string>();
const SCREEN = { x: -100, y: -100, width: 1200, height: 400 };
const view = (now = 0, extra: Partial<Parameters<TravelerLayer['frame']>[0]> = {}) => ({
  now,
  scale: 1,
  shown: SCREEN,
  resolution: 1,
  reduced: false,
  ...extra,
});

describe('the traveler layer', () => {
  it('moves the travelers along their line, from the from end, and asks for the next frame', () => {
    const layer = new TravelerLayer(textures());
    layer.setLines([lineOf(straight())], NONE, NONE);
    expect(layer.frame(view(0))).toBe(true);
    expect(layer.drawn.map((each) => each.x)).toEqual([125, 375, 625, 875]);
    expect(layer.frame(view(1000))).toBe(true);
    expect(layer.drawn.map((each) => each.x)).toEqual([245, 495, 745, 995]);
  });

  it('draws each its larger side the size in pixels, at any zoom', () => {
    const layer = new TravelerLayer(textures());
    layer.setLines([lineOf(straight())], NONE, NONE);
    layer.frame(view(0, { scale: 2, shown: { x: 0, y: -50, width: 1000, height: 100 } }));
    const [first] = layer.drawn;
    expect(first?.width).toBeCloseTo(10);
    expect(first?.height).toBeCloseTo(5);
    layer.frame(view(0, { scale: 0.5, shown: { x: -500, y: -500, width: 2000, height: 1000 } }));
    expect(layer.drawn[0]?.width).toBeCloseTo(40);
  });

  it('turns with its line, and is mirrored while it heads left', () => {
    const layer = new TravelerLayer(textures());
    const back: Point[] = [
      { x: 1000, y: 0 },
      { x: 0, y: 0 },
    ];
    layer.setLines([lineOf(back)], NONE, NONE);
    layer.frame(view(0));
    expect(layer.drawn.every((each) => each.mirrored && headsLeft(each.rotation))).toBe(true);
    const down: Point[] = [
      { x: 0, y: -100 },
      { x: 0, y: 300 },
    ];
    layer.setLines([lineOf(down)], NONE, NONE);
    layer.frame(view(0));
    expect(layer.drawn[0]?.rotation).toBeCloseTo(Math.PI / 2);
    expect(layer.drawn[0]?.mirrored).toBe(false);
  });

  it('sends an undirected line’s travelers from both ends toward its middle', () => {
    const layer = new TravelerLayer(textures());
    layer.setLines([lineOf(straight(), 'r1', { directed: false })], NONE, NONE);
    layer.frame(view(0));
    expect(layer.drawn.map((each) => each.x)).toEqual([125, 375, 875, 625]);
    expect(layer.drawn.map((each) => each.mirrored)).toEqual([false, false, true, true]);
  });

  it('stands them still under reduced motion and in a view that keeps them still, asking for no frame', () => {
    const layer = new TravelerLayer(textures());
    layer.setLines([lineOf(straight())], NONE, NONE);
    expect(layer.frame(view(1234, { reduced: true }))).toBe(false);
    expect(layer.drawn.map((each) => each.x)).toEqual([125, 375, 625, 875]);
    layer.setMode('still');
    expect(layer.frame(view(5678))).toBe(false);
    expect(layer.drawn.map((each) => each.x)).toEqual([125, 375, 625, 875]);
  });

  it('draws none in a view that hides them, and gives its textures up', () => {
    const source = textures();
    const layer = new TravelerLayer(source);
    layer.setLines([lineOf(straight())], NONE, NONE);
    layer.frame(view(0));
    layer.setMode('hidden');
    expect(layer.frame(view(16))).toBe(false);
    expect(layer.drawn).toEqual([]);
    expect(source.used.at(-1)).toEqual([]);
    expect(layer.container.children.every((child) => !child.visible)).toBe(true);
  });

  it('draws only what is on screen, and asks for no frame with nothing moving there', () => {
    const layer = new TravelerLayer(textures());
    layer.setLines([lineOf(straight(5000))], NONE, NONE);
    expect(layer.frame(view(0))).toBe(false);
    expect(layer.drawn).toEqual([]);
    layer.setLines([lineOf(straight(0, 5000))], NONE, NONE);
    layer.frame(view(0));
    expect(layer.drawn.every((each) => each.x <= SCREEN.x + SCREEN.width + 20)).toBe(true);
    expect(layer.drawn.length).toBeLessThan(20);
  });

  it('draws none on a line shorter on screen than twice its traveler', () => {
    const layer = new TravelerLayer(textures());
    layer.setLines([lineOf(straight(0, 39))], NONE, NONE);
    layer.frame(view(0));
    expect(layer.drawn).toEqual([]);
    layer.setLines([lineOf(straight(0, 40))], NONE, NONE);
    layer.frame(view(0));
    expect(layer.drawn.length).toBe(1);
  });

  it('keeps the lines nearest the screen center past the most it draws a frame', () => {
    const layer = new TravelerLayer(textures(), 4);
    const near = lineOf(straight(140), 'near');
    const far = lineOf(straight(290), 'far');
    layer.setLines([far, near], NONE, NONE);
    layer.frame(view(0, { shown: { x: 0, y: 0, width: 1000, height: 300 } }));
    expect(layer.drawn.length).toBe(4);
    expect(layer.drawn.every((each) => each.y === 140)).toBe(true);
  });

  it('draws nothing on lines the emphasis hides, and faintly on those it dims, at the line’s opacity', () => {
    const layer = new TravelerLayer(textures());
    const faded = { ...lineOf(straight(0), 'faded'), opacity: 0.5 };
    const dimmed = lineOf(straight(100), 'dimmed');
    const hidden = lineOf(straight(200), 'hidden');
    layer.setLines([faded, dimmed, hidden], new Set(['hidden']), new Set(['dimmed']));
    layer.frame(view(0));
    const alphas = new Map(layer.drawn.map((each) => [each.y, each.alpha]));
    expect(alphas.get(0)).toBe(0.5);
    expect(alphas.get(100)).toBeCloseTo(DIMMED_ALPHA);
    expect(alphas.has(200)).toBe(false);
  });

  it('pools its sprites: moving on makes none, and a still frame with nothing changed redraws none', () => {
    const source = textures();
    const layer = new TravelerLayer(source);
    layer.setLines([lineOf(straight())], NONE, NONE);
    layer.frame(view(0));
    const sprites = layer.container.children.length;
    for (let at = 1; at < 30; at++) layer.frame(view(at * 16));
    expect(layer.container.children.length).toBe(sprites);
    layer.setMode('still');
    layer.frame(view(0));
    const first = layer.drawn;
    layer.frame(view(100));
    expect(layer.drawn).toEqual(first);
    // The store is told which textures are used only when they change.
    expect(source.used.length).toBe(1);
  });

  it('asks for frames while a texture is not made, and draws nothing meanwhile', () => {
    const layer = new TravelerLayer(textures(false));
    layer.setLines([lineOf(straight())], NONE, NONE);
    layer.setMode('still');
    expect(layer.frame(view(0))).toBe(true);
    expect(layer.drawn).toEqual([]);
  });

  it('draws still within an image’s frame, at its scale, whatever the mode but hidden', () => {
    const layer = new TravelerLayer(textures());
    layer.setLines([lineOf(straight(0, 4000))], NONE, NONE);
    layer.drawStill({ x: 0, y: -10, width: 4000, height: 20 }, 0.5, 2);
    expect(layer.drawn.map((each) => each.x)).toEqual(
      Array.from({ length: 16 }, (_each, at) => 125 + at * 250),
    );
    expect(layer.drawn[0]?.width).toBeCloseTo(40);
    layer.setMode('hidden');
    layer.drawStill({ x: 0, y: -10, width: 4000, height: 20 }, 0.5, 2);
    expect(layer.drawn).toEqual([]);
  });

  it('names the pictures it draws once each, for the store to keep', () => {
    const layer = new TravelerLayer(textures());
    layer.setLines([lineOf(straight(0), 'a'), lineOf(straight(50), 'b', { size: 32 })], NONE, NONE);
    expect(layer.pictures).toEqual([PICTURE]);
  });
});
