/**
 * A face in place of the name tag (ADR 0083's clarification of F5): a shape whose name would go in a
 * tag under it, free geometry or a part drawn on its own, hangs none once its face writes its name,
 * and its bounds, its hits, where its relations attach, its layout and its exports stop counting one.
 * A face that does not write the name leaves the tag, which writes it.
 */
import { compileFace, type ProjectSnapshot } from '@visual-anything/core';
import type { Face, LevelOfDetail } from '@visual-anything/schema';
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { writeSvg } from '../export/svg';
import { TRIANGLE, beyondBoxes } from '../test/beyond';
import { withFaces } from '../test/faces';
import { writeShapeLabels, type TextFactory } from './draw';
import { faceWritesName, type ShapeFace } from './faces';
import { hitAt, indexScene } from './hit';
import { tagReachOf } from './layout/input';
import { drawnBoundsOf, nameTagOf, nameTagOn } from './nameTags';
import { buildScene, type ElementShape, type Scene } from './scene';

const VIEW = 'anatomy';
const TAGGED = ['framed', 'loose', 'body/extra'];

/** A face that writes the name. */
const NAMED: Face = { markup: ['<b>{{name}}</b>'], style: [] };
/** A face that writes only the component's name. */
const UNNAMED: Face = { markup: ['<small>{{component}}</small>'], style: [] };

/**
 * The beyond-boxes project with names too long for their outlines: `framed` and `extra` (a triangle)
 * write theirs in tags, as `loose`, a part drawn on its own, does already.
 */
function longNames(face?: Face): ProjectSnapshot {
  const project = beyondBoxes(VIEW);
  const named: ProjectSnapshot = {
    ...project,
    model: {
      ...project.model,
      elements: project.model.elements.map((element) => {
        if (element.id === 'framed')
          return { ...element, name: 'A framed chamber with a long name' };
        if (element.id !== 'extra') return element;
        return {
          ...element,
          name: 'Extra chamber of the heart',
          appearance: { geometry: TRIANGLE, width: 80, height: 64 },
        };
      }),
    },
  };
  return face ? withFaces(named, { 'anatomy.chamber': face }) : named;
}

function shapeOf(scene: Scene, key: string): ElementShape {
  const found = scene.shapes.find((shape) => shape.key === key);
  if (!found) throw new Error(`No shape ${key}.`);
  return found;
}

const bottomOf = (rect: { y: number; height: number }) => rect.y + rect.height;

describe('a face in place of the name tag (ADR 0083)', () => {
  it('hangs no tag under a shape whose face writes its name', () => {
    const plain = buildScene(longNames(), VIEW);
    const faced = buildScene(longNames(NAMED), VIEW);
    for (const key of TAGGED) {
      expect(nameTagOf(shapeOf(plain, key)), key).toBeDefined();
      const shape = shapeOf(faced, key);
      expect(shape.face, key).toBeDefined();
      expect(nameTagOf(shape), key).toBeUndefined();
      expect(nameTagOn(shape), key).toBeUndefined();
      // What it covers is its rectangle alone.
      expect(drawnBoundsOf(shape), key).toBe(shape.rect);
      // Layout spaces it by its rectangle alone.
      expect(tagReachOf(shape), key).toEqual({ left: 0, right: 0, bottom: 0 });
    }
    // The scene's bounds end at the framed shape, not under its tag.
    const tagged = shapeOf(plain, 'framed');
    const tag = nameTagOn(tagged)!;
    expect(bottomOf(plain.bounds!)).toBeCloseTo(bottomOf(tag));
    expect(bottomOf(faced.bounds!)).toBeCloseTo(bottomOf(shapeOf(faced, 'framed').rect));
  });

  it('is not pointed at where its tag would be, and its relations attach to its outline', () => {
    const plain = buildScene(longNames(), VIEW);
    const faced = buildScene(longNames(NAMED), VIEW);
    const tag = nameTagOn(shapeOf(plain, 'framed'))!;
    const inTag = { x: tag.x + tag.width / 2, y: tag.y + tag.height - 6 };
    const hit = (scene: Scene) => {
      const found = hitAt(indexScene(scene), inTag, 0);
      return found?.kind === 'shape' ? found.shape.key : found?.kind;
    };
    expect(hit(plain)).toBe('framed');
    expect(hit(faced)).toBeUndefined();
    // Every relation that ends on it ends on its rectangle, never below it.
    const framed = shapeOf(faced, 'framed');
    // `tie` runs from `loose` to it.
    const ends = faced.relations.filter((line) => line.relation === 'tie');
    expect(ends).toHaveLength(1);
    for (const line of ends) {
      expect(line.to.y).toBeLessThanOrEqual(bottomOf(framed.rect) + 1);
      expect(line.to.y).toBeGreaterThanOrEqual(framed.rect.y - 1);
    }
  });

  it('draws no tag in the SVG, whose drawing ends at the shape', () => {
    const plain = buildScene(longNames(), VIEW);
    const tag = nameTagOn(shapeOf(plain, 'framed'))!;
    const tagRects = (project: ProjectSnapshot) => {
      const document = new DOMParser().parseFromString(
        writeSvg(project, VIEW).text,
        'image/svg+xml',
      );
      const group = document.querySelector('g[data-shape="framed"]')!;
      return [...group.querySelectorAll('rect')].filter(
        (rect) =>
          Math.abs(Number(rect.getAttribute('y')) - tag.y) < 0.01 &&
          Math.abs(Number(rect.getAttribute('width')) - tag.width) < 0.01,
      ).length;
    };
    expect(tagRects(longNames())).toBe(1);
    expect(tagRects(longNames(NAMED))).toBe(0);
    const height = (project: ProjectSnapshot) =>
      Number(writeSvg(project, VIEW).text.match(/viewBox="[^"]* [^"]* [^"]* ([^"]*)"/)?.[1]);
    expect(height(longNames(NAMED))).toBeLessThan(height(longNames()));
  });

  it('keeps the tag, with the name in it, for a face that does not write the name', () => {
    const faced = buildScene(longNames(UNNAMED), VIEW);
    const framed = shapeOf(faced, 'framed');
    expect(nameTagOf(framed)?.lines).toEqual(['A framed chamber', 'with a long name']);
    // On the canvas: the face, and the name in its tag.
    const written: string[] = [];
    const make: TextFactory = (options) => {
      written.push(String(options.text));
      return new Container();
    };
    const face = new Container();
    const labels = writeShapeLabels([framed], true, make, undefined, () => face);
    expect(labels[0]).toBe(face);
    expect(written[0]).toBe('A framed chamber\nwith a long name');
    // In the SVG: the face's text, and the name in the tag.
    const document = new DOMParser().parseFromString(
      writeSvg(longNames(UNNAMED), VIEW).text,
      'image/svg+xml',
    );
    const texts = [...document.querySelectorAll('g[data-shape="framed"] text')].map(
      (text) => text.textContent,
    );
    expect(texts).toContain('A framed chamber');
    expect(texts).toContain('with a long name');
    expect(texts).toContain('Chamber');
  });
});

describe('faceWritesName', () => {
  const faced = (face: Face, levels?: LevelOfDetail[], collapsed = false) => ({
    face: {
      compiled: compileFace({
        size: 'shape',
        variants: [],
        markup: [],
        style: [],
        ...face,
      }),
      input: {},
    } as unknown as ShapeFace,
    ...(levels ? { levels } : {}),
    ...(collapsed ? { collapsed: { contents: 1 } } : {}),
  });

  it('reads the markup the most detailed level shows, under a condition or not', () => {
    expect(faceWritesName({})).toBe(false);
    expect(faceWritesName(faced(NAMED))).toBe(true);
    expect(faceWritesName(faced(UNNAMED))).toBe(false);
    expect(faceWritesName(faced({ ...UNNAMED, markup: ['<b if="x">{{name}}</b>'] }))).toBe(true);
    expect(
      faceWritesName(faced({ ...UNNAMED, markup: ['<each of="attributes">{{name}}</each>'] })),
    ).toBe(true);
    // In a class, a slot writes no text.
    expect(faceWritesName(faced({ ...UNNAMED, markup: ['<b class="{{name}}">x</b>'] }))).toBe(
      false,
    );
    const variants = { ...UNNAMED, variants: [{ id: 'near', markup: ['<b>{{name}}</b>'] }] };
    const far: LevelOfDetail = { from: 0.2, shows: ['face'] };
    expect(
      faceWritesName(faced(variants, [far, { from: 0.6, shows: ['face'], face: 'near' }])),
    ).toBe(true);
    expect(
      faceWritesName(
        faced(variants, [
          { ...far, face: 'near' },
          { from: 0.6, shows: ['face'] },
        ]),
      ),
    ).toBe(false);
    // Where the most detailed level shows no face, the shape writes its name itself.
    expect(faceWritesName(faced(NAMED, [far, { from: 0.6, shows: ['name'] }]))).toBe(false);
    // A collapsed container's variant.
    const closed = {
      ...NAMED,
      variants: [{ id: 'closed', markup: ['<i>shut</i>'] }],
      collapsed: 'closed',
    };
    expect(faceWritesName(faced(closed, undefined, true))).toBe(false);
    expect(faceWritesName(faced(closed))).toBe(true);
  });

  it('counts a face that cannot be laid out, drawn as the shape’s name, as writing it', () => {
    expect(faceWritesName(faced({ markup: ['<script/>'], style: [] }))).toBe(true);
  });
});
