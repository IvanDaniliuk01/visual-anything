/**
 * `Appearance.face` (ADR 0083): set by the appearance commands, each one undoable action recorded with
 * its author, checked by compiling it, inherited part by part, and warned about when opening.
 */
import type { Face } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { executeCommand, type Command } from '../commands';
import { EMPTY_HISTORY, record, summarize, undo } from '../history';
import { applyOperations } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn } from '../state';
import { colorProject, sequentialIds } from '../test/fixtures';
import { faceInputOf } from './input';
import { compileFace } from './compile';
import { layOutFace, faceDrawingText } from './layout';

function run(command: Command, state: ProjectSnapshot = colorProject()) {
  return executeCommand(state, command, { newId: sequentialIds() });
}

function ok(command: Command, state: ProjectSnapshot = colorProject()) {
  const outcome = run(command, state);
  if (!outcome.ok)
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

function refusal(command: Command, state?: ProjectSnapshot) {
  const outcome = run(command, state);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems[0]!;
}

const CALENDAR_FACE: Face = {
  size: 'content',
  markup: ['<b>{{name}}</b>', '<p if="timezone">{{timezone}}</p>'],
  style: ['b { font-size: 14px; }'],
};

const setCalendar = (face: Face | 'none'): Command => ({
  type: 'set-component-appearance',
  component: 'clinic.calendar',
  appearanceTraits: { face },
});

describe('the face trait', () => {
  it('is set on a component of the project as one undoable action, recorded with its author', () => {
    const before = colorProject();
    const outcome = ok(setCalendar(CALENDAR_FACE), before);
    expect(outcome.label).toBe('Change the appearance of the component "Calendar"');
    const calendar = outcome.state.packages[1]!.components[0]!;
    expect(calendar.appearance?.face).toEqual(CALENDAR_FACE);
    expect(definitionsIn(outcome.state).component('clinic.calendar')?.appearance.face).toEqual({
      size: 'content',
      markup: CALENDAR_FACE.markup,
      style: CALENDAR_FACE.style,
      variants: [],
    });
    const history = record(EMPTY_HISTORY, {
      label: outcome.label,
      author: 'claude',
      operations: outcome.operations,
      inverse: outcome.inverse,
    });
    expect(summarize(history).undo).toEqual({ label: outcome.label, author: 'claude' });
    expect(undo(outcome.state, history)?.state).toStrictEqual(before);
  });

  it('gives a built-in component a face through the project appearance, and the file keeps it', () => {
    const outcome = ok({
      type: 'set-component-appearance',
      component: 'systems.service',
      appearanceTraits: { face: { markup: ['<b>{{name}}</b>'] } },
    });
    expect(outcome.state.project.appearances).toEqual({
      components: { 'systems.service': { face: { markup: ['<b>{{name}}</b>'] } } },
    });
    expect(validateFile('project', outcome.state.project).ok).toBe(true);
    expect(formatFile('project', outcome.state.project)).toContain(
      '"face": {\n          "markup": [',
    );
  });

  it('changes a face part by part: null takes a part away, "none" the whole face', () => {
    const first = ok(setCalendar(CALENDAR_FACE)).state;
    const restyled = ok(
      {
        type: 'set-component-appearance',
        component: 'clinic.calendar',
        appearanceTraits: { face: { style: ['b { font-size: 20px; }'], size: null } },
      },
      first,
    ).state;
    expect(restyled.packages[1]!.components[0]!.appearance?.face).toEqual({
      markup: CALENDAR_FACE.markup,
      style: ['b { font-size: 20px; }'],
    });
    const none = ok(setCalendar('none'), restyled).state;
    expect(none.packages[1]!.components[0]!.appearance?.face).toBe('none');
    expect(definitionsIn(none).component('clinic.calendar')?.appearance.face).toBeUndefined();
  });

  it('refuses markup outside the subset at its line and column, and changes nothing', () => {
    const problem = refusal(
      setCalendar({ markup: ['<b>{{name}}</b>', '  <img src="x" onerror="y"/>'] }),
    );
    expect(problem.code).toBe('invalid-face');
    expect(problem.message).toBe(
      'The face of the component "Calendar": Line 2, column 3 of the markup: <img> is not part of a face: nothing in a face runs or is fetched.',
    );
    expect(refusal(setCalendar({ markup: Array.from({ length: 201 }, () => '<b/>') })).code).toBe(
      'face-too-large',
    );
    expect(refusal(setCalendar({ markup: ['<b/>'], size: 'big' as 'shape' })).code).toBe(
      'invalid-face',
    );
    expect(refusal(setCalendar({ markup: ['<b/>'], colour: 'x' } as Face)).code).toBe(
      'invalid-face',
    );
    expect(refusal(setCalendar({ markup: ['a\nb'] })).code).toBe('invalid-face');
    expect(refusal(setCalendar({ variants: [{ id: 'Far', markup: ['<b/>'] }] })).code).toBe(
      'invalid-face',
    );
    expect(
      refusal(setCalendar({ variants: [{ id: 'far', markup: ['<b/>'] }], collapsed: 'near' })).code,
    ).toBe('invalid-face');
  });

  it('is inherited part by part: a derived component restyles and keeps the markup', () => {
    const state = colorProject();
    const withParent = ok(
      {
        type: 'set-component-appearance',
        component: 'systems.database',
        appearanceTraits: {
          face: { markup: ['<b>{{name}}</b>'], style: ['b { color: #111111; }'] },
        },
      },
      state,
    ).state;
    const derived = ok(setCalendar({ style: ['b { color: #222222; }'] }), withParent).state;
    const definitions = definitionsIn(derived);
    expect(definitions.component('clinic.calendar')?.appearance.face).toMatchObject({
      markup: ['<b>{{name}}</b>'],
      style: ['b { color: #222222; }'],
    });
    expect(definitions.component('clinic.calendar')?.origins['face.markup']).toMatchObject({
      id: 'systems.database',
    });
    expect(definitions.component('clinic.calendar')?.origins['face.style']).toMatchObject({
      id: 'clinic.calendar',
    });
    // An element's own face is a particularity.
    const own = ok(
      {
        type: 'update-element',
        id: 'calendar',
        changes: { appearance: { face: { markup: ['<i>{{name}}</i>'] } } },
      },
      derived,
    ).state;
    expect(own.model.elements.find((each) => each.id === 'calendar')?.appearance?.face).toEqual({
      markup: ['<i>{{name}}</i>'],
    });
  });

  it('fills a face from an element of the model', () => {
    const state = ok(setCalendar(CALENDAR_FACE)).state;
    const definitions = definitionsIn(state);
    const element = {
      ...state.model.elements.find((each) => each.id === 'calendar')!,
      attributes: { timezone: 'America/Argentina/Buenos_Aires' },
    };
    const input = faceInputOf(element, definitions);
    expect(input).toMatchObject({ name: 'Calendar', component: 'Calendar' });
    expect(input.attributes.map((each) => each.name)).toContain('timezone');
    const face = definitions.component('clinic.calendar')!.appearance.face!;
    const drawing = layOutFace(compileFace(face), input, { width: 300 });
    expect(faceDrawingText(drawing)).toBe('Calendar\nAmerica/Argentina/Buenos_Aires');
  });

  it('warns when opening about a face past its caps, unknown attributes and poor contrast', () => {
    const state = colorProject();
    const calendar = state.packages[1]!.components[0]!;
    const broken: ProjectSnapshot = {
      ...state,
      packages: [
        state.packages[0]!,
        {
          ...state.packages[1]!,
          components: [
            {
              ...calendar,
              appearance: {
                face: {
                  markup: ['<p>{{nope}}</p>', '<p class="pale">{{timezone}}</p>'],
                  style: ['.pale { color: #EEEEEE; }', 'p { transform: none; }'],
                },
              },
            },
            state.packages[1]!.components[1]!,
          ],
        },
      ],
    };
    const { errors, warnings } = checkProject(broken);
    expect(errors).toEqual([]);
    const faces = warnings.filter((each) => each.code.includes('face'));
    expect(faces.map((each) => each.code)).toEqual([
      'invalid-face',
      'unknown-face-attribute',
      'face-contrast',
    ]);
    expect(faces[1]!.message).toBe(
      'The face of the component "Calendar": Line 1, column 4 of the markup: it names the attribute "nope", which the component does not have.',
    );
    expect(faces[2]!.message).toContain('Line 2, column 17 of the markup');
    expect(faces[2]!.subjects).toEqual(['clinic.calendar']);
    const refused: ProjectSnapshot = {
      ...broken,
      packages: [
        state.packages[0]!,
        {
          ...state.packages[1]!,
          components: [{ ...calendar, appearance: { face: { markup: ['<script/>'] } } }],
        },
      ],
    };
    expect(
      checkProject(refused).warnings.find((each) => each.code === 'invalid-face')?.message,
    ).toContain('<script>');
  });
});
