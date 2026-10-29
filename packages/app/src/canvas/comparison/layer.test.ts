import { compareProjects, compareView, type ProjectSnapshot } from '@visual-anything/core';
import { Container, Graphics } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syntheticProject } from '../../bench/synthetic';
import { comparedSample, done, VIEW } from '../../test/comparison';
import { FakeApplication, FakeResizeObserver } from '../../test/FakeApplication';
import { THEMES } from '../../theme/themes';
import type { TextFactory } from '../draw';
import { indexScene } from '../hit';
import { CanvasRenderer } from '../renderer';
import {
  ComparisonLayer,
  MARKS_PER_CHUNK,
  borderPoint,
  drawMarkItem,
  markColor,
  markItems,
} from './layer';
import { CHANGE_MARKS, comparisonScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../../test/FakeApplication');
  return { ...pixi, Application };
});

const counting: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

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
    { text: counting, firstFit: 'whole' },
  );
  (FakeApplication.created.at(-1) as FakeApplication).finishInit();
  await Promise.resolve();
  await Promise.resolve();
  return renderer;
}

/** A label that keeps its text, as the bitmap labels do. */
const label = () => Object.assign(new Container(), { text: '' });

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

describe('the comparison’s marks', () => {
  const { older, newer, view } = comparedSample();

  it('mark every marked shape, line and free shape, and every move', () => {
    const shown = comparisonScene(older, newer, VIEW, view, 'comparison');
    const items = markItems(shown);
    const kinds = items.map((item) => item.kind);
    expect(kinds.filter((kind) => kind === 'shape')).toHaveLength(shown.shapes.size);
    expect(kinds.filter((kind) => kind === 'line')).toHaveLength(shown.lines.size);
    expect(kinds.filter((kind) => kind === 'move')).toHaveLength(shown.moves.length);
    expect(kinds).toContain('note');
  });

  it('draw each state in its own color, with its glyph and its pattern', () => {
    const shown = comparisonScene(older, newer, VIEW, view, 'comparison');
    const theme = THEMES.dark.canvas;
    for (const item of markItems(shown)) {
      const graphics = new Graphics();
      drawMarkItem(graphics, item, 1, theme);
      const colors = new Set(
        graphics.context.instructions.flatMap((instruction) => {
          const style = (instruction.data as { style?: { color?: number } }).style;
          return style?.color === undefined ? [] : [style.color];
        }),
      );
      const mark = item.kind === 'move' ? 'moved' : item.mark;
      expect(colors.has(Number.parseInt(markColor(theme, mark).slice(1), 16))).toBe(true);
      expect(graphics.context.instructions.length).toBeGreaterThan(0);
    }
  });

  it('take the colors of each theme’s four tokens', () => {
    for (const mark of CHANGE_MARKS) {
      expect(markColor(THEMES.light.canvas, mark)).not.toBe(markColor(THEMES.dark.canvas, mark));
    }
  });

  it('write on a collapsed container how many changes it hides', () => {
    const collapse = (state: ProjectSnapshot) =>
      done(state, { type: 'set-collapsed', view: VIEW, elements: ['scheduling'], collapsed: true });
    const was = collapse(older);
    const is = collapse(newer);
    const comparison = compareProjects(was, is);
    const states = compareView(comparison, was, is, VIEW);
    const layer = new ComparisonLayer(label, () => {}, THEMES.light.canvas);
    layer.set(comparisonScene(was, is, VIEW, states, 'before'));
    expect(layer.countTexts).toEqual(['2']);
    // After, what was removed is not drawn, and nothing else changed inside.
    layer.set(comparisonScene(was, is, VIEW, states, 'after'));
    expect(layer.countTexts).toEqual([]);
  });

  it('meet the edge of a rectangle along the line to another point', () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 };
    expect(borderPoint(rect, { x: 50, y: 25 }, { x: 250, y: 25 })).toEqual({ x: 100, y: 25 });
    expect(borderPoint(rect, { x: 50, y: 25 }, { x: 50, y: -100 })).toEqual({ x: 50, y: 0 });
    expect(borderPoint(rect, { x: 50, y: 25 }, { x: 50, y: 25 })).toEqual({ x: 50, y: 25 });
  });
});

describe('the renderer with a comparison', () => {
  it('draws the comparison’s marks, and none once it ends', async () => {
    const { older, newer, view } = comparedSample();
    const shown = comparisonScene(older, newer, VIEW, view, 'comparison');
    const renderer = await started();
    renderer.show(indexScene(shown.scene));
    renderer.setComparison(shown);
    expect(renderer.comparisonMarks.size).toBe(markItems(shown).length);
    renderer.renderNow();
    expect(renderer.comparisonMarks.pending).toBe(false);
    renderer.setComparison(undefined);
    expect(renderer.comparisonMarks.size).toBe(0);
  });

  it('marks 10,000 changed shapes a few chunks a frame', async () => {
    const older = syntheticProject({ elements: 10_000 });
    const newer: ProjectSnapshot = {
      ...older,
      model: {
        ...older.model,
        elements: older.model.elements.map((element) =>
          element.id === older.model.world.id ? element : { ...element, name: `${element.name}!` },
        ),
      },
    };
    const comparison = compareProjects(older, newer);
    const viewId = older.views[0]?.id ?? '';
    const shown = comparisonScene(
      older,
      newer,
      viewId,
      compareView(comparison, older, newer, viewId),
      'after',
    );
    expect(shown.shapes.size).toBeGreaterThanOrEqual(10_000);
    const renderer = await started();
    renderer.show(indexScene(shown.scene));
    const started_ = performance.now();
    renderer.setComparison(shown);
    const firstFrame = performance.now() - started_;
    // A frame draws two chunks at most: the rest wait for the frames after it.
    expect(renderer.comparisonMarks.pending).toBe(true);
    let frames = 0;
    const times: number[] = [];
    while (renderer.comparisonMarks.pending && frames < 100) {
      const at = performance.now();
      renderer.renderNow();
      times.push(performance.now() - at);
      frames += 1;
    }
    expect(frames).toBeGreaterThanOrEqual(Math.ceil(shown.shapes.size / (2 * MARKS_PER_CHUNK)) - 1);
    expect(renderer.comparisonMarks.pending).toBe(false);
    // Recorded, not held to: the laptop the tests run on is slow (see the spec's benchmark notes).
    console.info(
      `Comparison marks at 10,000 shapes: first ${firstFrame.toFixed(1)} ms, then ${frames} frames, slowest ${Math.max(...times).toFixed(1)} ms.`,
    );
  }, 60_000);
});
