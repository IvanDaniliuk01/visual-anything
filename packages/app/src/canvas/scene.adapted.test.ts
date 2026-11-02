/**
 * Stored colors adapted on the dark canvas (ADR 0087): what the scene gives each shape, line, note,
 * arrow and silhouette for the dark canvas when the drawing defaults ask for it, and that a theme
 * switch then draws again only the tiles whose colors change.
 */
import {
  DARK_SHADES,
  adaptedForDark,
  executeCommand,
  sameColor,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { FreeShape } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../theme/themes';
import { loadSample } from '../test/sample';
import { buildScene, buildSceneAfresh, type ElementShape, type RelationLine } from './scene';
import {
  ARROW_PAINT,
  NOTE_PAINT,
  SHAPE_PAINT,
  arrowStroke,
  noteColors,
  paintedNote,
  sameButPaint,
  shapeColors,
} from './theme/paint';
import { drawingsFollowTheme, labelsFollowTheme, type TileItems } from './theme/restyle';

const VIEW = 'system-overview';

function applied(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

function adapting(project: ProjectSnapshot): ProjectSnapshot {
  return applied(project, {
    type: 'set-drawing-defaults',
    drawing: { colors: { storedColorsInDark: 'adapted' } },
  });
}

function shapeOf(project: ProjectSnapshot, element: string): ElementShape {
  const shape = buildScene(project, VIEW).shapes.find((each) => each.element === element);
  if (!shape) throw new Error(`No shape for ${element}`);
  return shape;
}

function tileOf(...shapes: ElementShape[]): TileItems {
  return { kind: 'shapes', shapes, touching: [], lines: [], notes: [], arrows: [] };
}

const sample = loadSample();
const stored = applied(sample, {
  type: 'update-element',
  id: 'scheduling',
  changes: { appearance: { fill: '#FFE8D6', stroke: '#8A4B12' } },
});

describe('the scene with stored colors adapted on the dark canvas', () => {
  it('gives a shape in stored colors its adapted colors for the dark canvas, and keeps the stored ones', () => {
    const shape = shapeOf(adapting(stored), 'scheduling');
    expect([shape.fill, shape.stroke]).toEqual(['#FFE8D6', '#8A4B12']);
    expect(shape.dark).toEqual({
      fill: adaptedForDark('#FFE8D6'),
      stroke: adaptedForDark('#8A4B12'),
    });
    expect(shapeColors(shape, 'light')).toMatchObject({ fill: '#FFE8D6', stroke: '#8A4B12' });
    expect(shapeColors(shape, 'dark')).toEqual(shape.dark);
  });

  it('leaves built-in colors in their dark shades', () => {
    expect(shapeOf(adapting(sample), 'scheduling').dark).toEqual(
      DARK_SHADES.components['systems.system'],
    );
    // A stored fill is adapted beside a built-in stroke, which keeps its shade.
    expect(shapeOf(adapting(sample), 'booking-agent').dark).toEqual({
      fill: adaptedForDark('#F8E1EC'),
      stroke: DARK_SHADES.components['systems.ai-agent']?.stroke,
    });
  });

  it('adapts a relation’s own stroke', () => {
    const first = buildScene(sample, VIEW).relations[0] as RelationLine;
    const project = adapting(
      applied(sample, {
        type: 'update-relation',
        id: first.relation,
        changes: { appearance: { stroke: '#FFC9C9' } },
      }),
    );
    const line = buildScene(project, VIEW).relations.find(
      (each) => each.relation === first.relation,
    );
    expect(line?.stroke).toBe('#FFC9C9');
    expect(line?.darkStroke).toBe(adaptedForDark('#FFC9C9'));
  });

  it('adapts the own colors of notes and free arrows, and only on the dark canvas', () => {
    const shapes: FreeShape[] = [
      {
        kind: 'note',
        id: 'pale',
        x: 0,
        y: 900,
        width: 200,
        height: 60,
        text: 'Pale',
        fill: '#FFF3BF',
      },
      { kind: 'note', id: 'plain', x: 300, y: 900, width: 200, height: 60, text: 'Plain' },
      {
        kind: 'arrow',
        id: 'dark',
        from: { x: 0, y: 1000 },
        to: { x: 80, y: 1000 },
        stroke: '#1D1D1D',
      },
    ];
    const withShapes: ProjectSnapshot = {
      ...sample,
      views: sample.views.map((view) =>
        view.id === VIEW ? { ...view, freeShapes: [...view.freeShapes, ...shapes] } : view,
      ),
    };
    const scene = buildScene(adapting(withShapes), VIEW);
    const pale = scene.notes.find((each) => each.id === 'pale');
    const plain = scene.notes.find((each) => each.id === 'plain');
    const arrow = scene.arrows.find((each) => each.id === 'dark');
    if (!pale || !plain || !arrow) throw new Error('The free shapes are not in the scene.');
    expect(pale.adapted).toBe(true);
    expect(plain.adapted).toBeUndefined();
    const dark = THEMES.dark.canvas;
    expect(noteColors(pale, dark).fill).toBe(adaptedForDark('#FFF3BF'));
    expect(noteColors(pale, THEMES.light.canvas).fill).toBe('#FFF3BF');
    // Its text reads on the fill drawn: light on the dark fill.
    expect(noteColors(pale, dark).text).not.toBe(noteColors(pale, THEMES.light.canvas).text);
    expect(arrowStroke(arrow, dark)).toBe(adaptedForDark('#1D1D1D'));
    expect(arrowStroke(arrow, THEMES.light.canvas)).toBe('#1D1D1D');
    // A painted copy holds the colors drawn and is not adapted again.
    expect(noteColors(paintedNote(pale, dark), dark).fill).toBe(adaptedForDark('#FFF3BF'));
    // Without the setting, the same notes are drawn as stored in both themes.
    const asStored = buildScene(withShapes, VIEW).notes.find((each) => each.id === 'pale');
    expect(asStored?.adapted).toBeUndefined();
    expect(asStored && noteColors(asStored, dark).fill).toBe('#FFF3BF');
    expect(asStored && sameButPaint(asStored, pale, NOTE_PAINT)).toBe(true);
    const arrowAsStored = buildScene(withShapes, VIEW).arrows.find((each) => each.id === 'dark');
    expect(arrowAsStored && sameButPaint(arrowAsStored, arrow, ARROW_PAINT)).toBe(true);
  });

  it('is built alike from nothing and from the build before', () => {
    const project = adapting(stored);
    buildScene(stored, VIEW);
    expect(buildScene(project, VIEW)).toEqual(buildSceneAfresh(project, VIEW));
  });
});

describe('a theme switch with stored colors adapted', () => {
  it('draws again a tile of stored colors only when they are adapted, and only when they change', () => {
    const asStored = shapeOf(stored, 'scheduling');
    const adapted = shapeOf(adapting(stored), 'scheduling');
    // As stored, the tile is drawn alike in both themes, and a switch keeps its drawing.
    expect(drawingsFollowTheme(tileOf(asStored))).toBe(false);
    // Adapted, its colors change with the theme: it is drawn again, its labels tinted again.
    expect(drawingsFollowTheme(tileOf(adapted))).toBe(true);
    expect(labelsFollowTheme(tileOf(adapted))).toBe(true);
    // A stored color that turns into itself changes nothing, and its tile is kept.
    const gray = '#777777';
    const grayProject = adapting(
      applied(sample, {
        type: 'update-element',
        id: 'scheduling',
        changes: { appearance: { fill: gray, stroke: gray } },
      }),
    );
    const same = sameColor(adaptedForDark(gray), gray);
    expect(same).toBe(true);
    expect(drawingsFollowTheme(tileOf(shapeOf(grayProject, 'scheduling')))).toBe(false);
  });

  it('turns the setting on as a recolor in place: the shapes differ in their colors alone', () => {
    const before = buildScene(sample, VIEW);
    const after = buildScene(adapting(sample), VIEW);
    expect(after.shapes.map((shape) => shape.key)).toEqual(before.shapes.map((shape) => shape.key));
    after.shapes.forEach((shape, at) => {
      expect(sameButPaint(before.shapes[at] as ElementShape, shape, SHAPE_PAINT)).toBe(true);
    });
    // Only the shapes with a stored color change their dark colors; built-in ones keep theirs.
    const changed = after.shapes
      .filter((shape, at) => JSON.stringify(shape.dark) !== JSON.stringify(before.shapes[at]?.dark))
      .map((shape) => shape.element);
    expect(changed).toContain('booking-agent');
    expect(changed).not.toContain('scheduling');
  });
});
