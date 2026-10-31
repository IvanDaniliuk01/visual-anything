// @vitest-environment node
/**
 * What a space's frames draw over the solids, facing the screen (ADR 0076): relation lines with
 * arrowheads and travelling markers, names for what matters and the nearest while Names is on, the
 * ground's scale, and the handles.
 */
import type { Id, SpacePoint } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { DIMMED_ALPHA } from '../../../canvas/colors';
import { casingFor } from '../../../canvas/solids/shader';
import { THEMES } from '../../../theme/themes';
import type { SpaceLine } from '../../protocol';
import { SPACE_MARK, type DrawnEntry, type SpaceLayout } from './layout';
import {
  MOST_NEAREST_NAMES,
  overlayOf,
  paintOverlay,
  type OverlayContext,
  type OverlayInput,
  type OverlayMark,
} from './overlay';

const SIZE = { width: 400, height: 400 };
const FRONT = { target: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 4 };

function drawn(
  element: Id,
  point: SpacePoint,
  look: Partial<DrawnEntry['look']> = {},
  name = element,
  own = look.marks ?? 0,
): [Id, DrawnEntry] {
  return [
    element,
    {
      entry: { element, name, matrix: [] },
      look: { answers: element, faint: false, alpha: 1, marks: 0, ...look },
      point,
      marks: own,
    },
  ];
}

function layout(entries: [Id, DrawnEntry][] = []): SpaceLayout {
  return { solids: [], markers: [], drawn: new Map(entries) };
}

function input(more: Partial<OverlayInput> = {}): OverlayInput {
  return {
    layout: layout(),
    camera: FRONT,
    size: SIZE,
    pixelRatio: 1,
    theme: 'light',
    names: false,
    lines: [],
    cut: undefined,
    handles: undefined,
    measure: (text, size) => text.length * size * 0.5,
    ...more,
  };
}

const texts = (marks: OverlayMark[]) =>
  marks.flatMap((mark) => (mark.kind === 'text' && mark.names ? [mark.names] : []));

const LINE: SpaceLine = { relation: 'r1', from: { x: -1, y: 0, z: 0 }, to: { x: 1, y: 0, z: 0 } };

describe('relation lines over the solids', () => {
  it('draws a line between its ends’ points, with an arrowhead at the end it goes to', () => {
    const marks = overlayOf(input({ lines: [LINE] }));
    const [line, head] = marks;
    expect(line).toMatchObject({ kind: 'path', alpha: 1 });
    const points = line?.kind === 'path' ? line.points : [];
    expect(points[0]?.y).toBeCloseTo(200, 9);
    expect(points[0]?.x).toBeLessThan(200);
    expect(points[1]?.x).toBeGreaterThan(200);
    const color = THEMES.light.shell.colors.textMuted;
    expect(line).toMatchObject({ color, casing: casingFor(color) });
    expect(head).toMatchObject({ kind: 'path', filled: true });
    const tip = head?.kind === 'path' ? head.points[0] : undefined;
    expect(tip?.x).toBeCloseTo(points[1]?.x ?? 0, 9);
  });

  it('draws a played step’s line in the highlight, with its markers travelling along it', () => {
    const marks = overlayOf(
      input({ lines: [{ ...LINE, highlighted: true, markers: [0, 0.5] }], theme: 'dark' }),
    );
    const discs = marks.filter((mark) => mark.kind === 'disc');
    expect(discs).toHaveLength(2);
    expect(discs[1]).toMatchObject({ x: 200, y: 200, color: THEMES.dark.canvas.highlight });
    expect(marks[0]).toMatchObject({ color: THEMES.dark.canvas.highlight, width: 3 });
  });

  it('draws a faint line faintly, and a selected one in the selection’s color', () => {
    const [faint] = overlayOf(input({ lines: [{ ...LINE, faint: true }] }));
    expect(faint).toMatchObject({ alpha: DIMMED_ALPHA });
    const [selected] = overlayOf(input({ lines: [{ ...LINE, selected: true }] }));
    expect(selected).toMatchObject({ color: THEMES.light.canvas.selected, alpha: 1 });
  });

  it('cuts a line where it passes behind the camera, and leaves out one wholly behind it', () => {
    const behind = { relation: 'r', from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 10 } };
    const marks = overlayOf(input({ lines: [behind] }));
    const paths = marks.filter(
      (mark) => mark.kind === 'path' && mark.casingWidth === 1 && !mark.filled,
    );
    // The line is drawn, cut short; its end is behind the camera, so it has no arrowhead.
    expect(paths.length).toBeGreaterThanOrEqual(1);
    expect(marks.filter((mark) => mark.kind === 'path' && mark.filled)).toHaveLength(0);
    const gone = { relation: 'r', from: { x: 0, y: 0, z: 5 }, to: { x: 0, y: 0, z: 10 } };
    expect(overlayOf(input({ lines: [gone] })).filter((mark) => mark.kind === 'path')).toHaveLength(
      1,
    );
  });
});

describe('names facing the screen', () => {
  it('writes what is hovered, selected or highlighted, whatever Names says', () => {
    const marks = overlayOf(
      input({
        layout: layout([
          drawn('a', { x: 0, y: 0, z: 0 }, { marks: SPACE_MARK.hovered }),
          drawn('b', { x: 0.01, y: 0, z: 0 }, { marks: SPACE_MARK.selected }),
          drawn('c', { x: 1, y: 0, z: 0 }, { marks: SPACE_MARK.highlighted }),
          drawn('d', { x: -1, y: 0, z: 0 }),
        ]),
      }),
    );
    // Overlapping names of what is marked are written all the same.
    expect(texts(marks)).toEqual(['a', 'b', 'c']);
  });

  it('writes no name for a mark inherited from what holds it', () => {
    const marks = overlayOf(
      input({
        layout: layout([
          drawn('heart', { x: 0, y: 0, z: 0 }, { marks: SPACE_MARK.selected }),
          drawn('chamber', { x: 0.5, y: 0.5, z: 0 }, { marks: SPACE_MARK.selected }, 'chamber', 0),
        ]),
      }),
    );
    expect(texts(marks)).toEqual(['heart']);
  });

  it('writes, while Names is on, at most 64 of the others, nearest first, none overlapping', () => {
    const many: [Id, DrawnEntry][] = [];
    for (let at = 0; at < 100; at++) {
      many.push(
        drawn(
          `e${at}`,
          { x: ((at % 10) - 4.5) * 0.3, y: (Math.floor(at / 10) - 4.5) * 0.3, z: -at * 0.01 },
          {},
          'N',
        ),
      );
    }
    const marks = overlayOf(input({ names: true, layout: layout(many) }));
    const written = texts(marks);
    expect(written.length).toBeLessThanOrEqual(MOST_NEAREST_NAMES);
    expect(written[0]).toBe('e0');
    // Two names close together: only the nearer is written.
    const close = overlayOf(
      input({
        names: true,
        layout: layout([
          drawn('far', { x: 0, y: 0, z: -1 }),
          drawn('near', { x: 0.001, y: 0, z: 0 }),
        ]),
      }),
    );
    expect(texts(close)).toEqual(['near']);
  });

  it('leaves out what is faint, behind the camera, outside the frame, cut away, or drawn as a container', () => {
    const marks = overlayOf(
      input({
        names: true,
        cut: { axis: 'x', at: 1, keep: 'below' },
        layout: layout([
          drawn('faint', { x: 0, y: 0, z: 0 }, { faint: true }),
          drawn('behind', { x: 0, y: 0, z: 9 }),
          drawn('outside', { x: 50, y: 0, z: 0 }),
          drawn('cut', { x: 1.5, y: 0.5, z: 0 }),
          drawn('inside', { x: 0, y: -1, z: 0 }, { answers: 'cell' }),
          drawn('kept', { x: 0, y: 1, z: 0 }),
        ]),
      }),
    );
    expect(texts(marks)).toEqual(['kept']);
  });
});

describe('the scale and the handles', () => {
  it('writes one cell’s length in the bottom left', () => {
    const marks = overlayOf(input({ pixelRatio: 2 }));
    const label = marks.find((mark) => mark.kind === 'text');
    expect(label).toMatchObject({ text: '10 cm', align: 'left', size: 24 });
    expect(label?.kind === 'text' && label.y).toBe(400 - 24);
  });

  it('draws the handles an update asks for, the active one wider', () => {
    const marks = overlayOf(
      input({ handles: { mode: 'move', at: { x: 0, y: 0, z: 0 }, active: 'y' } }),
    );
    const arrows = marks.filter(
      (mark) => mark.kind === 'path' && !mark.filled && mark.points.length === 2,
    );
    expect(arrows.map((mark) => mark.kind === 'path' && mark.width)).toEqual([2, 4, 2]);
  });
});

describe('painting the overlay', () => {
  it('paints each casing before what it cases, and names over their halos', () => {
    const calls: string[] = [];
    const context = new Proxy(
      {},
      {
        get: (_, key: string) =>
          [
            'save',
            'restore',
            'beginPath',
            'moveTo',
            'lineTo',
            'closePath',
            'stroke',
            'fill',
            'arc',
            'fillText',
            'strokeText',
          ].includes(key)
            ? () => calls.push(key)
            : undefined,
        set: (_, key: string, value: unknown) => {
          if (key === 'strokeStyle' || key === 'fillStyle') calls.push(`${key}=${String(value)}`);
          return true;
        },
      },
    ) as OverlayContext;
    paintOverlay(context, overlayOf(input({ lines: [LINE] })));
    const color = THEMES.light.shell.colors.textMuted;
    const casing = casingFor(color);
    const line = calls.indexOf(`strokeStyle=${casing}`);
    expect(line).toBeGreaterThan(-1);
    expect(calls.indexOf(`strokeStyle=${color}`)).toBeGreaterThan(line);
    expect(calls.indexOf('strokeText')).toBeLessThan(calls.indexOf('fillText'));
  });
});
