import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, selectionOf } from '../editor/selection';
import { loadSample } from '../test/sample';
import { THEMES } from '../theme/themes';
import { NOTHING_HIDDEN } from './emphasize';
import { rulerLabelPool } from './grid';
import { indexScene } from './hit';
import { buildScene } from './scene';
import { RULER_SIZE, ScreenMarks, selectionBounds, type MarkText } from './screenMarks';

/** Labels that keep their text, as bitmap labels do, without a font to draw it. */
function marks(): { screen: ScreenMarks; made: MarkText[] } {
  const made: MarkText[] = [];
  const screen = new ScreenMarks(() => {
    const label = Object.assign(new Container(), { text: '' });
    made.push(label);
    return label;
  });
  return { screen, made };
}

const VIEWPORT = { width: 1000, height: 600 };

describe('ScreenMarks', () => {
  it('labels each ruler in canvas units, under none of the corner', () => {
    const { screen } = marks();
    screen.setRulers(true);
    screen.follow({ x: 150, y: 40, scale: 1 }, VIEWPORT, 2);
    // At scale 1, every 80 units; 0 is at 150 across and 40 down.
    expect(screen.labelsAlong('across').slice(0, 4)).toEqual(['−80', '0', '80', '160']);
    expect(screen.labelsAlong('down').slice(0, 3)).toEqual(['0', '80', '160']);
    expect(screen.tickCount).toBeGreaterThan(0);
  });

  it('makes its labels once for the canvas’s size, and changes only those that come on screen', () => {
    const { screen, made } = marks();
    screen.setRulers(true);
    screen.follow({ x: 0, y: 0, scale: 1 }, VIEWPORT, 1);
    const pool = made.length;
    expect(pool).toBe(rulerLabelPool(VIEWPORT));
    const before = new Map(made.map((label) => [label, label.text]));
    screen.follow({ x: -30, y: 0, scale: 1 }, VIEWPORT, 1);
    expect(made).toHaveLength(pool);
    const changed = made.filter((label) => label.visible && before.get(label) !== label.text);
    // Panning by less than a step brings at most one new label onto each ruler.
    expect(changed.length).toBeLessThanOrEqual(2);
  });

  it('marks the selection’s extent, numbers its ends, and clears the labels near them', () => {
    const { screen } = marks();
    screen.setRulers(true);
    screen.follow({ x: 0, y: 0, scale: 1 }, VIEWPORT, 1);
    expect(screen.labelsAlong('across')).toContain('400');
    screen.setExtent({ x: 410, y: 100, width: 160, height: 72 });
    // 400 is within 24 px of the extent's start, 560 within 24 px of its end.
    expect(screen.labelsAlong('across')).not.toContain('400');
    expect(screen.labelsAlong('across')).toContain('480');
    expect(screen.labelsAlong('across')).not.toContain('560');
    screen.moveExtent({ x: 200, y: 0 });
    expect(screen.labelsAlong('across')).toContain('400');
    screen.setExtent(undefined);
    expect(screen.labelsAlong('across')).toContain('560');
  });

  it('covers the band along the top and the left, and says how far in it reaches', () => {
    const { screen } = marks();
    screen.follow({ x: 0, y: 0, scale: 1 }, VIEWPORT, 1);
    expect(screen.contains({ x: 5, y: 300 })).toBe(false);
    expect(screen.inset).toEqual({ left: 0, top: 0 });
    screen.setRulers(true);
    expect(screen.contains({ x: 5, y: 300 })).toBe(true);
    expect(screen.contains({ x: 500, y: RULER_SIZE - 1 })).toBe(true);
    expect(screen.contains({ x: 500, y: 300 })).toBe(false);
    expect(screen.contains({ x: -5, y: 300 })).toBe(false);
    expect(screen.inset).toEqual({ left: RULER_SIZE, top: RULER_SIZE });
  });

  it('shows the readout beside the pointer, within the canvas, in the theme’s colors', () => {
    const { screen } = marks();
    screen.follow({ x: 0, y: 0, scale: 1 }, VIEWPORT, 1);
    screen.showReadout('264, 168 in Clinic booking', { x: 990, y: 5 });
    expect(screen.readoutShown).toBe('264, 168 in Clinic booking');
    const readout = screen.container.children.find((child) => child.label === 'readout')!;
    expect(readout.x).toBeLessThanOrEqual(VIEWPORT.width);
    expect(readout.y).toBeGreaterThanOrEqual(0);
    screen.setTheme(THEMES.dark.canvas);
    screen.hideReadout();
    expect(screen.readoutShown).toBeUndefined();
  });
});

describe('selectionBounds', () => {
  const indexed = indexScene(buildScene(loadSample(), 'system-overview'));

  it('holds every shape of the selection, its free shapes and its relations’ lines', () => {
    expect(selectionBounds(indexed, EMPTY_SELECTION, NOTHING_HIDDEN)).toBeUndefined();
    const api = indexed.byKey.get('clinic-booking/scheduling/appointments-api')!.rect;
    expect(
      selectionBounds(
        indexed,
        selectionOf([{ kind: 'element', id: 'appointments-api' }]),
        NOTHING_HIDDEN,
      ),
    ).toEqual(api);
    const both = selectionBounds(
      indexed,
      selectionOf([
        { kind: 'element', id: 'patient' },
        { kind: 'free-shape', id: 'calendar-note' },
      ]),
      NOTHING_HIDDEN,
    );
    expect(both).toEqual({ x: 40, y: 200, width: 664, height: 432 });
  });

  it('leaves out what the emphasis hides', () => {
    const hidden = { ...NOTHING_HIDDEN, shapes: new Set(['patient']) };
    expect(
      selectionBounds(indexed, selectionOf([{ kind: 'element', id: 'patient' }]), hidden),
    ).toBeUndefined();
  });
});
