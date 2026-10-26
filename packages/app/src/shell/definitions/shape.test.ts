/**
 * What the Shape section sends (ADR 0066, ADR 0067): free geometry from typed path data, an SVG file
 * or a named part, each read by the core, and the commands that set it and the part shapes are drawn
 * as.
 */
import { executeCommand, imagesIn, readGeometry } from '@visual-anything/core';
import type { FreeGeometry } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { ORGANS_ID, beyondBoxes } from '../../test/beyond';
import {
  componentGeometryCommand,
  componentPartCommand,
  elementPartCommand,
  geometryFromPart,
  geometryFromPathData,
  geometryFromSvg,
  isPartId,
  labelAreaOf,
  nameFitsInside,
  namedPartsOf,
  pathDataOf,
  svgPicturesIn,
  withKeepProportions,
  withLabel,
} from './shape';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const HEART =
  'M60 104 C20 76 0 52 0 30 C0 12 14 0 30 0 C44 0 54 8 60 20 C66 8 76 0 90 0 C106 0 120 12 120 30 C120 52 100 76 60 104 Z';

describe('free geometry from path data', () => {
  it('fits its box to where the curves end, keeping the numbers as written', () => {
    const reading = geometryFromPathData(`  ${HEART}\n`);
    expect(reading.ok).toBe(true);
    if (!reading.ok) return;
    expect(reading.geometry).toEqual({
      width: 120,
      height: 104,
      outline: [{ kind: 'path', d: HEART }],
    });
    expect(readGeometry(reading.geometry).ok).toBe(true);
  });

  it('takes the box typed beside it, side by side', () => {
    const reading = geometryFromPathData('M10 10 H90 V70 H10 Z', { width: 100 });
    expect(reading.ok && reading.geometry).toMatchObject({ width: 100, height: 70 });
  });

  it('says why in the core’s words when the path data cannot be read', () => {
    expect(geometryFromPathData('   ')).toEqual({ ok: false, message: 'The path data is empty.' });
    expect(geometryFromPathData('L 10 10')).toEqual({
      ok: false,
      message: 'Contour 1: Path data must start with a move, M or m.',
    });
    const outside = geometryFromPathData('M0 0 H200 V50 H0 Z', { width: 100, height: 100 });
    expect(outside).toEqual({
      ok: false,
      message: 'The outline of free geometry leaves its box of 100 by 100.',
    });
  });

  it('keeps proportions and a label area that still fits, and drops one that no longer does', () => {
    const label = { x: 10, y: 10, width: 20, height: 10 };
    const kept = geometryFromPathData('M0 0 H50 V50 H0 Z', {}, { keepProportions: true, label });
    expect(kept.ok && kept.geometry).toMatchObject({ keepProportions: true, label });
    const dropped = geometryFromPathData('M0 0 H20 V20 H0 Z', {}, { label });
    expect(dropped.ok && dropped.geometry.label).toBeUndefined();
  });

  it('writes the contours shown as path data, one a line', () => {
    const geometry: FreeGeometry = {
      width: 100,
      height: 100,
      outline: [
        { kind: 'path', d: 'M0 0H100V100H0Z' },
        { kind: 'polygon', points: '10,10 90,10 50,80' },
        { kind: 'ellipse', cx: 50, cy: 50, rx: 10, ry: 5 },
      ],
    };
    const text = pathDataOf(geometry);
    expect(text.split('\n')).toEqual([
      'M0 0H100V100H0Z',
      'M10 10 L90 10 L50 80 Z',
      'M40 50 A10 5 0 1 0 60 50 A10 5 0 1 0 40 50 Z',
    ]);
    // Read back, the same outline is drawn: the same contours, in the same box.
    const again = geometryFromPathData(text, { width: 100, height: 100 });
    expect(again.ok && readGeometry(again.geometry).ok).toBe(true);
    expect(pathDataOf(undefined)).toBe('');
  });
});

describe('free geometry from an SVG file', () => {
  it('cleans the file, then takes the outline of all it draws within the caps', () => {
    const reading = geometryFromSvg(
      `<svg viewBox="0 0 100 50" ${NS}><script>alert(1)</script><rect x="10" y="10" width="80" height="30"/></svg>`,
    );
    expect(reading.ok).toBe(true);
    if (!reading.ok) return;
    expect(reading.geometry.keepProportions).toBe(true);
    expect(reading.geometry.outline.length).toBeGreaterThan(0);
    expect(readGeometry(reading.geometry).ok).toBe(true);
    expect(JSON.stringify(reading.geometry)).not.toContain('script');
  });

  it('says why when the file is no picture, or draws nothing', () => {
    expect(geometryFromSvg('<html></html>')).toEqual({
      ok: false,
      message: 'The outermost element is not an SVG element.',
    });
    expect(geometryFromSvg(`<svg viewBox="0 0 10 10" ${NS}></svg>`)).toEqual({
      ok: false,
      message: 'Nothing drawable is left in the SVG picture.',
    });
    const unpainted = `<svg viewBox="0 0 10 10" ${NS}><rect width="5" height="5" fill="none"/></svg>`;
    expect(geometryFromSvg(unpainted)).toEqual({
      ok: false,
      message: 'The picture draws nothing to take an outline from.',
    });
  });
});

describe('free geometry copied from a named part', () => {
  const project = beyondBoxes();
  const [organs] = svgPicturesIn(project);

  it('lists the SVG pictures of the project and their named parts, in document order', () => {
    expect(organs?.id).toBe(ORGANS_ID);
    expect(namedPartsOf(organs?.picture).map((part) => part.id)).toEqual(['left', 'right', 'ring']);
    expect(namedPartsOf(undefined)).toEqual([]);
  });

  it('copies a part’s outline, holes included, and refuses a part it does not list', () => {
    const picture = imagesIn(project).shown(ORGANS_ID);
    if (!picture) throw new Error('The picture is not drawn.');
    const ring = geometryFromPart(picture, 'ring');
    expect(ring.ok && ring.outline.contours.map((contour) => contour.role)).toEqual([
      'fill',
      'hole',
    ]);
    expect(geometryFromPart(picture, 'nothing')).toEqual({
      ok: false,
      message: 'The part draws nothing to take an outline from.',
    });
  });
});

describe('what the Shape section changes of a geometry', () => {
  const square: FreeGeometry = {
    width: 40,
    height: 40,
    outline: [{ kind: 'path', d: 'M0 0H40V40H0Z' }],
  };

  it('turns Keep proportions on, and off by leaving the key out', () => {
    const kept = withKeepProportions(square, true);
    expect(kept.keepProportions).toBe(true);
    expect('keepProportions' in withKeepProportions(kept, false)).toBe(false);
  });

  it('sets a label area, or takes it out so that it is worked out again', () => {
    const labelled = withLabel(square, { x: 5, y: 5, width: 30, height: 10 });
    expect(labelled.label).toEqual({ x: 5, y: 5, width: 30, height: 10 });
    expect('label' in withLabel(labelled, undefined)).toBe(false);
  });

  it('works the label area out as the canvas does, and says when a name fits inside', () => {
    const reading = readGeometry(square);
    if (!reading.ok) throw new Error('The square is not geometry.');
    const area = labelAreaOf(reading.outline);
    expect(area.width).toBeGreaterThan(0);
    expect(area.x + area.width).toBeLessThanOrEqual(40);
    expect(nameFitsInside(reading.outline, 120, 120)).toBe(true);
    expect(nameFitsInside(reading.outline, 20, 10)).toBe(false);
  });

  it('knows a part’s id as a picture names it', () => {
    expect(isPartId('left-ventricle.1')).toBe(true);
    expect(isPartId('1st')).toBe(false);
    expect(isPartId('a b')).toBe(false);
  });
});

describe('the commands the Shape section sends', () => {
  const project = beyondBoxes();

  it('set a component’s geometry and part where the project can change them, each one action', () => {
    const geometry = componentGeometryCommand('anatomy.chamber', {
      width: 10,
      height: 10,
      outline: [{ kind: 'ellipse', cx: 5, cy: 5, rx: 5, ry: 5 }],
    });
    const part = componentPartCommand('anatomy.chamber', { part: 'left', image: ORGANS_ID });
    for (const command of [geometry, part]) {
      expect(command.type).toBe('set-component-appearance');
      const outcome = executeCommand(project, command);
      expect(outcome.ok).toBe(true);
    }
    expect(componentGeometryCommand('anatomy.chamber', 'none')).toEqual({
      type: 'set-component-appearance',
      component: 'anatomy.chamber',
      appearanceTraits: { geometry: 'none' },
    });
  });

  it('set the part one element is drawn as, as a particularity', () => {
    const command = elementPartCommand('extra', { part: 'ring', image: ORGANS_ID });
    expect(command).toEqual({
      type: 'update-element',
      id: 'extra',
      changes: { appearanceTraits: { part: { part: 'ring', image: ORGANS_ID } } },
    });
    expect(executeCommand(project, command).ok).toBe(true);
    expect(executeCommand(project, elementPartCommand('extra', null)).ok).toBe(true);
  });
});
