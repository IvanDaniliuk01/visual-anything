/**
 * The beyond-boxes benchmark's project holds what the spec counts (M8b's "Done when"), keeps the
 * rules, and draws what it means to measure: free geometry, drawings with parts, and relations on
 * outlines, curved automatically.
 */
import {
  GEOMETRY_CAPS,
  PART_CAPS,
  checkProject,
  geometryText,
  imagesIn,
  partsLeftOut,
  partsOf,
  readGeometry,
  readPathData,
} from '@visual-anything/core';
import type { FreeGeometry } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { buildScene, type ElementShape } from '../canvas/scene';
import { BENCH_GEOMETRY, benchGeometries } from './geometries';
import { CURVED_TYPE, GEOMETRY_VIEW, geometryHub, syntheticGeometry, withCurves } from './geometry';
import { BENCH_PARTS, partPictureId, partPicturePackage } from './partPictures';

/** The codes of what free geometry, named parts and pictures warn of. */
const BEYOND_BOXES = [
  'invalid-geometry',
  'geometry-too-large',
  'large-geometry',
  'unknown-part',
  'too-many-parts',
];

describe('the beyond-boxes benchmark’s project', () => {
  const project = syntheticGeometry({ elements: 10_000 });
  const scene = buildScene(project, GEOMETRY_VIEW);
  const byKey = new Map(scene.shapes.map((shape) => [shape.key, shape]));
  const withGeometry = scene.shapes.filter((shape) => shape.outline && !shape.part);
  const anchored = scene.shapes.filter((shape) => shape.part?.inDrawing === true);
  const drawings = scene.shapes.filter((shape) => shape.picture !== undefined);

  it('holds 10,000 elements and keeps the rules, warning of nothing beyond boxes', () => {
    expect(project.model.elements).toHaveLength(10_000);
    expect(scene.shapes).toHaveLength(10_000);
    const check = checkProject(project);
    expect(check.errors).toEqual([]);
    expect(
      check.warnings.filter(
        (each) => BEYOND_BOXES.includes(each.code) || each.code.startsWith('image'),
      ),
    ).toEqual([]);
  });

  it('gives 2,000 shapes free geometry, in 20 distinct geometries', () => {
    expect(withGeometry).toHaveLength(2_000);
    const components = new Set(
      withGeometry.map(
        (shape) => project.model.elements.find((each) => each.id === shape.element)?.component,
      ),
    );
    expect(components.size).toBe(BENCH_GEOMETRY.count);
    const geometries = benchGeometries();
    expect(new Set(geometries.map((each) => JSON.stringify(each))).size).toBe(BENCH_GEOMETRY.count);
    for (const geometry of geometries) expect(readGeometry(geometry).ok).toBe(true);
    // Each fitted outline is shared by every shape of its geometry and size.
    expect(new Set(withGeometry.map((shape) => shape.outline?.source)).size).toBe(
      BENCH_GEOMETRY.count,
    );
  });

  it('holds 4 geometries at the caps: segments, contours, text, and all three at once', () => {
    const [segments, contours, text, every] = benchGeometries() as [
      FreeGeometry,
      FreeGeometry,
      FreeGeometry,
      FreeGeometry,
    ];
    const commands = (geometry: FreeGeometry) =>
      geometry.outline.reduce((sum, contour) => {
        if (contour.kind === 'path') {
          const read = readPathData(contour.d);
          return sum + (read.ok ? read.commands : 0);
        }
        if (contour.kind === 'polygon') return sum + contour.points.trim().split(/\s+/).length;
        return sum + 4;
      }, 0);
    expect(commands(segments)).toBe(GEOMETRY_CAPS.segments);
    expect(contours.outline).toHaveLength(GEOMETRY_CAPS.contours);
    expect(geometryText(text)).toBeLessThanOrEqual(GEOMETRY_CAPS.text);
    expect(geometryText(text)).toBeGreaterThan(GEOMETRY_CAPS.text * 0.97);
    expect(commands(every)).toBe(GEOMETRY_CAPS.segments);
    expect(every.outline).toHaveLength(GEOMETRY_CAPS.contours);
    expect(geometryText(every)).toBeGreaterThan(GEOMETRY_CAPS.text * 0.9);
    // One segment more is refused: they are at the caps, not near them.
    const [first] = segments.outline as [{ kind: 'path'; d: string }];
    const past: FreeGeometry = {
      ...segments,
      outline: [{ kind: 'path', d: first.d.replace(/Z$/, 'L80 40Z') }],
    };
    expect(readGeometry(past)).toMatchObject({ ok: false, code: 'geometry-too-large' });
  });

  it('anchors 1,000 parts in 20 drawings with parts, 2 of whose pictures are at the cap on parts', () => {
    expect(anchored).toHaveLength(1_000);
    expect(drawings).toHaveLength(BENCH_PARTS.pictures);
    const pictures = new Set(drawings.map((shape) => shape.image?.serial));
    expect(pictures.size).toBe(BENCH_PARTS.pictures);
    const catalog = imagesIn(project);
    const counts = (partPicturePackage().images ?? []).map((image) => {
      const shown = catalog.shown(image.id);
      if (!shown) throw new Error(`${image.id} is not drawn`);
      const left = partsLeftOut(shown);
      expect(left.contours).toBe(0);
      expect(left.segments).toBe(false);
      return partsOf(shown).length;
    });
    expect(counts.filter((count) => count === PART_CAPS.parts)).toHaveLength(BENCH_PARTS.atCap);
    expect(Math.max(...counts)).toBe(PART_CAPS.parts);
    // Every anchored part lies over its drawing's picture, and the drawings are 50 apiece.
    const perDrawing = new Map<string, number>();
    for (const shape of anchored) {
      const drawing = byKey.get(shape.containerShape ?? '') as ElementShape;
      const picture = drawing.picture?.rect;
      expect(picture).toBeDefined();
      if (!picture) continue;
      expect(shape.rect.x).toBeGreaterThanOrEqual(picture.x);
      expect(shape.rect.y).toBeGreaterThanOrEqual(picture.y);
      expect(shape.rect.x + shape.rect.width).toBeLessThanOrEqual(picture.x + picture.width);
      expect(shape.rect.y + shape.rect.height).toBeLessThanOrEqual(picture.y + picture.height);
      perDrawing.set(drawing.key, (perDrawing.get(drawing.key) ?? 0) + 1);
    }
    expect([...new Set(perDrawing.values())]).toEqual([50]);
  });

  it('shows a picture at the cap on parts in the middle of the view', () => {
    const bounds = scene.bounds;
    if (!bounds) throw new Error('The scene is empty');
    const middle = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const nearest = [...drawings].sort(
      (a, b) =>
        Math.hypot(
          a.rect.x + a.rect.width / 2 - middle.x,
          a.rect.y + a.rect.height / 2 - middle.y,
        ) -
        Math.hypot(b.rect.x + b.rect.width / 2 - middle.x, b.rect.y + b.rect.height / 2 - middle.y),
    )[0];
    const element = project.model.elements.find((each) => each.id === nearest?.element);
    const image = element?.appearance?.image;
    expect(image !== undefined && image !== 'none' ? image.image : undefined).toBe(
      partPictureId(0),
    );
  });

  it('attaches 2,000 relations on outlines, 1,000 curved automatically, 50 on one shape', () => {
    const onOutlines = scene.relations.filter((line) => {
      const ends = line.ends;
      if (!ends) return false;
      const outlined = (end: typeof ends.from) =>
        end.kind === 'shape' && byKey.get(end.key)?.outline !== undefined;
      return outlined(ends.from) || outlined(ends.to);
    });
    expect(onOutlines).toHaveLength(2_000);
    // Curved automatically: drawn curved, or, past 24 in a container or across a shape, orthogonal
    // with rounded corners, still drawn by their spans (ADR 0080, section 3).
    const curved = onOutlines.filter(
      (line) => line.style === 'curved' || line.rounded !== undefined,
    );
    expect(curved).toHaveLength(1_000);
    // Each a curve, but between shapes that their name tags bring within 24 units of each other, a
    // flow from one into the other, as touching parts are joined (ADR 0066's clarification of
    // 2026-10-27): a few of the shapes stacked in a column hang their tags over the next.
    expect(curved.every((line) => line.hand === undefined)).toBe(true);
    expect(curved.every((line) => line.curve !== undefined || line.route.length === 2)).toBe(true);
    expect(curved.filter((line) => line.curve !== undefined).length).toBeGreaterThan(800);
    const types = new Map(project.model.relations.map((each) => [each.id, each.relationType]));
    expect(curved.every((line) => types.get(line.relation) === CURVED_TYPE)).toBe(true);
    const hub = geometryHub(project);
    const hubKey = scene.shapes.find((shape) => shape.element === hub)?.key;
    const onHub = scene.relations.filter(
      (line) =>
        (line.ends?.from.kind === 'shape' && line.ends.from.key === hubKey) ||
        (line.ends?.to.kind === 'shape' && line.ends.to.key === hubKey),
    );
    expect(onHub).toHaveLength(50);
    expect(withGeometry.some((shape) => shape.element === hub)).toBe(true);
  });

  it('curves every automatic route with `curves`, as its view’s style', () => {
    const curved = syntheticGeometry({ elements: 1_000, curves: true });
    expect(curved.views[0]?.routeStyle).toBe('curved');
    expect(withCurves(syntheticGeometry({ elements: 1_000 }))).toEqual(curved);
    const lines = buildScene(curved, GEOMETRY_VIEW).relations;
    expect(lines.length).toBeGreaterThan(500);
    // Past 24 curves in a container, or across a shape, drawn with rounded corners (ADR 0080).
    expect(lines.every((line) => line.style === 'curved' || line.rounded !== undefined)).toBe(true);
  });

  it('is the same every time, and keeps its shares when smaller', () => {
    const small = syntheticGeometry({ elements: 1_000 });
    expect(small).toEqual(syntheticGeometry({ elements: 1_000 }));
    expect(small.model.elements).toHaveLength(1_000);
    expect(checkProject(small).errors).toEqual([]);
    const shapes = buildScene(small, GEOMETRY_VIEW).shapes;
    expect(shapes.filter((shape) => shape.outline && !shape.part)).toHaveLength(200);
    expect(shapes.filter((shape) => shape.part?.inDrawing)).toHaveLength(100);
  });
});
