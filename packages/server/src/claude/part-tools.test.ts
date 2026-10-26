/**
 * Claude's tools for named parts (ADR 0067): list_image_parts gives each part's id, bounds and main
 * color and the elements drawn as it, in which views; anchor_parts anchors a drawing's contents to its
 * picture's parts as the app's dialog does, in one action of Claude's.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Element, PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import type { Author } from '@visual-anything/core';
import type { Program } from './bridge';
import { TOOLS, runTool } from './tools';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const HEART = 'anatomy.heart';
const SVG = `<svg viewBox="0 0 300 100" ${NS}><path id="left_ventricle" d="M10 10h80v80h-80z" fill="#C0392B"/><path id="UBERON_0002078" d="M110 10h80v80h-80z" fill="#2980B9"/><path id="aorta" d="M210 10h80v80h-80z" fill="#27AE60"/></svg>`;

function anatomy(): PackageFile {
  return {
    id: 'anatomy',
    name: 'Anatomy',
    components: [
      {
        id: 'anatomy.organ',
        name: 'Organ',
        derivesFrom: 'essence',
        appearance: { image: { image: HEART, placement: 'parts' } },
      },
      { id: 'anatomy.chamber', name: 'Chamber', derivesFrom: 'essence' },
    ],
    relationTypes: [
      { id: 'anatomy.is-part-of', name: 'is part of', derivesFrom: 'relates-to', nests: true },
    ],
    images: [{ kind: 'svg', id: HEART, name: 'Heart', width: 300, height: 100, svg: SVG }],
    crosswalks: [{ from: 'uberon', to: 'fma', entries: { 'UBERON:0002078': 'FMA:7097' } }],
  };
}

function heart(contents: Element[]): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Anatomy', packages: ['anatomy'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [{ id: 'heart', component: 'anatomy.organ', name: 'Heart' }, ...contents],
      relations: contents.map((each) => ({
        id: `${each.id}-in-heart`,
        relationType: 'anatomy.is-part-of',
        from: each.id,
        to: 'heart',
      })),
    },
    packages: [anatomy()],
    views: [
      {
        id: 'circulation',
        name: 'Circulation',
        perspective: { name: 'Parts' },
        nestingRelationTypes: ['anatomy.is-part-of'],
        positions: [{ element: 'heart', x: 0, y: 0 }],
        freeShapes: [],
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

/** A program over a project held here, running each command through the core as Claude's. */
function programOver(start: ProjectSnapshot): Program & {
  state(): ProjectSnapshot;
  sent: { command: Command; author: Author }[];
} {
  let state = start;
  const sent: { command: Command; author: Author }[] = [];
  return {
    state: () => state,
    sent,
    project: () => Promise.resolve(state),
    execute: (command: Command) => {
      sent.push({ command, author: 'claude' });
      const outcome = executeCommand(state, command, { author: 'claude' });
      if (!outcome.ok) return Promise.resolve({ ok: false, problems: outcome.problems });
      state = outcome.state;
      return Promise.resolve({
        ok: true,
        label: outcome.label,
        changed: outcome.operations.length > 0,
        created: outcome.created,
        warnings: outcome.warnings,
      });
    },
    guide: () => Promise.resolve(0),
    openApp: () => Promise.resolve(),
  };
}

async function call(program: Program, name: string, args: unknown) {
  const found = TOOLS.find((each) => each.name === name);
  if (!found) throw new Error(`No tool ${name}`);
  return runTool(found, args, program);
}

async function value(program: Program, name: string, args: unknown) {
  const outcome = await call(program, name, args);
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome.value as Record<string, unknown>;
}

async function failure(program: Program, name: string, args: unknown) {
  const outcome = await call(program, name, args);
  if (outcome.ok) throw new Error(JSON.stringify(outcome.value));
  return outcome.message;
}

const chamber = (id: string, name: string, more: Partial<Element> = {}): Element => ({
  id,
  component: 'anatomy.chamber',
  name,
  ...more,
});

describe('list_image_parts', () => {
  it('lists each part’s id, bounds and main color, and the elements drawn as it, in which views', async () => {
    const program = programOver(
      heart([
        chamber('lv', 'Left ventricle', { appearance: { part: { part: 'left_ventricle' } } }),
        chamber('loose', 'Loose', { appearance: { part: { part: 'aorta', image: HEART } } }),
      ]),
    );
    const listed = await value(program, 'list_image_parts', { image: HEART });
    expect(listed).toMatchObject({
      image: { id: HEART, name: 'Heart', width: 300, height: 100 },
      total: 3,
    });
    const parts = listed.parts as {
      id: string;
      bounds: unknown;
      color: string;
      drawnAs: unknown;
    }[];
    expect(parts.map((each) => each.id)).toEqual(['left_ventricle', 'UBERON_0002078', 'aorta']);
    expect(parts[0]).toEqual({
      id: 'left_ventricle',
      bounds: { x: 10, y: 10, width: 80, height: 80 },
      color: '#C0392B',
      drawnAs: [
        {
          element: 'lv',
          name: 'Left ventricle',
          views: [{ view: 'circulation', drawing: 'heart' }],
        },
      ],
    });
    // Named with its image and inside the drawing, it is anchored there.
    expect(parts[2]?.drawnAs).toEqual([
      { element: 'loose', name: 'Loose', views: [{ view: 'circulation', drawing: 'heart' }] },
    ]);
    expect(await value(program, 'list_image_parts', { drawing: 'heart' })).toMatchObject({
      total: 3,
    });
  });

  it('says why it lists nothing', async () => {
    const program = programOver(heart([chamber('lv', 'Left ventricle')]));
    expect(await failure(program, 'list_image_parts', {})).toBe(
      'Give image, an image’s id, or drawing, an element’s.',
    );
    expect(await failure(program, 'list_image_parts', { image: 'anatomy.none' })).toBe(
      'No package in use defines the image "anatomy.none". list_images lists them.',
    );
    expect(await failure(program, 'list_image_parts', { drawing: 'lv' })).toContain(
      'does not show its image with its parts',
    );
  });

  it('only reads', () => {
    const found = TOOLS.find((each) => each.name === 'list_image_parts');
    expect(found?.hints.readOnlyHint).toBe(true);
    expect(found?.description).toContain('Example:');
  });
});

describe('anchor_parts', () => {
  it('anchors by name in one action of Claude’s, and says what it matched and left', async () => {
    const program = programOver(
      heart([chamber('lv', 'Left Ventricle'), chamber('other', 'Something else')]),
    );
    const answer = await value(program, 'anchor_parts', { drawing: 'heart', by: 'name' });
    expect(answer).toMatchObject({
      done: 'Anchor 1 part of "Heart"',
      matched: [{ part: 'left_ventricle', element: 'lv', name: 'Left Ventricle' }],
      unmatched: ['UBERON_0002078', 'aorta'],
    });
    expect(program.sent).toHaveLength(1);
    expect(program.sent[0]?.command).toMatchObject({ type: 'batch' });
    const lv = program.state().model.elements.find((each) => each.id === 'lv');
    expect(lv?.appearance?.part).toEqual({ part: 'left_ventricle' });
  });

  it('anchors by an external identifier through a crosswalk, and creates what matches nothing', async () => {
    const program = programOver(heart([chamber('ra', 'Atrium', { ids: { fma: 'FMA:7097' } })]));
    const answer = await value(program, 'anchor_parts', {
      drawing: 'heart',
      by: 'external',
      scheme: 'uberon',
      create: 'anatomy.chamber',
      view: 'circulation',
    });
    expect(answer).toMatchObject({
      done: 'Anchor 3 parts of "Heart"',
      matched: [{ part: 'UBERON_0002078', element: 'ra' }],
      created: [
        { part: 'left_ventricle', name: 'Left ventricle' },
        { part: 'aorta', name: 'Aorta' },
      ],
      unmatched: [],
    });
    expect(program.state().model.elements.map((each) => each.name)).toEqual(
      expect.arrayContaining(['Left ventricle', 'Aorta']),
    );
  });

  it('records nothing when nothing matches, and refuses what cannot be planned', async () => {
    const program = programOver(heart([chamber('x', 'Nothing alike')]));
    expect(await value(program, 'anchor_parts', { drawing: 'heart', by: 'id' })).toMatchObject({
      done: 'Nothing matched, so nothing was anchored and nothing was recorded.',
    });
    expect(program.sent).toHaveLength(0);
    expect(await failure(program, 'anchor_parts', { drawing: 'x', by: 'name' })).toBe(
      'Refused, so nothing changed: The element "Nothing alike" is no drawing with parts: it does not show an SVG image with its parts. (invalid-command)',
    );
    expect(await failure(program, 'anchor_parts', { drawing: 'heart', by: 'external' })).toContain(
      'needs scheme',
    );
  });

  it('describes anchoring an atlas’s parts', () => {
    const found = TOOLS.find((each) => each.name === 'anchor_parts');
    expect(found?.hints.readOnlyHint).toBe(false);
    expect(found?.description).toContain('"by": "external", "scheme": "uberon"');
  });
});
