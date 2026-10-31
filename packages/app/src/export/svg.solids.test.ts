/**
 * Solids in the SVG and the PDF (ADR 0075): from the app, each solid is its picture, which the solid
 * worker draws at two pixels a unit, held as a PNG, and each anchored part of a drawing with parts is a
 * transparent path traced from its picture's part buffer, with its ids; without a GPU, as from the
 * command line and Claude's `export_view`, each solid is its placeholder, and the export says so.
 * The solid worker here is the stand-in, which draws a box for each part.
 */
import { solidHash } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { buildScene, type ElementShape } from '../canvas/scene';
import { isAnchoredSolidPart } from '../canvas/solidMark';
import { createSolidClient, type SolidFileResult } from '../solids/client';
import { StandInSolidWorker, type StandInBitmap } from '../solids/stand-in';
import { ARM_FILE, ARM_ID, armDefinition, withSolids } from '../test/solids';
import { exportView, solidPicturesFor } from './exports';
import type { SolidPainter } from './solid-pictures';
import { solidPainterOf } from './solid-painter';
import { partValues, tracedPathData } from './solid-trace';
import { writeSvg } from './svg';

const VIEW = 'robot';

/** The stand-in worker's pictures, read as the browser reads an `ImageBitmap`'s pixels. */
function standInPixels(bitmap: ImageBitmap) {
  const drawn = bitmap as unknown as StandInBitmap;
  return { width: drawn.width, height: drawn.height, pixels: drawn.pixels };
}

/** A painter of the stand-in worker, with the arm's file from the program. */
function standInPainter(): { painter: SolidPainter; worker: () => StandInSolidWorker } {
  let worker: StandInSolidWorker | undefined;
  const client = createSolidClient({
    files: {
      get: (hash): Promise<SolidFileResult> =>
        Promise.resolve(
          hash === solidHash(ARM_FILE)
            ? { ok: true, bytes: ARM_FILE.slice() }
            : { ok: false, code: 'solid-file-missing', message: 'No such file.' },
        ),
    },
    start: () => (worker = new StandInSolidWorker()),
  });
  return {
    painter: solidPainterOf(client, standInPixels, 5_000),
    worker: () => worker as StandInSolidWorker,
  };
}

function readSvg(text: string): Document {
  const document = new DOMParser().parseFromString(text, 'image/svg+xml');
  const errors = document.getElementsByTagName('parsererror');
  if (errors.length > 0) throw new Error(`The SVG does not parse: ${errors[0]?.textContent}`);
  return document;
}

function shapesShowingSolids(): ElementShape[] {
  return buildScene(withSolids(), VIEW).shapes.filter(
    (shape) => shape.solid !== undefined && !isAnchoredSolidPart(shape),
  );
}

describe('solids in the SVG, without a GPU', () => {
  it('draws each solid as its placeholder, and says so', () => {
    const drawing = writeSvg(withSolids(), VIEW);
    const document = readSvg(drawing.text);
    const marks = document.querySelectorAll('[data-part="solid-placeholder"]');
    expect(marks.length).toBe(shapesShowingSolids().length);
    expect(marks.length).toBeGreaterThanOrEqual(3);
    expect(drawing.text).not.toContain('va-solid-');
    expect(document.querySelector('[data-part="solid-parts"]')).toBeNull();
    expect(drawing.lost).toContain(
      'Solids are drawn as placeholders, their outline, name and a mark: only the app draws their pictures.',
    );
  });

  it('draws nothing of an anchored part of a solid, which its drawing’s picture draws', () => {
    const document = readSvg(writeSvg(withSolids(), VIEW).text);
    for (const element of ['base', 'link', 'gripper', 'wrist']) {
      const group = document.querySelector(`[data-part="shapes"] [data-element="${element}"]`);
      expect(group?.childNodes.length ?? 0).toBe(0);
    }
    // The contents that are no anchored parts are drawn as any shape.
    const extra = document.querySelector('[data-part="shapes"] [data-element="extra"]');
    expect(extra?.childNodes.length).toBeGreaterThan(0);
  });

  it('says so from exportView without a painter, as the command line and export_view call it', async () => {
    const exported = await exportView(withSolids(), VIEW, 'svg');
    expect(exported.lost.some((each) => each.startsWith('Solids are drawn as placeholders'))).toBe(
      true,
    );
  });
});

describe('solids in the SVG, from the app', () => {
  it('holds each solid’s picture as a PNG at two pixels a unit, written once for each picture', async () => {
    const { painter, worker } = standInPainter();
    const exported = await exportView(withSolids(), VIEW, 'svg', { solids: painter });
    const text = exported.text as string;
    const document = readSvg(text);
    expect(document.querySelectorAll('[data-part="solid-placeholder"]').length).toBe(0);
    const symbols = [...document.querySelectorAll('symbol[id^="va-solid-"]')];
    expect(symbols.length).toBeGreaterThan(0);
    for (const symbol of symbols) {
      expect(symbol.querySelector('image')?.getAttribute('href')).toMatch(
        /^data:image\/png;base64,iVBORw0KGgo/,
      );
    }
    const uses = document.querySelectorAll('use[href^="#va-solid-"]');
    expect(uses.length).toBe(shapesShowingSolids().length);
    expect(exported.lost.some((each) => each.includes('placeholder'))).toBe(false);
    // The arm's drawing is 320 units a side: its picture is drawn at the 1,024 bucket.
    const draws = worker().ofType('draw');
    expect(draws.some((draw) => draw.parts && draw.size.width === 1024)).toBe(true);
  });

  it('writes each anchored part as a transparent path traced from its part buffer, with its ids', async () => {
    const { painter } = standInPainter();
    const project = withSolids();
    const solids = await solidPicturesFor(project, VIEW, painter, 'light');
    const drawing = writeSvg(project, VIEW, { solids });
    const document = readSvg(drawing.text);
    const layer = document.querySelector('[data-part="solid-parts"]');
    expect(layer).not.toBeNull();
    const paths = [...(layer?.querySelectorAll('path') ?? [])];
    // `base`, `link`, `wrist` and `gripper` stand for parts; `twin` names `base` again and is no part.
    expect(paths.map((path) => path.getAttribute('data-element'))).toEqual([
      'base',
      'link',
      'wrist',
      'gripper',
    ]);
    const arm = armDefinition();
    const scene = buildScene(project, VIEW);
    const drawingShape = scene.shapes.find((shape) => shape.element === 'arm') as ElementShape;
    const picture = solids.get(drawingShape.key);
    const buffer = picture?.partBuffer;
    expect(buffer).toBeDefined();
    for (const path of paths) {
      const name = path.getAttribute('data-solid-part') as string;
      const index = arm.parts.findIndex((part) => part.name === name);
      const shape = scene.shapes.find((each) => each.element === path.getAttribute('data-element'));
      expect(path.getAttribute('data-shape')).toBe(shape?.key);
      expect(path.getAttribute('data-component')).toBe('robotics.link');
      expect(path.getAttribute('data-solid')).toBe(ARM_ID);
      expect(path.getAttribute('fill-opacity')).toBe('0');
      expect(path.getAttribute('fill-rule')).toBe('evenodd');
      const { from, to } = partValues(arm.parts, index);
      expect(path.getAttribute('d')).toBe(tracedPathData(buffer!, from, to));
      // In the picture's place, scaled from its pixels.
      const { rect } = drawingShape.solid!;
      expect(path.getAttribute('transform')).toBe(
        `matrix(${rect.width / buffer!.width} 0 0 ${rect.height / buffer!.height} ${rect.x} ${rect.y})`,
      );
    }
    // The wrist draws nothing of its own, and covers the tip it holds.
    const wrist = paths.find((path) => path.getAttribute('data-element') === 'wrist');
    expect(wrist?.getAttribute('d')).not.toBe('');
  });

  it('draws a solid it could not draw as its placeholder, and says how many', async () => {
    const failing: SolidPainter = { paint: (asks) => Promise.resolve(asks.map(() => undefined)) };
    const exported = await exportView(withSolids(), VIEW, 'svg', { solids: failing });
    const document = readSvg(exported.text as string);
    const count = shapesShowingSolids().length;
    expect(document.querySelectorAll('[data-part="solid-placeholder"]').length).toBe(count);
    expect(exported.lost).toContain(
      `${count} solids could not be drawn, and are drawn as their placeholders.`,
    );
  });

  it('lays an overlay’s fill over its part in the picture, through the part buffer', async () => {
    // A painter of a fake picture source: every pixel white and opaque, every pixel the base's.
    const seen: { parts: boolean; width: number; height: number }[] = [];
    const fake: SolidPainter = {
      paint: (asks) =>
        Promise.resolve(
          asks.map((ask) => {
            const side = 128;
            seen.push({ parts: ask.parts, width: side, height: side });
            return {
              width: side,
              height: side,
              pixels: new Uint8ClampedArray(side * side * 4).fill(255),
              ...(ask.parts
                ? {
                    partBuffer: {
                      width: side,
                      height: side,
                      data: new Uint16Array(side * side).fill(1),
                    },
                  }
                : {}),
            };
          }),
        ),
    };
    const project = withSolids();
    const overlaid = {
      ...project,
      model: {
        ...project.model,
        elements: project.model.elements.map((element) =>
          element.id === 'base' ? { ...element, attributes: { load: 'high' } } : element,
        ),
      },
      views: project.views.map((view) => ({
        ...view,
        overlays: [
          {
            id: 'load',
            of: 'elements' as const,
            attribute: 'load',
            channel: 'fill' as const,
            mapping: { kind: 'discrete' as const, cases: [{ value: 'high', color: '#FF0000' }] },
          },
        ],
      })),
    };
    const { shadeForExport, overlayPartStates } = await import('./solid-pictures');
    const scene = buildScene(overlaid, VIEW);
    const drawingShape = scene.shapes.find((shape) => shape.element === 'arm') as ElementShape;
    const states = overlayPartStates(scene, drawingShape, armDefinition().parts);
    expect(states.parts[0]?.fill).toBe('#FF0000');
    const shaded = shadeForExport(
      { width: 1, height: 1, pixels: new Uint8ClampedArray([255, 255, 255, 255]) },
      { width: 1, height: 1, data: new Uint16Array([1]) },
      states,
      '#FFFFFF',
    );
    expect([...shaded]).toEqual([255, 0, 0, 255]);
    const solids = await solidPicturesFor(overlaid, VIEW, fake, 'light');
    expect(solids.get(drawingShape.key)?.format).toBe('png');
    expect(seen.some((each) => each.parts)).toBe(true);
  });
});

describe('solids in the PDF', () => {
  it('draws their pictures, and leaves the traced paths out', async () => {
    const { painter } = standInPainter();
    const exported = await exportView(withSolids(), VIEW, 'pdf', {
      solids: painter,
      date: new Date('2026-10-31T00:00:00Z'),
    });
    expect(exported.bytes?.byteLength).toBeGreaterThan(0);
    expect(exported.lost.some((each) => each.includes('placeholder'))).toBe(false);
    const { PDF_PICTURES } = await import('./pdf');
    expect(PDF_PICTURES.tracedParts).toBe(false);
  });

  it('draws placeholders without a painter, and says so', async () => {
    const exported = await exportView(withSolids(), VIEW, 'pdf', {
      date: new Date('2026-10-31T00:00:00Z'),
    });
    expect(exported.lost.some((each) => each.startsWith('Solids are drawn as placeholders'))).toBe(
      true,
    );
  });
});
