/**
 * Drawing defaults on the canvas, the read-only page and the exports (A5.1, ADR 0086): what a project
 * that sets nothing is drawn with, and how each group of values a project or a view sets changes what
 * the scene, the canvas's drawings and labels, and the SVG draw. One representative value a group.
 */
import {
  DRAWING_BEFORE_A5,
  DRAWING_PRESETS,
  type ProjectSnapshot,
  type ResolvedDrawing,
} from '@visual-anything/core';
import { RELATES_TO_ID, type DrawingDefaults } from '@visual-anything/schema';
import { Graphics, type CanvasTextOptions } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { collapsedSample, richSample, SAMPLE_VIEW } from '../test/exports';
import { loadSample } from '../test/sample';
import { usersAndOrders, VIEW as TABLES_VIEW } from '../test/tables';
import { MEDIUM_FAMILY, writeSvg } from '../export/svg';
import { fontFor } from '../export/pdf';
import { drawShapeOutlines, writeRelationLabels, writeShapeLabels, type TextFactory } from './draw';
import {
  BASE_DRAWING,
  canvasDrawing,
  drawingOfView,
  nameWeightOf,
  roundedCornerRadius,
} from './drawing';
import { placeFarNames } from './farNames';
import { levelWithRows } from './rowsDraw';
import { buildScene, buildSceneAfresh, drawingOfScene, type ElementShape } from './scene';
import { painterOf } from './theme/painter';
import { THEMES } from '../theme/themes';
import { ROBOTO } from './robotoFonts';

/** A project whose drawing defaults are `project`, and whose view's are `view`. */
function drawn(
  base: ProjectSnapshot,
  project: DrawingDefaults | undefined,
  view?: { id: string; drawing: DrawingDefaults },
): ProjectSnapshot {
  return {
    ...base,
    project: { ...base.project, ...(project ? { drawing: project } : {}) },
    views: base.views.map((each) =>
      view && each.id === view.id ? { ...each, drawing: view.drawing } : each,
    ),
  };
}

/**
 * The sample with one relation of "relates to", whose width no package sets: the built-in packages
 * give their relation types widths of their own, which come first (ADR 0086).
 */
function withPlainRelation(base: ProjectSnapshot): ProjectSnapshot {
  const [first, ...rest] = base.model.relations;
  if (!first) throw new Error('The sample has no relations.');
  return {
    ...base,
    model: { ...base.model, relations: [{ ...first, relationType: RELATES_TO_ID }, ...rest] },
  };
}

/** The sample with no stored sizes, so that containers take the room their contents need. */
function unsized(base: ProjectSnapshot): ProjectSnapshot {
  return {
    ...base,
    views: base.views.map((view) => ({
      ...view,
      positions: view.positions.map(({ element, container, x, y }) => ({
        element,
        ...(container === undefined ? {} : { container }),
        x,
        y,
      })),
    })),
  };
}

/** The tables with their columns drawn by the canvas's own rows, not their package's face. */
function faceless(base: ProjectSnapshot): ProjectSnapshot {
  return {
    ...base,
    model: {
      ...base.model,
      elements: base.model.elements.map((element) =>
        element.component === 'data-modeling.column'
          ? { ...element, appearance: { ...element.appearance, face: 'none' } }
          : element,
      ),
    },
  };
}

function readSvg(text: string): Document {
  return new DOMParser().parseFromString(text, 'image/svg+xml');
}

const written: { text: string; kind: string; options: CanvasTextOptions }[] = [];
const recording: TextFactory = (options, kind) => {
  written.push({ text: String(options.text), kind, options });
  return undefined;
};

describe('the drawing a project that sets nothing is drawn with (A5.1)', () => {
  it('is Clean, since A5.2 made it the default', () => {
    expect(BASE_DRAWING).toEqual(DRAWING_PRESETS.clean);
    expect(BASE_DRAWING).not.toEqual(DRAWING_BEFORE_A5);
    expect(drawingOfView(loadSample(), SAMPLE_VIEW)).toBe(BASE_DRAWING);
    // Names ask for a weight the canvas loads: Medium, 500.
    expect(nameWeightOf(BASE_DRAWING)).toBe('500');
  });

  it('draws a project that sets an empty drawing as one that sets none', () => {
    const sample = loadSample();
    const empty = drawn(sample, {});
    expect(buildSceneAfresh(empty, SAMPLE_VIEW)).toEqual(buildSceneAfresh(sample, SAMPLE_VIEW));
    expect(writeSvg(empty, SAMPLE_VIEW).text).toBe(writeSvg(sample, SAMPLE_VIEW).text);
  });

  it('resolves once for each project and view drawing, the same object while they are the same', () => {
    const project: DrawingDefaults = { lines: { width: 3 } };
    const view: DrawingDefaults = { shapes: { borderWidth: 2 } };
    const resolved = canvasDrawing(project, view);
    expect(canvasDrawing(project, view)).toBe(resolved);
    expect(canvasDrawing({ lines: { width: 3 } }, view)).not.toBe(resolved);
    expect(resolved.lines.width).toBe(3);
    expect(resolved.shapes.borderWidth).toBe(2);
    // Laid over the base, Clean, every other value as it is there.
    expect(resolved.text).toEqual(DRAWING_PRESETS.clean.text);
  });

  it('starts a project or view that names a preset from that preset', () => {
    const resolved = canvasDrawing({ preset: 'dense', lines: { width: 3 } }, undefined);
    expect(resolved.text).toEqual(DRAWING_PRESETS.dense.text);
    expect(resolved.lines.width).toBe(3);
    // A view's own preset starts from it, not from the project's changes.
    const viewed = canvasDrawing({ lines: { width: 3 } }, { preset: 'expressive' });
    expect(viewed.lines.width).toBe(DRAWING_PRESETS.expressive.lines.width);
  });

  it('carries a drawing that differs on the scene, and lays the view out afresh for it', () => {
    const sample = loadSample();
    const before = buildScene(sample, SAMPLE_VIEW);
    expect(before.drawingDefaults).toBeUndefined();
    const project = drawn(sample, { lines: { width: 3 } });
    const after = buildScene(project, SAMPLE_VIEW);
    expect(drawingOfScene(after).lines.width).toBe(3);
    // Every shape is another object, so that the canvas draws every tile again.
    expect(after.shapes.some((shape, at) => shape === before.shapes[at])).toBe(false);
    // The same drawing again keeps the scene.
    expect(buildScene(project, SAMPLE_VIEW)).toBe(after);
  });
});

describe('each group of drawing defaults changes what is drawn (A5.1)', () => {
  it('lines: the width and arrowhead of lines no appearance sets, in the scene and the SVG', () => {
    const sample = withPlainRelation(richSample());
    const base = buildSceneAfresh(sample, SAMPLE_VIEW);
    const project = drawn(sample, { lines: { width: 4, arrowhead: 'open', arrowSize: 2 } });
    const scene = buildSceneAfresh(project, SAMPLE_VIEW);
    const widened = scene.relations.filter((line, at) => line.width !== base.relations[at]?.width);
    expect(widened.length).toBeGreaterThan(0);
    for (const line of widened) expect(line.width).toBe(4);
    const pointed = scene.relations.find((line) => line.arrowhead);
    expect(pointed?.arrowhead?.open).toBe(true);
    // The arrow of a free shape too: Clean's max(7, 4 × 4) long, twice.
    const arrow = scene.arrows[0];
    const length = arrow
      ? Math.hypot(
          arrow.arrowhead.tip.x - (arrow.arrowhead.left.x + arrow.arrowhead.right.x) / 2,
          arrow.arrowhead.tip.y - (arrow.arrowhead.left.y + arrow.arrowhead.right.y) / 2,
        )
      : 0;
    expect(length).toBeCloseTo(32);
    const svg = readSvg(writeSvg(project, SAMPLE_VIEW).text);
    const strokes = [...svg.querySelectorAll('[data-part="relations"] path')].map((path) =>
      path.getAttribute('stroke-width'),
    );
    expect(strokes).toContain('4');
    // An open arrowhead is stroked, not filled.
    expect(
      [...svg.querySelectorAll('[data-part="relations"] path[fill="none"]')].some(
        (path) => !(path.getAttribute('d') ?? '').endsWith('Z') && path.getAttribute('stroke'),
      ),
    ).toBe(true);
  });

  it('lines: none draws directed lines with no arrowhead', () => {
    const project = drawn(loadSample(), { lines: { arrowhead: 'none' } });
    expect(buildSceneAfresh(project, SAMPLE_VIEW).relations.some((line) => line.arrowhead)).toBe(
      false,
    );
  });

  it('shapes: the border width and the corner radius, on the canvas and in the SVG', () => {
    const sample = loadSample();
    const project = drawn(sample, { shapes: { borderWidth: 3, cornerRadius: 4 } });
    const scene = buildSceneAfresh(project, SAMPLE_VIEW);
    const drawing = drawingOfScene(scene);
    const rounded = scene.shapes.find(
      (shape) => shape.kind === 'rounded-rectangle' && !shape.holdsContents && !shape.outline,
    ) as ElementShape;
    expect(rounded).toBeDefined();
    const graphics = new Graphics();
    drawShapeOutlines(graphics, [rounded], undefined, drawing);
    const widths = graphics.context.instructions
      .filter((instruction) => instruction.action === 'stroke')
      .map((instruction) => (instruction.data as { style: { width: number } }).style.width);
    expect(widths).toContain(3);
    const svg = readSvg(writeSvg(project, SAMPLE_VIEW).text);
    const body = svg.querySelector(`g[data-shape="${rounded.key}"] rect`);
    expect(body?.getAttribute('stroke-width')).toBe('3');
    expect(Number(body?.getAttribute('rx'))).toBe(
      roundedCornerRadius(drawing, rounded.rect.width, rounded.rect.height),
    );
    expect(Number(body?.getAttribute('rx'))).toBe(4);
  });

  it('text: the name size and weight and the padding, on the canvas and in the SVG', () => {
    const sample = loadSample();
    const project = drawn(sample, { text: { nameSize: 18, nameWeight: 500, labelSize: 15 } });
    const scene = buildSceneAfresh(project, SAMPLE_VIEW);
    const drawing = drawingOfScene(scene);
    const plain = scene.shapes.find(
      (shape) => !shape.holdsContents && shape.rowCount === undefined && !shape.outline,
    ) as ElementShape;
    written.length = 0;
    writeShapeLabels([plain], true, recording, undefined, undefined, drawing);
    const name = written.find((each) => each.kind === 'name');
    expect(name?.options.style).toMatchObject({ fontSize: 18, fontWeight: '500' });
    written.length = 0;
    writeRelationLabels(
      scene.relations.filter((line) => line.label),
      recording,
      undefined,
      drawing,
    );
    expect(written[0]?.options.style).toMatchObject({ fontSize: 15 });
    const svg = readSvg(writeSvg(project, SAMPLE_VIEW).text);
    const text = [...svg.querySelectorAll(`g[data-shape="${plain.key}"] text`)].find(
      (each) => each.textContent === plain.name,
    );
    expect(text?.getAttribute('font-size')).toBe('18');
    expect(text?.getAttribute('font-weight')).toBe('500');
    // Named for the PDF, which embeds Roboto Medium for it.
    expect(text?.getAttribute('font-family')).toContain(MEDIUM_FAMILY);
    expect(fontFor(text?.getAttribute('font-family') ?? '', false, false, false, true)).toBe(
      'va-medium',
    );
  });

  it('text: the padding moves a name placed at the top of its shape', () => {
    const sample = loadSample();
    const top = (padding: number) => {
      const project = drawn(sample, { text: { padding } });
      const scene = buildSceneAfresh(project, SAMPLE_VIEW);
      const shape = {
        ...(scene.shapes.find(
          (each) => !each.holdsContents && each.rowCount === undefined && !each.outline,
        ) as ElementShape),
        textPlacement: 'top' as const,
      };
      written.length = 0;
      writeShapeLabels([shape], true, recording, undefined, undefined, drawingOfScene(scene));
      return (written.find((each) => each.kind === 'name')?.options.y ?? 0) - shape.rect.y;
    };
    // By the padding, within the rounding of Clean's line height.
    expect(top(16) - top(8)).toBeCloseTo(8, 0);
  });

  it('containers: the padding around contents, in the scene and the SVG', () => {
    const sample = unsized(loadSample());
    const base = buildSceneAfresh(sample, SAMPLE_VIEW);
    const project = drawn(sample, { containers: { padding: 64 } });
    const scene = buildSceneAfresh(project, SAMPLE_VIEW);
    const grown = scene.shapes.filter(
      (shape, at) => shape.holdsContents && shape.rect.width !== base.shapes[at]?.rect.width,
    );
    expect(grown.length).toBeGreaterThan(0);
    const svg = readSvg(writeSvg(project, SAMPLE_VIEW).text);
    const [first] = grown;
    const rect = svg.querySelector(`g[data-shape="${first?.key}"] rect`);
    expect(Number(rect?.getAttribute('width'))).toBe(first?.rect.width);
  });

  it('aggregated: lines that do not grow with their count, in the scene and the SVG', () => {
    const sample = collapsedSample();
    const growing = drawn(sample, { aggregated: { growsWithCount: true } });
    const base = buildSceneAfresh(growing, SAMPLE_VIEW).relations.filter((line) => line.aggregate);
    expect(base.length).toBeGreaterThan(0);
    const project = drawn(sample, { aggregated: { growsWithCount: false } });
    const lines = buildSceneAfresh(project, SAMPLE_VIEW).relations.filter((line) => line.aggregate);
    lines.forEach((line, at) => {
      expect(line.width).toBeLessThan(base[at]?.width ?? 0);
      // A built-in type's width yields to Clean's (ADR 0086).
      expect(line.width).toBe(BASE_DRAWING.lines.width);
    });
    const svg = readSvg(writeSvg(project, SAMPLE_VIEW).text);
    const path = svg.querySelector(`[data-part="relations"] g[data-relations] path`);
    expect(path?.getAttribute('stroke-width')).toBe(String(BASE_DRAWING.lines.width));
  });

  it('reading: the scales names far out and rows show from, and the size far names are written at', () => {
    const project = drawn(usersAndOrders(), { reading: { rowsFrom: 0.3, farNameSize: 20 } });
    const scene = buildSceneAfresh(project, TABLES_VIEW);
    const { reading } = drawingOfScene(scene);
    const rows = scene.shapes.filter((shape) => shape.row !== undefined);
    // At 0.5, rows write their texts in this drawing, which they would not before.
    expect(levelWithRows(rows, 1, 0.5)).toBe(1);
    expect(levelWithRows(rows, 1, 0.5, reading.rowsFrom)).toBe(2);
    const camera = { x: 0, y: 0, scale: 0.29 };
    const far = placeFarNames(
      scene.shapes,
      camera,
      { width: 2000, height: 2000 },
      { size: reading.farNameSize, rowsFrom: reading.rowsFrom },
    );
    const near = placeFarNames(scene.shapes, camera, { width: 2000, height: 2000 });
    expect(far.length).toBeGreaterThan(0);
    expect(far[0]?.plate.height).toBeGreaterThan(near[0]?.plate.height ?? Infinity);
  });

  it('a view changes them again for itself, over its project', () => {
    const sample = loadSample();
    const project = drawn(
      sample,
      { lines: { width: 3 } },
      { id: SAMPLE_VIEW, drawing: { lines: { width: 5 } } },
    );
    expect(drawingOfView(project, SAMPLE_VIEW).lines.width).toBe(5);
    expect(drawingOfView(project).lines.width).toBe(3);
  });

  it('draws with a painter of the scene’s drawing, one for each theme', () => {
    const drawing: ResolvedDrawing = canvasDrawing({ shapes: { borderWidth: 2 } }, undefined);
    const light = painterOf(THEMES.light.canvas, drawing);
    expect(light.drawing).toBe(drawing);
    expect(painterOf(THEMES.light.canvas, drawing)).toBe(light);
    expect(painterOf(THEMES.dark.canvas, drawing).drawing).toBe(drawing);
    expect(painterOf(THEMES.light.canvas).drawing).toBe(BASE_DRAWING);
  });
});

describe('the SVG’s fonts (A5.1)', () => {
  it('names the bundled Roboto first, and writes names in the weight they are drawn in', () => {
    const svg = readSvg(writeSvg(loadSample(), SAMPLE_VIEW).text);
    expect(svg.documentElement.getAttribute('font-family')?.startsWith(`'${ROBOTO}'`)).toBe(true);
    const weights = new Set(
      [...svg.querySelectorAll('[data-part="shapes"] text[font-weight]')].map((text) =>
        text.getAttribute('font-weight'),
      ),
    );
    // Clean writes names, and a region's tab, in Roboto Medium.
    expect([...weights]).toEqual(['500']);
  });

  it('writes a table’s rows in columns, each type from one x in Roboto Mono', () => {
    const project = faceless(usersAndOrders());
    const scene = buildScene(project, TABLES_VIEW);
    const svg = readSvg(writeSvg(project, TABLES_VIEW).text);
    const rows = scene.shapes.filter((shape) => shape.row !== undefined && shape.columns);
    expect(rows.length).toBeGreaterThan(1);
    const xs = new Set<string>();
    for (const row of rows) {
      const type = [...svg.querySelectorAll(`g[data-shape="${row.key}"] text`)].find(
        (text) => text.textContent === row.columns?.type,
      );
      if (row.columns?.type === '') continue;
      expect(type?.getAttribute('font-family')).toContain('Roboto Mono');
      xs.add(String(Number(type?.getAttribute('x')) - row.rect.x));
    }
    // Every row of a table starts its type at the same x from its left side.
    const byTable = new Map<string | undefined, Set<number>>();
    for (const row of rows) {
      const set = byTable.get(row.containerShape) ?? new Set<number>();
      set.add(row.columns?.typeX ?? 0);
      byTable.set(row.containerShape, set);
    }
    for (const set of byTable.values()) expect(set.size).toBe(1);
    expect(xs.size).toBeGreaterThan(0);
  });
});
