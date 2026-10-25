import { describe, expect, it } from 'vitest';
import { selectionOf, type Selectable } from '../editor/selection';
import { setCurrentLanguage } from '../i18n';
import { loadSample } from '../test/sample';
import { indexScene, type Hit } from './hit';
import { buildScene, type ElementShape } from './scene';
import {
  WORLD_FRAME,
  aimFrame,
  dragAnchor,
  frameOf,
  nudgeStep,
  readoutText,
  snapDrag,
} from './snapping';

const sample = loadSample();
const indexed = indexScene(buildScene(sample, 'system-overview'));

function shape(key: string): ElementShape {
  const found = indexed.byKey.get(key);
  if (!found) throw new Error(key);
  return found;
}

const hitOn = (key: string): Hit => ({ kind: 'shape', shape: shape(key) });

/** Every element and free shape of the view, as Ctrl+A selects them. */
function everything() {
  return selectionOf([
    ...indexed.scene.shapes.map((each): Selectable => ({ kind: 'element', id: each.element })),
    ...indexed.scene.notes.map((note): Selectable => ({ kind: 'free-shape', id: note.id })),
  ]);
}

describe('dragAnchor', () => {
  it('is the pressed shape when it moves, in the frame of its container', () => {
    const selection = selectionOf([{ kind: 'element', id: 'whatsapp' }]);
    const anchor = dragAnchor(indexed, selection, hitOn('clinic-booking/whatsapp'));
    expect(anchor?.at).toEqual({ x: 280, y: 208 });
    expect(anchor?.home.origin).toEqual({ x: 240, y: 40 });
    expect(anchor?.home.container?.key).toBe('clinic-booking');
  });

  it('is the moving shape that carries the pressed one, as after selecting everything', () => {
    const anchor = dragAnchor(
      indexed,
      everything(),
      hitOn('clinic-booking/scheduling/appointments-api'),
    );
    // Only Clinic booking's position is stored for what it carries: it is what snaps, in World.
    expect(anchor?.at).toEqual({ x: 240, y: 40 });
    expect(anchor?.home).toEqual(WORLD_FRAME);
  });

  it('is a note or an arrow itself, in World', () => {
    const [note] = indexed.scene.notes;
    const anchor = dragAnchor(indexed, everything(), { kind: 'note', note: note! });
    expect(anchor).toEqual({ at: { x: 240, y: 560 }, home: WORLD_FRAME });
    const arrow = {
      id: 'a',
      from: { x: 12, y: 30 },
      to: { x: 100, y: 30 },
      arrowhead: { tip: { x: 100, y: 30 }, left: { x: 90, y: 25 }, right: { x: 90, y: 35 } },
    };
    expect(dragAnchor(indexed, everything(), { kind: 'arrow', arrow })?.at).toEqual({
      x: 12,
      y: 30,
    });
  });
});

describe('aimFrame and snapDrag', () => {
  const home = frameOf(indexed, shape('clinic-booking/whatsapp'));

  it('snaps in the container the drop goes into, in World when it takes shapes out, and at home otherwise', () => {
    const scheduling = shape('clinic-booking/scheduling');
    expect(aimFrame({ kind: 'into', target: scheduling }, home).origin).toEqual({ x: 744, y: 104 });
    expect(aimFrame({ kind: 'out' }, home)).toEqual(WORLD_FRAME);
    expect(aimFrame({ kind: 'stay' }, home)).toBe(home);
    expect(
      aimFrame({ kind: 'pending', leaf: scheduling, fallback: { kind: 'out' } }, home),
    ).toEqual(WORLD_FRAME);
    expect(aimFrame({ kind: 'only-moves' }, home)).toBe(home);
  });

  it('lands the anchor on a multiple of 8 in the frame, and leaves the raw distance alone otherwise', () => {
    const anchor = dragAnchor(
      indexed,
      selectionOf([{ kind: 'element', id: 'whatsapp' }]),
      hitOn('clinic-booking/whatsapp'),
    )!;
    const scheduling = aimFrame({ kind: 'into', target: shape('clinic-booking/scheduling') }, home);
    const delta = snapDrag(anchor, { x: 501.3, y: 37.9 }, scheduling, true);
    expect((anchor.at.x + delta.x - scheduling.origin.x) % 8).toBe(0);
    expect((anchor.at.y + delta.y - scheduling.origin.y) % 8).toBe(0);
    expect(snapDrag(anchor, { x: 501.3, y: 37.9 }, scheduling, false)).toEqual({
      x: 501.3,
      y: 37.9,
    });
    expect(snapDrag(undefined, { x: 3, y: 5 }, scheduling, true)).toEqual({ x: 3, y: 5 });
  });
});

describe('readoutText', () => {
  it('says where the anchor is stored, in its container or in World', () => {
    const anchor = dragAnchor(
      indexed,
      selectionOf([{ kind: 'element', id: 'booking-agent' }]),
      hitOn('clinic-booking/booking-agent'),
    )!;
    expect(readoutText(anchor, { x: 0, y: 0 }, anchor.home)).toBe('264, 168 in Clinic booking');
    expect(readoutText(anchor, { x: -600, y: 0 }, WORLD_FRAME)).toBe('−96, 208');
    setCurrentLanguage('es');
    expect(readoutText(anchor, { x: 0, y: 0 }, anchor.home)).toBe('264, 168 en Clinic booking');
  });
});

describe('nudgeStep', () => {
  const whatsapp = selectionOf([{ kind: 'element', id: 'whatsapp' }]);
  const offGrid = indexScene(
    buildScene(
      {
        ...sample,
        views: sample.views.map((view) => ({
          ...view,
          positions: view.positions.map((position) =>
            position.element === 'whatsapp' ? { ...position, x: 44, y: 164 } : position,
          ),
        })),
      },
      'system-overview',
    ),
  );

  it('moves by 8 without snapping', () => {
    expect(nudgeStep(offGrid, whatsapp, undefined, 'down', false)).toEqual({ x: 0, y: 8 });
    expect(nudgeStep(offGrid, whatsapp, undefined, 'left', false)).toEqual({ x: -8, y: 0 });
  });

  it('takes the anchor to the next grid line in that direction while snapping', () => {
    expect(nudgeStep(offGrid, whatsapp, undefined, 'down', true)).toEqual({ x: 0, y: 4 });
    expect(nudgeStep(offGrid, whatsapp, undefined, 'up', true)).toEqual({ x: 0, y: -4 });
    expect(nudgeStep(offGrid, whatsapp, undefined, 'right', true)).toEqual({ x: 4, y: 0 });
    expect(nudgeStep(indexed, whatsapp, undefined, 'down', true)).toEqual({ x: 0, y: 8 });
  });

  it('goes by the current shape, or the shape that carries it', () => {
    const selection = everything();
    // Selecting everything moves Patient and Clinic booking; the API's container carries it.
    expect(
      nudgeStep(offGrid, selection, 'clinic-booking/scheduling/appointments-api', 'down', true),
    ).toEqual({ x: 0, y: 8 });
    expect(nudgeStep(offGrid, whatsapp, 'clinic-booking/whatsapp', 'down', true)).toEqual({
      x: 0,
      y: 4,
    });
  });
});
