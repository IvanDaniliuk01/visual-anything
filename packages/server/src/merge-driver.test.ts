/**
 * The merge driver (ADR 0072): `visual-anything merge-driver %O %A %B %P %X %Y` merges two edits of a
 * project file by id, writes the result over ours in the stable key order, atomically, and exits 0
 * when nothing conflicts and 1 when conflicts remain, kept as data in a file that still validates.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FILE_EXTENSIONS,
  type FileContentByKind,
  type FileKind,
  type ModelFile,
} from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { parseFile } from '@visual-anything/schema/validate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUILTIN_NESTING,
  MERGE_DRIVER_USAGE,
  runMergeDriver,
  shownPath,
  sidesOf,
} from './merge-driver';
import { EXAMPLES } from './samples-source';

let folder: string;
let out: string[];
let err: string[];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-merge-driver-'));
  out = [];
  err = [];
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

const io = () => ({
  cwd: folder,
  out: (line: string) => out.push(line),
  err: (line: string) => err.push(line),
});

/** The sample's file of each kind, as `examples/my-systems` holds it. */
const SAMPLE: Record<FileKind, string> = {
  project: 'project.vaproject',
  model: 'model.vamodel',
  package: 'packages/clinic.vapackage',
  view: 'views/system-overview.vaview',
  scenario: 'scenarios/patient-books-appointment.vascenario',
  tour: 'tours/how-booking-works.vatour',
  comment: 'comments/reminder-timing.vacomment',
};

async function sample<K extends FileKind>(kind: K): Promise<FileContentByKind[K]> {
  const text = await readFile(join(EXAMPLES, 'my-systems', SAMPLE[kind]), 'utf8');
  const parsed = parseFile(kind, text);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.value;
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

/** Two edits of each kind that touch different things, and one that clashes with the other side. */
const EDITS: {
  [K in FileKind]: {
    ours: (file: FileContentByKind[K]) => void;
    theirs: (file: FileContentByKind[K]) => void;
    clash: (file: FileContentByKind[K], value: string) => void;
  };
} = {
  project: {
    ours: (file) => (file.name = 'Our systems'),
    theirs: (file) => (file.description = 'Theirs describes it.'),
    clash: (file, value) => (file.name = value),
  },
  model: {
    ours: (file) => (file.elements[0]!.description = 'Ours describes the patient.'),
    theirs: (file) =>
      file.elements.push({ id: 'pharmacy', component: 'systems.system', name: 'Pharmacy' }),
    clash: (file, value) => (file.elements[1]!.name = value),
  },
  package: {
    ours: (file) => (file.name = 'Our clinic'),
    theirs: (file) => (file.description = 'Theirs describes it.'),
    clash: (file, value) => (file.name = value),
  },
  view: {
    ours: (file) => (file.name = 'Our overview'),
    theirs: (file) => (file.positions[0]!.x += 40),
    clash: (file, value) => (file.description = value),
  },
  scenario: {
    ours: (file) => (file.name = 'Our scenario'),
    theirs: (file) => (file.description = 'Theirs describes it.'),
    clash: (file, value) => (file.name = value),
  },
  tour: {
    ours: (file) => (file.name = 'Our tour'),
    theirs: (file) => (file.description = 'Theirs describes it.'),
    clash: (file, value) => (file.name = value),
  },
  comment: {
    ours: (file) => (file.comments[0]!.text = 'Ours asks it again.'),
    theirs: (file) =>
      file.comments.push({
        id: 'reminder-timing-answer',
        author: { kind: 'person', name: 'Ben' },
        time: '2026-10-26T09:30:00.000Z',
        text: 'Two days ahead, then.',
      }),
    clash: (file, value) => (file.comments[0]!.text = value),
  },
};

/** Writes the three versions as git writes them, beside each other, and the driver's arguments. */
async function inputs<K extends FileKind>(
  kind: K,
  base: FileContentByKind[K] | undefined,
  ours: FileContentByKind[K],
  theirs: FileContentByKind[K],
): Promise<string[]> {
  await writeFile(join(folder, '.merge_file_O'), base === undefined ? '' : formatFile(kind, base));
  await writeFile(join(folder, '.merge_file_A'), formatFile(kind, ours));
  await writeFile(join(folder, '.merge_file_B'), formatFile(kind, theirs));
  return [
    '.merge_file_O',
    '.merge_file_A',
    '.merge_file_B',
    `project/file${FILE_EXTENSIONS[kind]}`,
  ];
}

async function merged<K extends FileKind>(
  kind: K,
): Promise<{ text: string; file: FileContentByKind[K] }> {
  const text = await readFile(join(folder, '.merge_file_A'), 'utf8');
  const parsed = parseFile(kind, text);
  if (!parsed.ok)
    throw new Error(`The merged file does not validate: ${JSON.stringify(parsed.errors)}`);
  return { text, file: parsed.value };
}

describe('merging each kind of project file', () => {
  const kinds = Object.keys(SAMPLE) as FileKind[];

  it.each(kinds)('joins independent changes to a %s file, and exits 0', async (kind) => {
    const base = await sample(kind);
    const ours = copy(base);
    const theirs = copy(base);
    (EDITS[kind].ours as (file: unknown) => void)(ours);
    (EDITS[kind].theirs as (file: unknown) => void)(theirs);
    const expected = copy(base);
    (EDITS[kind].ours as (file: unknown) => void)(expected);
    (EDITS[kind].theirs as (file: unknown) => void)(expected);

    const code = await runMergeDriver(await inputs(kind, base, ours, theirs), io());

    expect(err).toEqual([]);
    expect(code).toBe(0);
    const result = await merged(kind);
    expect(result.file).toEqual(expected);
    // In the stable key order the writer uses.
    expect(result.text).toBe(formatFile(kind, expected));
  });

  it.each(kinds)(
    'keeps what clashes in a %s file as conflicts in a file that validates, and exits 1',
    async (kind) => {
      const base = await sample(kind);
      const ours = copy(base);
      const theirs = copy(base);
      (EDITS[kind].clash as (file: unknown, value: string) => void)(ours, 'Ours says this');
      (EDITS[kind].clash as (file: unknown, value: string) => void)(theirs, 'Theirs says that');

      const code = await runMergeDriver(
        [...(await inputs(kind, base, ours, theirs)), 'main', 'feature/billing'],
        io(),
      );

      expect(code).toBe(1);
      const result = await merged(kind);
      const conflicts = (result.file as { conflicts?: unknown[] }).conflicts;
      expect(conflicts).toEqual([
        expect.objectContaining({
          id: 'conflict-1',
          why: 'both-changed',
          kept: 'ours',
          other: 'Theirs says that',
          sides: { ours: 'main', theirs: 'feature/billing' },
        }),
      ]);
      expect(JSON.stringify(result.file)).toContain('Ours says this');
      expect(err.join('\n')).toMatch(/1 conflict remains/);
      expect(err.join('\n')).toContain(`project/file${FILE_EXTENSIONS[kind]}`);
    },
  );
});

describe('the merge driver', () => {
  it('merges a file both sides added, with git’s empty ancestor', async () => {
    const base = await sample('model');
    const ours = copy(base);
    const theirs = copy(base);
    EDITS.model.theirs(theirs);
    const code = await runMergeDriver(await inputs('model', undefined, ours, theirs), io());
    expect(code).toBe(0);
    const result = await merged('model');
    expect(result.file.elements.map((each) => each.id)).toContain('pharmacy');
  });

  it('keeps a removal from taking a relation the other side added, as a conflict', async () => {
    const base = await sample('model');
    const ours = copy(base);
    const theirs = copy(base);
    const gone = base.elements[0]!.id;
    ours.elements = ours.elements.filter((each) => each.id !== gone);
    ours.relations = ours.relations.filter((each) => each.from !== gone && each.to !== gone);
    theirs.relations.push({
      id: 'patient-relates-to-world',
      relationType: 'relates-to',
      from: gone,
      to: base.elements[1]!.id,
    });
    const code = await runMergeDriver(await inputs('model', base, ours, theirs), io());
    expect(code).toBe(1);
    const result = await merged('model');
    expect(result.file.elements.map((each) => each.id)).toContain(gone);
    expect(result.file.conflicts).toEqual([
      expect.objectContaining({ item: `element:${gone}`, why: 'needs-removed' }),
    ]);
  });

  it('looks for containment cycles through the relation types of the built-in packages', () => {
    expect(BUILTIN_NESTING.has('systems.is-part-of')).toBe(true);
    expect(BUILTIN_NESTING.has('relates-to')).toBe(false);
  });

  it('keeps two additions that close a cycle by a built-in nesting type as a conflict', async () => {
    const base: ModelFile = {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'a', component: 'systems.system', name: 'A' },
        { id: 'b', component: 'systems.system', name: 'B' },
      ],
      relations: [],
    };
    const ours = copy(base);
    const theirs = copy(base);
    ours.relations.push({ id: 'a-in-b', relationType: 'systems.is-part-of', from: 'a', to: 'b' });
    theirs.relations.push({ id: 'b-in-a', relationType: 'systems.is-part-of', from: 'b', to: 'a' });
    const code = await runMergeDriver(await inputs('model', base, ours, theirs), io());
    expect(code).toBe(1);
    const result = await merged('model');
    expect(result.file.relations.map((each) => each.id)).toEqual(['a-in-b']);
    expect(result.file.conflicts).toEqual([expect.objectContaining({ why: 'cycle' })]);
  });

  it('exits 1 for a file that still holds conflicts from before', async () => {
    const base = await sample('project');
    const ours = copy(base);
    const theirs = copy(base);
    (ours as { conflicts?: unknown }).conflicts = [
      {
        id: 'conflict-1',
        item: 'project',
        path: ['name'],
        why: 'both-changed',
        kept: 'ours',
        other: 'X',
      },
    ];
    (theirs as { conflicts?: unknown }).conflicts = copy(
      (ours as { conflicts?: unknown }).conflicts,
    );
    const code = await runMergeDriver(await inputs('project', base, ours, theirs), io());
    expect(code).toBe(1);
    expect((await merged('project')).file.conflicts).toHaveLength(1);
  });

  it('shows its usage for --help, and refuses arguments it does not understand', async () => {
    expect(await runMergeDriver(['--help'], io())).toBe(0);
    expect(out).toEqual([MERGE_DRIVER_USAGE]);
    expect(await runMergeDriver([], io())).toBe(2);
    expect(await runMergeDriver(['a', 'b', 'c'], io())).toBe(2);
    expect(await runMergeDriver(['a', 'b', 'c', 'd.vamodel', 'e', 'f', 'g'], io())).toBe(2);
    expect(await runMergeDriver(['--instal'], io())).toBe(2);
    expect(await runMergeDriver(['--install', '--everywhere'], io())).toBe(2);
    expect(err.filter((line) => line === MERGE_DRIVER_USAGE)).toHaveLength(5);
  });
});

describe('sidesOf', () => {
  it('keeps the names git gave, and leaves out what it did not give', () => {
    expect(sidesOf('main', 'feature/billing')).toEqual({ ours: 'main', theirs: 'feature/billing' });
    expect(sidesOf('HEAD', undefined)).toEqual({ ours: 'HEAD' });
    expect(sidesOf(undefined, undefined)).toBeUndefined();
    expect(sidesOf('', '')).toBeUndefined();
  });

  it('takes a placeholder an older git left as it was for no name', () => {
    expect(sidesOf('%X', '%Y')).toBeUndefined();
  });

  it('drops control characters, and cuts a name to 200 characters', () => {
    expect(sidesOf('ma\u001b[31min\n', 'x'.repeat(300))).toEqual({
      ours: 'ma[31min',
      theirs: 'x'.repeat(200),
    });
    expect(sidesOf('😀'.repeat(250), undefined)?.ours).toBe('😀'.repeat(200));
  });
});

describe('shownPath', () => {
  it('escapes control and direction characters', () => {
    expect(shownPath('views/a\nb\u001b[2J.vaview')).toBe('views/a\\u{a}b\\u{1b}[2J.vaview');
    expect(shownPath('a\u202eweivav.b')).toBe('a\\u{202e}weivav.b');
    expect(shownPath('views/plain one.vaview')).toBe('views/plain one.vaview');
  });
});

describe('a 10,000-element model file', () => {
  it('merges, and its time is kept', async () => {
    const elements: ModelFile['elements'] = [];
    const relations: ModelFile['relations'] = [];
    for (let i = 0; i < 10_000; i++) {
      elements.push({
        id: `e${i}`,
        component: 'systems.system',
        name: `Element ${i}`,
        attributes: { index: i },
      });
      if (i > 0) {
        relations.push({ id: `r${i}`, relationType: 'relates-to', from: `e${i}`, to: `e${i - 1}` });
      }
    }
    const base: ModelFile = {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements,
      relations,
    };
    const ours = copy(base);
    const theirs = copy(base);
    for (let i = 0; i < 200; i++) {
      ours.elements[i * 7]!.description = `Ours ${i}`;
      theirs.elements[i * 11 + 3]!.name = `Theirs ${i}`;
    }
    for (let i = 0; i < 50; i++)
      theirs.elements.push({ id: `t${i}`, component: 'essence', name: `T${i}` });
    const args = await inputs('model', base, ours, theirs);
    const started = performance.now();
    const code = await runMergeDriver(args, io());
    const took = performance.now() - started;
    console.log(`The merge driver merged a 10,000-element model file in ${Math.round(took)} ms.`);
    expect(code).toBe(0);
    expect((await merged('model')).file.elements).toHaveLength(10_050);
  }, 60_000);
});
