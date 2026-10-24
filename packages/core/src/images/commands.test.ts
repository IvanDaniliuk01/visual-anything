import fc from 'fast-check';
import type { ImageDefinition } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { SYSTEMS } from '../builtin';
import { checkProject } from '../check';
import { executeCommand, type Command, type CommandOutcome } from '../commands';
import { EMPTY_HISTORY, record, redo, undo, type History } from '../history';
import { applyOperations } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { sequentialIds } from '../test/fixtures';
import { decodeBase64, encodeBase64 } from './base64';
import { BITMAP_CAPS } from './bitmap';
import { IMAGE_CAPS, imageUsers, imagesIn } from './catalog';
import { isClean } from './cleaned';
import { bytesOf, png, pngChunk } from './test/bitmaps';
import { DESK, LOGO, imageProject, svgImage } from './test/project';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const SQUARE = `<svg viewBox="0 0 10 10" ${NS}><path d="M0 0h1v1z"/></svg>`;
const SCRIPTED = `<svg viewBox="0 0 10 10" ${NS}><script>alert(1)</script><path d="M0 0h1v1z" onclick="alert(2)"/></svg>`;

function run(state: ProjectSnapshot, command: Command): Extract<CommandOutcome, { ok: true }> {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome;
}

function refusal(state: ProjectSnapshot, command: Command): string[] {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.code);
}

/** Undoing an outcome gives back the project exactly. */
function expectUndoesExactly(
  before: ProjectSnapshot,
  outcome: Extract<CommandOutcome, { ok: true }>,
): void {
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(before);
}

function imagesOfClinic(state: ProjectSnapshot): readonly ImageDefinition[] | undefined {
  return state.packages.find((file) => file.id === 'clinic')?.images;
}

describe('define-image', () => {
  it('stores SVG text as cleaning gives it, says what it removed, and undoes exactly', () => {
    const before = imageProject();
    const outcome = run(before, {
      type: 'define-image',
      package: 'clinic',
      image: { name: 'Bell', source: 'Drawn by hand', svg: SCRIPTED },
    });
    expect(outcome.label).toBe('Add the image "Bell"');
    expect(outcome.created).toEqual(['clinic.bell-1']);
    expect(imagesOfClinic(outcome.state)?.at(-1)).toEqual({
      kind: 'svg',
      id: 'clinic.bell-1',
      name: 'Bell',
      source: 'Drawn by hand',
      width: 10,
      height: 10,
      svg: SQUARE,
    });
    expect(outcome.warnings).toEqual([
      expect.objectContaining({
        code: 'image-cleaned',
        message: 'Cleaning the image "Bell" removed: 1 script element, 1 event handler attribute.',
      }),
    ]);
    expect(outcome.operations).toEqual([
      expect.objectContaining({
        op: 'insert',
        collection: { name: 'images', package: 'clinic' },
        index: 2,
      }),
    ]);
    expectUndoesExactly(before, outcome);
  });

  it('stores a bitmap without its metadata, with the size its header gives', () => {
    const withExif = bytesOf(
      png().subarray(0, 33),
      pngChunk('eXIf', 'GPSLatitude 48.8584'),
      png().subarray(33),
    );
    const outcome = run(imageProject(), {
      type: 'define-image',
      package: 'clinic',
      image: { id: 'clinic.photo', name: 'Photo', format: 'png', data: encodeBase64(withExif) },
    });
    const stored = imagesOfClinic(outcome.state)?.find((each) => each.id === 'clinic.photo');
    expect(stored).toEqual({
      kind: 'bitmap',
      id: 'clinic.photo',
      name: 'Photo',
      format: 'png',
      width: 4,
      height: 3,
      data: encodeBase64(png()),
    });
    expect(outcome.warnings[0]?.message).toContain('1 eXIf chunk');
  });

  it('gives the first image of a package the images list, and undo takes the list away again', () => {
    const before = imageProject([]);
    expect(imagesOfClinic(before)).toBeUndefined();
    const outcome = run(
      {
        ...before,
        model: { ...before.model, elements: [] },
        packages: before.packages.map((file) => ({
          ...file,
          components: file.components.map((component) => {
            const plain = { ...component };
            delete plain.appearance;
            return plain;
          }),
        })),
      },
      { type: 'define-image', package: 'clinic', image: { name: 'Bell', svg: SQUARE } },
    );
    expect(imagesOfClinic(outcome.state)).toHaveLength(1);
    const undone = applyOperations(outcome.state, outcome.inverse).state;
    expect(undone.packages[0] && 'images' in undone.packages[0]).toBe(false);
  });

  it('replaces an image with the same id, unless asked to create only', () => {
    const before = imageProject();
    const command: Command = {
      type: 'define-image',
      package: 'clinic',
      image: { id: LOGO.id, name: 'Logo', svg: SQUARE },
    };
    const outcome = run(before, command);
    expect(outcome.label).toBe('Replace the image "Logo"');
    expect(outcome.created).toEqual([]);
    expect(imagesIn(outcome.state).image(LOGO.id)?.definition).toMatchObject({
      svg: SQUARE,
      width: 10,
    });
    expectUndoesExactly(before, outcome);
    expect(refusal(before, { ...command, createOnly: true })).toEqual(['id-taken']);
  });

  it('cleans an image read from disk in one undoable action, as "Clean it" does', () => {
    const dirty = svgImage(
      'clinic.dirty',
      `<svg viewBox="0 0 10 10" ${NS}><desc>d</desc><path d="M0 0h1v1z"/></svg>`,
      'Dirty',
    );
    const before = imageProject([LOGO, DESK, dirty]);
    expect(checkProject(before).warnings.map((each) => each.code)).toEqual(['image-not-clean']);
    const outcome = run(before, {
      type: 'define-image',
      package: 'clinic',
      image: { id: dirty.id, name: dirty.name, svg: dirty.svg },
    });
    expect(checkProject(outcome.state).warnings).toEqual([]);
    expectUndoesExactly(before, outcome);
  });

  it('refuses images that cleaning refuses, and images over the caps', () => {
    const state = imageProject();
    const define = (image: Record<string, unknown>): Command =>
      ({ type: 'define-image', package: 'clinic', image }) as unknown as Command;
    expect(
      refusal(state, define({ name: 'Bad', svg: `<svg ${NS}><script>alert(1)</script></svg>` })),
    ).toEqual(['invalid-image']);
    expect(refusal(state, define({ name: 'Doc', svg: '<!DOCTYPE svg><svg/>' }))).toEqual([
      'invalid-image',
    ]);
    expect(
      refusal(
        state,
        define({
          name: 'Huge',
          format: 'png',
          data: encodeBase64(png({ width: 30000, height: 30000, data: { width: 1, height: 1 } })),
        }),
      ),
    ).toEqual(['image-too-large']);
    const heavy = bytesOf(
      png().subarray(0, 33),
      pngChunk('IDAT', new Uint8Array(BITMAP_CAPS.bytes)),
      png().subarray(33),
    );
    expect(
      refusal(state, define({ name: 'Heavy', format: 'png', data: encodeBase64(heavy) })),
    ).toEqual(['image-too-large']);
    expect(
      refusal(
        state,
        define({ name: 'Wrong', format: 'jpeg', data: DESK.kind === 'bitmap' ? DESK.data : '' }),
      ),
    ).toEqual(['invalid-image']);
    expect(refusal(state, define({ name: 'Text', format: 'png', data: 'not base64!' }))).toEqual([
      'invalid-image',
    ]);
  });

  it('refuses malformed images, and ids that are taken or outside the package', () => {
    const state = imageProject();
    const define = (image: Record<string, unknown>, extra: Record<string, unknown> = {}): Command =>
      ({ type: 'define-image', package: 'clinic', image, ...extra }) as unknown as Command;
    expect(refusal(state, define({ name: '', svg: SQUARE }))).toEqual(['empty-name']);
    expect(refusal(state, define({ name: 'x'.repeat(IMAGE_CAPS.name + 1), svg: SQUARE }))).toEqual([
      'invalid-command',
    ]);
    expect(
      refusal(state, define({ name: 'Both', svg: SQUARE, format: 'png', data: 'AAAA' })),
    ).toEqual(['invalid-command']);
    expect(refusal(state, define({ name: 'Neither' }))).toEqual(['invalid-command']);
    expect(refusal(state, define({ name: 'Gif', format: 'gif', data: 'AAAA' }))).toEqual([
      'invalid-command',
    ]);
    expect(refusal(state, define({ id: 'other.bell', name: 'Bell', svg: SQUARE }))).toEqual([
      'id-outside-package',
    ]);
    expect(refusal(state, define({ id: 'clinic.calendar', name: 'Bell', svg: SQUARE }))).toEqual([
      'id-taken',
    ]);
    expect(refusal(state, define({ id: 'bad id', name: 'Bell', svg: SQUARE }))).toEqual([
      'invalid-id',
    ]);
    expect(refusal(state, define({ name: 'Bell', svg: SQUARE }, { package: 'nowhere' }))).toEqual([
      'unknown-package',
    ]);
  });

  it('refuses an image already defined by another package', () => {
    const state = imageProject();
    const other = state.packages[1];
    if (!other) throw new Error('No other package.');
    state.packages[1] = { ...other, images: [{ ...svgImage('clinic.shared', SQUARE) }] };
    expect(
      refusal(state, {
        type: 'define-image',
        package: 'clinic',
        image: { id: 'clinic.shared', name: 'S', svg: SQUARE },
      }),
    ).toEqual(['defined-twice']);
  });

  it('refuses images in a built-in package', () => {
    const state = imageProject();
    const withSystems = {
      ...state,
      project: { ...state.project, packages: [...state.project.packages, 'systems'] },
      packages: [...state.packages, SYSTEMS],
    };
    expect(
      refusal(withSystems, {
        type: 'define-image',
        package: 'systems',
        image: { name: 'Bell', svg: SQUARE },
      }),
    ).toEqual(['built-in-package']);
  });

  it('refuses more than 128 images, or 2 MiB of them, in one package', () => {
    const many = Array.from({ length: IMAGE_CAPS.perPackage }, (_, i) =>
      svgImage(`clinic.i${i}`, SQUARE),
    );
    expect(
      refusal(imageProject(many), {
        type: 'define-image',
        package: 'clinic',
        image: { name: 'One more', svg: SQUARE },
      }),
    ).toEqual(['image-too-large']);
    const big = `<svg viewBox="0 0 10 10" ${NS}><path d="M0 0${' h1'.repeat(8_000)}"/></svg>`;
    const heavy = Array.from({ length: Math.floor(IMAGE_CAPS.packageText / big.length) }, (_, i) =>
      svgImage(`clinic.b${i}`, big),
    );
    expect(
      refusal(imageProject(heavy), {
        type: 'define-image',
        package: 'clinic',
        image: { name: 'One more', svg: big },
      }),
    ).toEqual(['image-too-large']);
  });
});

describe('remove-image', () => {
  it('removes an image no appearance shows, and undoes exactly', () => {
    const before = imageProject([LOGO, DESK, svgImage('clinic.spare', SQUARE, 'Spare')]);
    const outcome = run(before, { type: 'remove-image', id: 'clinic.spare' });
    expect(outcome.label).toBe('Remove the image "Spare"');
    expect(imagesIn(outcome.state).image('clinic.spare')).toBeUndefined();
    expectUndoesExactly(before, outcome);
  });

  it('refuses an image that components or elements show, naming them', () => {
    const outcome = executeCommand(imageProject(), { type: 'remove-image', id: LOGO.id });
    expect(outcome).toEqual({
      ok: false,
      problems: [expect.objectContaining({ code: 'in-use', subjects: ['clinic.calendar'] })],
    });
    expect(refusal(imageProject(), { type: 'remove-image', id: DESK.id })).toEqual(['in-use']);
    expect(refusal(imageProject(), { type: 'remove-image', id: 'clinic.nothing' })).toEqual([
      'unknown-image',
    ]);
  });
});

describe('every command that sets an image', () => {
  it('is refused when no package in use defines the image', () => {
    const state = imageProject();
    expect(
      refusal(state, {
        type: 'update-element',
        id: 'plain',
        changes: { appearance: { image: { image: 'clinic.nothing' } } },
      }),
    ).toEqual(['unknown-image']);
    expect(
      refusal(state, {
        type: 'create-element',
        element: { component: 'other.box', name: 'X', appearance: { image: { image: 'nope' } } },
      }),
    ).toEqual(['unknown-image']);
    expect(
      refusal(state, {
        type: 'define-component',
        package: 'other',
        component: {
          id: 'other.icon',
          name: 'Icon',
          derivesFrom: 'essence',
          appearance: { image: { image: 'nope' } },
        },
      }),
    ).toEqual(['unknown-image']);
    expect(
      refusal(state, {
        type: 'update-element',
        id: 'world',
        changes: { appearance: { image: { image: 'nope' } } },
      }),
    ).toEqual(['unknown-image']);
  });

  it('is refused when the image is not written as a reference', () => {
    const state = imageProject();
    const set = (image: unknown): Command =>
      ({
        type: 'update-element',
        id: 'plain',
        changes: { appearance: { image } },
      }) as unknown as Command;
    // The appearance trait's own check refuses each, as it does any value outside its trait.
    expect(refusal(state, set({ image: LOGO.id, placement: 'background' }))).toEqual([
      'invalid-appearance',
    ]);
    expect(refusal(state, set({ image: LOGO.id, tint: 'red' }))).toEqual(['invalid-appearance']);
    expect(refusal(state, set({ image: LOGO.id, svg: SQUARE }))).toEqual(['invalid-appearance']);
    expect(refusal(state, set('<svg/>'))).toEqual(['invalid-appearance']);
    expect(
      run(state, set({ image: LOGO.id, placement: 'drawing', tint: '#112233' })).operations,
    ).toHaveLength(1);
    expect(run(state, set('none')).operations).toHaveLength(1);
  });

  it('accepts an image defined in the same batch, as giving a component a picture does', () => {
    const state = imageProject();
    const outcome = run(state, {
      type: 'batch',
      label: 'Set the image of "Box"',
      commands: [
        {
          type: 'define-image',
          package: 'clinic',
          image: { id: 'clinic.box-icon-1abcde', name: 'Box icon', svg: SQUARE },
          createOnly: true,
        },
        {
          type: 'define-component',
          package: 'other',
          component: {
            id: 'other.box',
            name: 'Box',
            derivesFrom: 'essence',
            appearance: { image: { image: 'clinic.box-icon-1abcde', placement: 'icon' } },
          },
        },
      ],
    });
    expect(outcome.label).toBe('Set the image of "Box"');
    expect(imageUsers(outcome.state, 'clinic.box-icon-1abcde')).toEqual(['other.box']);
  });

  it('leaves alone an image reference it does not change, even one that names no image', () => {
    const state = imageProject([LOGO]);
    // The desk's own appearance names an image the project lacks; renaming it changes nothing there.
    expect(
      run(state, { type: 'update-element', id: 'desk', changes: { name: 'Reception' } }).operations,
    ).toHaveLength(1);
  });

  it('keeps a package whose images are still shown from being dropped', () => {
    const state = imageProject();
    const other = state.packages[1];
    if (!other) throw new Error('No other package.');
    state.packages[1] = { ...other, images: [svgImage('other.mark', SQUARE)] };
    state.model.elements.push({
      id: 'marked',
      component: 'clinic.calendar',
      name: 'Marked',
      appearance: { image: { image: 'other.mark' } },
    });
    expect(refusal(state, { type: 'update-project', changes: { packages: ['clinic'] } })).toEqual([
      'in-use',
    ]);
  });
});

// --- The property --------------------------------------------------------------------------------

type Intent =
  | { kind: 'define'; picture: number; id: number; createOnly: boolean }
  | { kind: 'remove'; id: number }
  | { kind: 'show'; element: number; id: number; placement: boolean }
  | { kind: 'show-on-component'; component: number; id: number }
  | { kind: 'hide'; element: number }
  | { kind: 'drop-other'; drop: boolean }
  | { kind: 'undo' }
  | { kind: 'redo' };

const PICTURES = [
  { svg: SQUARE },
  { svg: SCRIPTED },
  {
    svg: `<svg viewBox="0 0 10 10" ${NS}><title>x</title><path d="M1 1h2" fill="url(https://evil.example/x)"/></svg>`,
  },
  { svg: `<svg ${NS}><script>alert(1)</script></svg>` },
  { format: 'png' as const, data: encodeBase64(png()) },
  {
    format: 'png' as const,
    data: encodeBase64(
      bytesOf(png().subarray(0, 33), pngChunk('tEXt', 'a\0b'), png().subarray(33)),
    ),
  },
  {
    format: 'png' as const,
    data: encodeBase64(png({ width: 2000, height: 1, data: { width: 1, height: 1 } })),
  },
];
const IDS = [LOGO.id, DESK.id, 'clinic.a', 'clinic.b', 'other.c', undefined];
const ELEMENTS = ['world', 'booking', 'desk', 'plain'];
const COMPONENTS = ['clinic.calendar', 'clinic.agenda', 'clinic.plain', 'other.box'];

const nat = fc.nat({ max: 100 });
const intent: fc.Arbitrary<Intent> = fc.oneof(
  fc.record({ kind: fc.constant('define'), picture: nat, id: nat, createOnly: fc.boolean() }),
  fc.record({ kind: fc.constant('remove'), id: nat }),
  fc.record({ kind: fc.constant('show'), element: nat, id: nat, placement: fc.boolean() }),
  fc.record({ kind: fc.constant('show-on-component'), component: nat, id: nat }),
  fc.record({ kind: fc.constant('hide'), element: nat }),
  fc.record({ kind: fc.constant('drop-other'), drop: fc.boolean() }),
  fc.constant({ kind: 'undo' as const }),
  fc.constant({ kind: 'redo' as const }),
);

function pick<T>(list: readonly T[], at: number): T {
  return list[at % list.length] as T;
}

function commandFor(
  state: ProjectSnapshot,
  wish: Exclude<Intent, { kind: 'undo' | 'redo' }>,
): Command | undefined {
  switch (wish.kind) {
    case 'define': {
      const id = pick(IDS, wish.id);
      const packageId = id?.startsWith('other.') ? 'other' : 'clinic';
      if (!state.project.packages.includes(packageId)) return undefined;
      return {
        type: 'define-image',
        package: packageId,
        image: {
          ...(id === undefined ? {} : { id }),
          name: `Picture ${wish.picture}`,
          ...pick(PICTURES, wish.picture),
        },
        ...(wish.createOnly ? { createOnly: true as const } : {}),
      };
    }
    case 'remove':
      return { type: 'remove-image', id: pick(IDS, wish.id) ?? 'clinic.none' };
    case 'show': {
      const id = pick(IDS, wish.id) ?? 'clinic.none';
      return {
        type: 'update-element',
        id: pick(ELEMENTS, wish.element),
        changes: {
          appearance: {
            image: { image: id, ...(wish.placement ? { placement: 'drawing' as const } : {}) },
          },
        },
      };
    }
    case 'show-on-component': {
      const id = pick(COMPONENTS, wish.component);
      const packageId = id.split('.')[0] ?? '';
      const file = state.packages.find((each) => each.id === packageId);
      const component = file?.components.find((each) => each.id === id);
      if (!component) return undefined;
      return {
        type: 'define-component',
        package: packageId,
        component: {
          ...component,
          appearance: {
            ...component.appearance,
            image: { image: pick(IDS, wish.id) ?? 'clinic.none' },
          },
        },
      };
    }
    case 'hide':
      return {
        type: 'update-element',
        id: pick(ELEMENTS, wish.element),
        changes: { appearance: null },
      };
    case 'drop-other':
      return {
        type: 'update-project',
        changes: { packages: wish.drop ? ['clinic'] : ['clinic', 'other'] },
      };
  }
}

/** The rules images keep after every action. */
function expectImageRulesKept(state: ProjectSnapshot): void {
  const catalog = imagesIn(state);
  const warnings = checkProject(state).warnings.map((each) => each.code);
  // Every image shown is defined, and every image stored is clean.
  expect(
    warnings.filter(
      (code) => code === 'unknown-image' || code === 'image-not-clean' || code === 'invalid-image',
    ),
  ).toEqual([]);
  for (const file of state.packages) {
    // A package without images has no list, never an empty one.
    if (file.images !== undefined) expect(file.images.length).toBeGreaterThan(0);
    expect((file.images ?? []).length).toBeLessThanOrEqual(IMAGE_CAPS.perPackage);
    for (const image of file.images ?? []) {
      expect(isClean(image)).toBe(true);
      expect(image.id.startsWith(`${file.id}.`)).toBe(true);
      if (image.kind === 'bitmap')
        expect(decodeBase64(image.data)?.length ?? Infinity).toBeLessThanOrEqual(BITMAP_CAPS.bytes);
    }
  }
  expect(catalog.problems).toEqual([]);
}

describe('image commands, in any order', () => {
  it('keep every image shown defined and clean, and every action undoes exactly', () => {
    const seen = { applied: 0, kinds: new Set<string>() };
    fc.assert(
      fc.property(fc.array(intent, { minLength: 5, maxLength: 40 }), (wishes) => {
        let state = imageProject();
        let history: History = EMPTY_HISTORY;
        const newId = sequentialIds();
        for (const wish of wishes) {
          if (wish.kind === 'undo' || wish.kind === 'redo') {
            const step = (wish.kind === 'undo' ? undo : redo)(state, history);
            if (step) ({ state, history } = step);
            expectImageRulesKept(state);
            continue;
          }
          const command = commandFor(state, wish);
          if (!command) continue;
          const outcome = executeCommand(state, command, { newId });
          if (!outcome.ok) continue;
          expectImageRulesKept(outcome.state);
          const recorded = record(history, {
            label: outcome.label,
            author: 'user',
            operations: outcome.operations,
            inverse: outcome.inverse,
          });
          expect(undo(outcome.state, recorded)?.state).toStrictEqual(state);
          seen.applied += 1;
          seen.kinds.add(command.type);
          state = outcome.state;
          history = recorded;
        }
      }),
      { numRuns: 120 },
    );
    expect(seen.applied).toBeGreaterThan(300);
    expect([...seen.kinds].sort()).toEqual([
      'define-component',
      'define-image',
      'remove-image',
      'update-element',
      'update-project',
    ]);
  });
});
