import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ShapePosition } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { selectionOf, type Selectable, type Selection } from '../editor/selection';
import { ui } from '../i18n/es';
import { untranslatedParts } from '../i18n/translate';
import { loadSample } from '../test/sample';
import { ALIGN_HOWS, type AlignHow } from './align';
import {
  ALIGN_BY_KEY,
  ALIGN_DESCRIPTIONS,
  ALIGN_NAMES,
  alignActions,
  alignCommand,
  alignLabel,
} from './alignActions';
import { SHAPE_KEYS } from './shapeKeys';
import { indexScene, type IndexedScene } from './hit';
import { buildScene, type Scene } from './scene';

const sample = loadSample();
const VIEW = 'system-overview';

function indexedOf(project: ProjectSnapshot): IndexedScene {
  return indexScene(buildScene(project, VIEW));
}

const elements = (...ids: Id[]): Selection =>
  selectionOf(ids.map((id): Selectable => ({ kind: 'element', id })));

function after(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(state, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

function commandOf(
  project: ProjectSnapshot,
  selection: Selection,
  how: AlignHow,
): Command & { type: 'batch' } {
  const result = alignCommand(indexedOf(project), project, VIEW, selection, how);
  if (!('command' in result)) throw new Error(result.reason);
  return result.command;
}

function rectOf(scene: Scene, key: string) {
  const shape = scene.shapes.find((each) => each.key === key);
  if (!shape) throw new Error(key);
  return shape.rect;
}

function positionsOf(command: Command): ShapePosition[] {
  if (command.type === 'set-positions') return command.positions;
  if (command.type === 'batch') return command.commands.flatMap(positionsOf);
  return [];
}

/** The sample with a note beside Patient. */
const withNote: ProjectSnapshot = {
  ...sample,
  views: sample.views.map((view) =>
    view.id === VIEW
      ? {
          ...view,
          freeShapes: [
            ...view.freeShapes,
            { kind: 'note', id: 'remark', x: 13, y: 600, width: 224, height: 88, text: 'Remark' },
          ],
        }
      : view,
  ),
};

describe('aligning the selection', () => {
  it('stores the shapes that move, pinned, as one action named for how many align', () => {
    const command = commandOf(sample, elements('patient', 'clinic-booking'), 'left');
    expect(command.label).toBe('Align 2 shapes to the left');
    // Patient is leftmost already: only Clinic booking is written.
    expect(positionsOf(command)).toEqual([
      expect.objectContaining({ element: 'clinic-booking', x: 40, pinned: true }),
    ]);
  });

  it('aligns shapes in different containers on the canvas, each stored in its own', () => {
    const selection = elements('whatsapp', 'appointments-api', 'reminder-service');
    for (const how of ['left', 'centers', 'right'] as const) {
      const now = buildScene(after(sample, commandOf(sample, selection, how)), VIEW);
      const rects = [
        rectOf(now, 'clinic-booking/whatsapp'),
        rectOf(now, 'clinic-booking/scheduling/appointments-api'),
        rectOf(now, 'clinic-booking/scheduling/reminder-service'),
      ];
      const lines = rects.map((rect) =>
        how === 'left' ? rect.x : how === 'right' ? rect.x + rect.width : rect.x + rect.width / 2,
      );
      expect(Math.max(...lines) - Math.min(...lines)).toBeLessThanOrEqual(0.5);
    }
    const command = commandOf(sample, selection, 'left');
    const api = positionsOf(command).find((each) => each.element === 'appointments-api');
    expect(api).toMatchObject({ container: 'scheduling', pinned: true });
  });

  it('distributes three shapes or more with equal gaps', () => {
    const selection = elements('patient', 'whatsapp', 'booking-agent');
    const command = commandOf(sample, selection, 'distribute-horizontally');
    expect(command.label).toBe('Distribute 3 shapes horizontally');
    const now = buildScene(after(sample, command), VIEW);
    const [a, b, c] = ['patient', 'clinic-booking/whatsapp', 'clinic-booking/booking-agent'].map(
      (key) => rectOf(now, key),
    );
    const first = b!.x - (a!.x + a!.width);
    const second = c!.x - (b!.x + b!.width);
    expect(Math.abs(first - second)).toBeLessThanOrEqual(1);
  });

  it('gives shapes the widest one’s width, and the tallest one’s height', () => {
    const selection = elements('patient', 'scheduling');
    const wide = buildScene(after(sample, commandOf(sample, selection, 'same-width')), VIEW);
    expect(rectOf(wide, 'patient').width).toBe(rectOf(wide, 'clinic-booking/scheduling').width);
    const tall = buildScene(after(sample, commandOf(sample, selection, 'same-height')), VIEW);
    expect(rectOf(tall, 'patient').height).toBe(rectOf(tall, 'clinic-booking/scheduling').height);
  });

  it('aligns notes with the shapes', () => {
    const selection = selectionOf([
      { kind: 'element', id: 'patient' },
      { kind: 'free-shape', id: 'remark' },
    ]);
    // The note is leftmost: Patient moves to it.
    const left = commandOf(withNote, selection, 'left');
    expect(left.label).toBe('Align 2 shapes to the left');
    const moved = after(withNote, left);
    const patient = moved.views
      .find((view) => view.id === VIEW)!
      .positions.find((each) => each.element === 'patient');
    expect(patient).toMatchObject({ x: 13, y: 200, pinned: true });
    // Patient is higher: the note moves to it.
    expect(commandOf(withNote, selection, 'top').commands).toEqual([
      {
        type: 'update-free-shape',
        view: VIEW,
        shape: {
          kind: 'note',
          id: 'remark',
          x: 13,
          y: 200,
          width: 224,
          height: 88,
          text: 'Remark',
        },
      },
    ]);
  });

  it('takes an anchored part for its drawing, as dragging it does', () => {
    const beyond = loadSample('beyond-boxes');
    const index = indexScene(buildScene(beyond, 'heart'));
    const part = index.scene.shapes.find((each) => each.part?.inDrawing === true)!;
    const result = alignCommand(index, beyond, 'heart', elements(part.element, 'body'), 'top');
    if (!('command' in result)) throw new Error(result.reason);
    expect(result.label).toBe('Align 2 shapes to the top');
    for (const position of positionsOf(result.command)) {
      expect(['heart', 'body']).toContain(position.element);
    }
  });

  it('says why when there is too little to align, or nothing would move', () => {
    const indexed = indexedOf(sample);
    expect(alignCommand(indexed, sample, VIEW, elements('patient'), 'left')).toEqual({
      reason: 'Select two or more shapes to align them.',
    });
    expect(
      alignCommand(indexed, sample, VIEW, elements('patient', 'whatsapp'), 'distribute-vertically'),
    ).toEqual({ reason: 'Select three or more shapes to distribute them.' });
    const once = after(sample, commandOf(sample, elements('patient', 'clinic-booking'), 'top'));
    expect(
      alignCommand(indexedOf(once), once, VIEW, elements('patient', 'clinic-booking'), 'top'),
    ).toEqual({ reason: 'They are aligned already.' });
  });

  it('offers each way in the menus, off with a reason while it would do nothing', () => {
    const indexed = indexedOf(sample);
    const two = alignActions(indexed, sample, VIEW, elements('patient', 'clinic-booking'), true);
    expect(Object.keys(two)).toEqual([...ALIGN_HOWS]);
    expect(two.left.enabled).toBe(true);
    expect(two['distribute-horizontally']).toMatchObject({
      enabled: false,
      description: 'Select three or more shapes to distribute them.',
    });
    const locked = alignActions(
      indexed,
      sample,
      VIEW,
      elements('patient', 'clinic-booking'),
      false,
    );
    expect(locked.left).toMatchObject({
      enabled: false,
      description: 'The project cannot be changed now.',
    });
  });

  it('aligns to the side an arrow key names with Alt+Shift', () => {
    expect(ALIGN_BY_KEY).toEqual({ left: 'left', right: 'right', up: 'top', down: 'bottom' });
  });

  it('is named in Spanish through its templates', () => {
    for (const how of ALIGN_HOWS) {
      expect(untranslatedParts('es', alignLabel(how, 3))).toEqual([]);
    }
  });

  it('reads in Spanish in the menus and the keyboard help', () => {
    const texts = [
      ...Object.values(ALIGN_NAMES),
      ...Object.values(ALIGN_DESCRIPTIONS),
      ...SHAPE_KEYS.flatMap(({ keys, does }) => [keys, does]),
    ];
    expect(texts.filter((text) => ui[text] === undefined)).toEqual([]);
  });
});
