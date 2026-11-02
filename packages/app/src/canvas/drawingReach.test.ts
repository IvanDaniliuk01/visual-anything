/**
 * No copied constants (A5.7, ADR 0086): the measures the review found fixed read the resolved drawing,
 * and a container's name and detail rooms grow with their sizes, so that no value the panel or Claude
 * allows makes a name or a detail disappear, on the canvas and in the SVG.
 */
import {
  definitionsIn,
  legendOf,
  resolveDrawing,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { DrawingDefaults, DrawingPreset, Overlay, ViewFile } from '@visual-anything/schema';
import type { Text } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { withLegendBand } from '../export/legendBand';
import { layOutBand } from '../export/legendLayout';
import { writeSvg } from '../export/svg';
import { t } from '../i18n';
import { collapsedSample, SAMPLE_VIEW } from '../test/exports';
import { loadSample } from '../test/sample';
import { collapsedHeight, countLineTopOf, headerWrapOf } from './collapse';
import { fitText, writeShapeLabels, type TextFactory } from './draw';
import {
  BASE_DRAWING,
  canvasDrawing,
  headerPlacesOf,
  headerRoomsOf,
  nameWeightOf,
} from './drawing';
import { putInsideCommand } from './drop';
import { indexScene } from './hit';
import { cutOnCanvas } from './hoverCut';
import { NamesBeside } from './namesBeside';
import { avoidShapesOf, namePlateOf } from './routing/avoided';
import {
  buildSceneAfresh,
  containerHeaderOf,
  contentsOriginOf,
  drawingOfScene,
  type ElementShape,
} from './scene';
import { regionTabOf } from './regionDraw';
import { canvasMeasure, robotoMeasure } from './textBlock';

const PRESETS: DrawingPreset[] = ['clean', 'dense', 'expressive', 'high-contrast'];

/** How tall a bitmap label of one line is drawn, in ems: Roboto's ascent and descent together. */
const LABEL_LINE = 1.172;

function drawnWith(base: ProjectSnapshot, drawing: DrawingDefaults): ProjectSnapshot {
  return { ...base, project: { ...base.project, drawing } };
}

function shapeOf(shapes: readonly ElementShape[], key: string): ElementShape {
  const shape = shapes.find((each) => each.key === key);
  if (!shape) throw new Error(`No shape ${key}.`);
  return shape;
}

/**
 * The labels the canvas keeps of a shape, each fitted in its room as a bitmap label of one line
 * would be: as tall as `LABEL_LINE` ems, cut and then left out when its room is shorter.
 */
function keptLabels(shape: ElementShape, drawing: ReturnType<typeof drawingOfScene>): string[] {
  const kept: string[] = [];
  const fitting: TextFactory = (options, _kind, room) => {
    const size = Number(options.style?.fontSize ?? 0);
    const label = { text: String(options.text), height: LABEL_LINE * size, destroy() {} };
    const fitted = fitText(label, room);
    if (fitted) kept.push(fitted.text);
    return undefined;
  };
  writeShapeLabels([shape], true, fitting, undefined, undefined, drawing);
  return kept;
}

function svgTextsOf(project: ProjectSnapshot, key: string): string[] {
  const svg = new DOMParser().parseFromString(writeSvg(project, SAMPLE_VIEW).text, 'image/svg+xml');
  const group = svg.querySelector(`[data-shape="${key}"]`);
  return [...(group?.querySelectorAll('text') ?? [])].map((text) => text.textContent ?? '');
}

const CLINIC = 'clinic-booking';
const SCHEDULING = 'clinic-booking/scheduling';
/** The largest container name and detail the drawing allows, drawn as their kind. */
const LARGEST: DrawingDefaults = {
  text: { containerNameSize: 32, detailSize: 24 },
  containers: { drawn: 'as-kind' },
};

describe('a container’s header rooms (A5.7)', () => {
  it('keeps the rooms of before at the sizes of before', () => {
    const base = drawingOfScene(buildSceneAfresh(loadSample(), SAMPLE_VIEW));
    expect(headerRoomsOf(base, 400)).toEqual({ name: 20, detail: 16 });
    expect(headerRoomsOf(base, 40)).toEqual({ name: 20, detail: 8 });
    expect(
      containerHeaderOf({ ...base, containers: { ...base.containers, drawn: 'as-kind' } }),
    ).toBe(48);
  });

  it.each([
    ['the largest sizes', LARGEST],
    [
      'the largest sizes at the least line height',
      { ...LARGEST, text: { ...LARGEST.text, lineHeight: 1 } },
    ],
    [
      'the largest sizes at the most line height',
      { ...LARGEST, text: { ...LARGEST.text, lineHeight: 2 } },
    ],
  ])(
    'writes an open container’s name and detail at %s, on the canvas and in the SVG',
    (_, drawing) => {
      const project = drawnWith(loadSample(), drawing);
      const scene = buildSceneAfresh(project, SAMPLE_VIEW);
      const resolved = drawingOfScene(scene);
      const clinic = shapeOf(scene.shapes, CLINIC);
      expect(clinic.region).toBeFalsy();
      const detail = clinic.detail ?? clinic.componentName;
      const canvas = keptLabels(clinic, resolved);
      expect(canvas).toHaveLength(2);
      expect(canvas[0]?.slice(0, 3)).toBe(clinic.name.slice(0, 3));
      expect(canvas[1]?.slice(0, 3)).toBe(detail.slice(0, 3));
      const svg = svgTextsOf(project, CLINIC);
      expect(svg.some((text) => text.startsWith(clinic.name.slice(0, 3)))).toBe(true);
      expect(svg.some((text) => text.startsWith(detail.slice(0, 3)))).toBe(true);
      // The header holds both as they are drawn, so its contents start under them.
      const { detailTop } = headerPlacesOf(resolved);
      const { detailSize } = resolved.text;
      expect(containerHeaderOf(resolved)).toBeGreaterThanOrEqual(
        detailTop + LABEL_LINE * detailSize,
      );
    },
  );

  it('writes a collapsed container’s name and detail at the largest sizes, on the canvas and in the SVG', () => {
    for (const drawing of [LARGEST, { text: LARGEST.text }]) {
      const project = drawnWith(collapsedSample(), drawing);
      const scene = buildSceneAfresh(project, SAMPLE_VIEW);
      const scheduling = shapeOf(scene.shapes, SCHEDULING);
      expect(scheduling.collapsed).toBeDefined();
      const canvas = keptLabels(scheduling, drawingOfScene(scene));
      expect(canvas.length).toBeGreaterThanOrEqual(2);
      expect(canvas[0]?.slice(0, 3)).toBe(scheduling.name.slice(0, 3));
      const svg = svgTextsOf(project, SCHEDULING);
      expect(svg.some((text) => text.startsWith(scheduling.name.slice(0, 3)))).toBe(true);
      expect(svg.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('wraps a collapsed header’s detail at the drawing’s detail size, and grows to hold its lines', () => {
    const shape = { detail: 'Books visits for the clinic', componentName: 'System' };
    const small = resolveDrawing({ text: { detailSize: 8 } }, undefined);
    const large = resolveDrawing({ text: { detailSize: 24 } }, undefined);
    const wrap = robotoMeasure(shape.detail, 'regular', 11) + 4;
    expect(collapsedHeight(shape, 60, wrap, robotoMeasure, small)).toBe(60);
    expect(collapsedHeight(shape, 60, wrap, robotoMeasure, large)).toBeGreaterThan(60);
  });

  it('writes a region’s name and detail at the largest sizes, at the least line height', () => {
    const project = drawnWith(loadSample(), {
      text: { containerNameSize: 32, detailSize: 24, lineHeight: 1 },
    });
    const scene = buildSceneAfresh(project, SAMPLE_VIEW);
    const clinic = shapeOf(scene.shapes, CLINIC);
    expect(clinic.region).toBe(true);
    expect(keptLabels(clinic, drawingOfScene(scene))[0]?.slice(0, 3)).toBe(clinic.name.slice(0, 3));
  });
});

describe('a region’s tab at the largest sizes (A5 review)', () => {
  /** A C4 container drawn as a region, whose detail says more than its component's name. */
  function regionWithDetail(lineHeight: number) {
    const project = drawnWith(loadSample('c4-architecture'), {
      text: { containerNameSize: 32, detailSize: 24, lineHeight },
    });
    const view = 'containers';
    const scene = buildSceneAfresh(project, view);
    const region = scene.shapes.find(
      (shape) =>
        shape.region === true && shape.detail !== '' && shape.detail !== shape.componentName,
    );
    if (!region) throw new Error('No region with a detail of its own.');
    return { project, view, scene, region };
  }

  it.each([1, 1.35, 2])(
    'writes its name and detail at line height %s, on the canvas and in the SVG',
    (lineHeight) => {
      const { project, view, scene, region } = regionWithDetail(lineHeight);
      const drawing = drawingOfScene(scene);
      const tab = regionTabOf(region, drawing);
      expect(tab.detail?.text).toBe(region.detail);
      const kept = keptLabels(region, drawing);
      expect(kept.some((text) => text.startsWith(region.name.slice(0, 3)))).toBe(true);
      expect(kept.some((text) => text.startsWith(region.detail.slice(0, 3)))).toBe(true);
      const svg = new DOMParser().parseFromString(writeSvg(project, view).text, 'image/svg+xml');
      const texts = [
        ...(svg.querySelector(`[data-shape="${region.key}"]`)?.querySelectorAll('text') ?? []),
      ].map((text) => text.textContent ?? '');
      expect(texts.some((text) => text.startsWith(region.name.slice(0, 3)))).toBe(true);
      expect(texts.some((text) => text.startsWith(region.detail.slice(0, 3)))).toBe(true);
    },
  );

  it('keeps the header of 48 at every preset’s own sizes', () => {
    for (const preset of PRESETS) {
      const drawing = resolveDrawing({ preset }, undefined);
      if (drawing.containers.drawn === 'region') expect(containerHeaderOf(drawing)).toBe(48);
    }
  });
});

describe('what reads the resolved drawing rather than a copy (A5.7)', () => {
  it('resolves drawing defaults with the core', () => {
    const layers: [DrawingDefaults | undefined, DrawingDefaults | undefined][] = [
      [undefined, undefined],
      [{ lines: { width: 3 } }, { text: { nameSize: 20 } }],
      [{ preset: 'dense' }, { shapes: { borderWidth: 2 } }],
      [{ lines: { width: 3 } }, { preset: 'expressive' }],
    ];
    for (const [project, view] of layers) {
      expect(canvasDrawing(project, view)).toEqual(resolveDrawing(project, view));
    }
  });

  it('judges a container’s cut by the sizes its drawing writes in', () => {
    const asKind = drawnWith(loadSample(), { containers: { drawn: 'as-kind' } });
    const scene = buildSceneAfresh(asKind, SAMPLE_VIEW);
    const base = drawingOfScene(scene);
    const clinic = shapeOf(scene.shapes, CLINIC);
    const large = { ...base, text: { ...base.text, containerNameSize: 32 } };
    // A name that fits at 12 and not at 32.
    const wrap = headerWrapOf(clinic, base);
    let name = 'Booking';
    while (canvasMeasure(name, 'bold', 32) <= wrap) name += ' desk';
    const shape = { ...clinic, name };
    expect(cutOnCanvas(shape, canvasMeasure, base)).toBe(false);
    expect(cutOnCanvas(shape, canvasMeasure, large)).toBe(true);
  });

  it('judges a region’s cut by its name tab', () => {
    const scene = buildSceneAfresh(loadSample(), SAMPLE_VIEW);
    const clinic = shapeOf(scene.shapes, CLINIC);
    expect(clinic.region).toBe(true);
    expect(cutOnCanvas(clinic)).toBe(false);
    expect(cutOnCanvas({ ...clinic, name: 'Clinic booking '.repeat(20) })).toBe(true);
  });

  it('writes names beside shapes in the drawing’s name weight, at its size on screen', () => {
    const part = {
      key: 'arm/apex',
      element: 'apex',
      name: 'Apex',
      part: { solid: 'arm', inDrawing: true, point: { x: 0, y: 0 } },
    } as unknown as ElementShape;
    const dense = resolveDrawing({ preset: 'dense' }, undefined);
    const names = new NamesBeside();
    names.show([part], 1, { text: '#000000', back: '#FFFFFF' });
    const [text] = names.container.children as Text[];
    expect(text?.style.fontWeight).toBe(nameWeightOf(BASE_DRAWING));
    expect(text?.style.fontSize).toBe(BASE_DRAWING.reading.farNameSize);
    names.show([part], 1, { text: '#000000', back: '#FFFFFF' }, dense);
    expect(text?.style.fontSize).toBe(dense.reading.farNameSize);
    // Never a weight the canvas does not load.
    expect(['400', '500', '700']).toContain(text?.style.fontWeight);
    names.destroy();
  });

  it('starts what is dropped inside a container at the drawing’s padding, under its header', () => {
    for (const name of ['dense', 'expressive'] as const) {
      const project = drawnWith(loadSample(), { preset: name });
      const scene = buildSceneAfresh(project, SAMPLE_VIEW);
      const drawing = drawingOfScene(scene);
      const clinic = shapeOf(scene.shapes, CLINIC);
      const other = scene.shapes.find(
        (each) => each.containerShape === undefined && each.key !== CLINIC,
      );
      if (!other) throw new Error('No shape outside the clinic.');
      const atCorner = { ...other, rect: { ...other.rect, x: clinic.rect.x, y: clinic.rect.y } };
      const command = putInsideCommand(indexScene(scene), project, SAMPLE_VIEW, atCorner, clinic);
      expect(command.shapes[0]?.at).toMatchObject(contentsOriginOf(drawing));
    }
    const expressive = resolveDrawing({ preset: 'expressive' }, undefined);
    expect(contentsOriginOf(expressive)).toEqual({ x: 32, y: 51 });
    expect(contentsOriginOf(resolveDrawing({ preset: 'dense' }, undefined)).x).toBe(16);
  });

  it('estimates a container’s name plate at the drawing’s sizes', () => {
    const asKind = drawnWith(loadSample(), { containers: { drawn: 'as-kind' } });
    const scene = buildSceneAfresh(asKind, SAMPLE_VIEW);
    const base = drawingOfScene(scene);
    const clinic = shapeOf(scene.shapes, CLINIC);
    const large = resolveDrawing(LARGEST, undefined);
    const plate = namePlateOf(clinic, base);
    const larger = namePlateOf(clinic, large);
    expect(plate?.height).toBe(44);
    expect(larger?.height).toBe(countLineTopOf(large));
    expect(larger?.width ?? 0).toBeGreaterThan(plate?.width ?? 0);
    const largeScene = buildSceneAfresh(drawnWith(loadSample(), LARGEST), SAMPLE_VIEW);
    const drawing = drawingOfScene(largeScene);
    expect(avoidShapesOf(largeScene.shapes, drawing).shapes.plateHeight).toBe(
      countLineTopOf(drawing),
    );
  });

  it('writes the PNG’s legend band at the sizes the SVG writes it, for every preset', () => {
    const sample = loadSample();
    const view = sample.views.find((each) => each.id === SAMPLE_VIEW) as ViewFile;
    const owner: Overlay = {
      id: 'owner',
      name: 'Team',
      of: 'elements',
      attribute: 'owner',
      channel: 'fill',
      mapping: {
        kind: 'discrete',
        cases: [{ value: 'Scheduling team', color: '#FFFF00' }],
        otherwise: '#6B7280',
      },
    };
    const legend = legendOf({ ...view, overlays: [owner] }, definitionsIn(sample), 'light');
    for (const name of PRESETS) {
      const drawing = resolveDrawing({ preset: name }, undefined);
      const fonts: string[] = [];
      const context = {
        font: '',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        globalAlpha: 1,
        textBaseline: '',
        measureText: (text: string) => ({ width: text.length * 7 }),
        drawImage: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        fillText() {
          fonts.push(context.font);
        },
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        save: () => {},
        restore: () => {},
      };
      const make = () =>
        ({ width: 0, height: 0, getContext: () => context }) as unknown as HTMLCanvasElement;
      const image = { width: 800, height: 600 } as HTMLCanvasElement;
      withLegendBand(image, legend, t, 'light', 1, drawing, make);
      const band = layOutBand(legend, t, (text) => text.length * 7, 800, 1, 'light', drawing);
      const written = band.items.flatMap((item) => (item.kind === 'text' ? [item.font] : []));
      expect(fonts).toEqual(written);
      expect(written.some((font) => font.includes(`${drawing.text.labelSize}px`))).toBe(true);
    }
  });
});
