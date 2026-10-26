/**
 * Elements drawn as named parts across a project (ADR 0067): `unknown-part` on opening and in the
 * answer of the action that brings it, `unknown-image` and `in-use` for the image a part names,
 * `too-many-parts` as a picture is defined, and the anchored parts a replacement would lose.
 */
import type { Element, PackageFile, Relation } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { executeCommand, type Command } from '../commands';
import { applyOperations } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { sequentialIds } from '../test/fixtures';
import { anchoredElements, partsLostByReplacing, unknownPartWarnings } from './anchored';
import { cleanedImage } from './cleaned';
import { HEART_SVG } from './test/heart';
import { NS } from './test/svg-corpus';
import { svgImage } from './test/project';

const HEART = svgImage('clinic.heart', HEART_SVG, 'Heart');
const ATLAS = svgImage(
  'clinic.atlas',
  `<svg viewBox="0 0 20 10" ${NS}><path id="lung" d="M0 0h10v10h-10z"/><path id="liver" d="M10 0h10v10h-10z"/></svg>`,
  'Atlas',
);
/** The heart without its left ventricle. */
const NO_VENTRICLE = HEART_SVG.replace(/<[^<>]*id="left-ventricle"[^<>]*>/, '');

const PART_OF: Relation['relationType'] = 'clinic.part-of';

function clinic(): PackageFile {
  return {
    id: 'clinic',
    name: 'Clinic',
    components: [
      {
        id: 'clinic.organ',
        name: 'Organ',
        derivesFrom: 'essence',
        appearance: { image: { image: HEART.id, placement: 'parts' } },
      },
      { id: 'clinic.chamber', name: 'Chamber', derivesFrom: 'essence' },
      {
        id: 'clinic.vessel',
        name: 'Vessel',
        derivesFrom: 'essence',
        appearance: { part: { part: 'vena-cava', image: HEART.id } },
      },
    ],
    relationTypes: [{ id: PART_OF, name: 'is part of', derivesFrom: 'relates-to', nests: true }],
    images: [HEART, ATLAS],
  };
}

const chamber = (id: string, name: string, part: string): Element => ({
  id,
  component: 'clinic.chamber',
  name,
  appearance: { part: { part } },
});

/** A heart drawn with its parts, holding two chambers anchored to the parts of its picture. */
function heartProject(elements: Element[] = []): ProjectSnapshot {
  const all: Element[] = [
    { id: 'heart', component: 'clinic.organ', name: 'Heart' },
    chamber('lv', 'Left ventricle', 'left-ventricle'),
    chamber('rv', 'Right ventricle', 'right-ventricle'),
    ...elements,
  ];
  return {
    project: { schemaVersion: 1, name: 'Anatomy', packages: ['clinic'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: all,
      relations: all
        .filter((each) => each.component === 'clinic.chamber')
        .map((each) => ({
          id: `${each.id}-in-heart`,
          relationType: PART_OF,
          from: each.id,
          to: 'heart',
        })),
    },
    packages: [clinic()],
    views: [],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

function run(command: Command, state: ProjectSnapshot) {
  return executeCommand(state, command, { newId: sequentialIds() });
}

const replaceHeart = (svg: string): Command => ({
  type: 'define-image',
  package: 'clinic',
  image: { id: HEART.id, name: 'Heart', svg },
});

const codes = (state: ProjectSnapshot) => checkProject(state).warnings.map((each) => each.code);

describe('elements drawn as named parts', () => {
  it('names its part in its own image, or in the images its containers show with their parts', () => {
    const state = heartProject([
      {
        id: 'aorta',
        component: 'clinic.chamber',
        name: 'Aorta',
        appearance: { part: { part: 'aorta', image: HEART.id } },
      },
      {
        id: 'loose',
        component: 'clinic.vessel',
        name: 'Loose',
        appearance: { part: { part: 'lung' } },
      },
      { id: 'cava', component: 'clinic.vessel', name: 'Vena cava', appearance: {} },
      {
        id: 'unanchored',
        component: 'clinic.vessel',
        name: 'Unanchored',
        appearance: { part: 'none' },
      },
    ]);
    const anchored = anchoredElements(state).map(({ element, images, inherited }) => [
      element.id,
      images,
      inherited,
    ]);
    expect(anchored).toEqual([
      ['lv', [HEART.id], false],
      ['rv', [HEART.id], false],
      ['aorta', [HEART.id], false],
      // Inside nothing, a part named without its image is found in no image.
      ['loose', [], false],
      ['cava', [HEART.id], true],
    ]);
    expect(anchoredElements(state)).toBe(anchoredElements(state));
  });

  it('warns unknown-part on opening, once for a component and for each element otherwise', () => {
    const state = heartProject([
      chamber('third', 'Third ventricle', 'third-ventricle'),
      { id: 'cava-1', component: 'clinic.vessel', name: 'Upper vena cava' },
      { id: 'cava-2', component: 'clinic.vessel', name: 'Lower vena cava' },
    ]);
    const warnings = checkProject(state).warnings.filter((each) => each.code === 'unknown-part');
    expect(warnings.map((each) => each.subjects)).toEqual([
      ['third', HEART.id],
      ['clinic.vessel', HEART.id],
    ]);
    expect(warnings[0]?.message).toBe(
      'The element "Third ventricle" is drawn as the part "third-ventricle" of the image "Heart" (clinic.heart), which it does not have; it is drawn as an ordinary shape until the picture has that part again.',
    );
    expect(warnings[1]?.message).toContain('The component "Vessel"');
    expect(codes(heartProject())).not.toContain('unknown-part');
  });

  it('refuses a part of an image no package defines, and warns of one on opening', () => {
    const outcome = run(
      {
        type: 'update-element',
        id: 'lv',
        changes: { appearance: { part: { part: 'lv', image: 'clinic.nothing' } } },
      },
      heartProject(),
    );
    expect(outcome.ok ? [] : outcome.problems.map((each) => each.message)).toEqual([
      'The element "Left ventricle" cannot be drawn as a part of the image "clinic.nothing": no package in use defines it.',
    ]);
    const written = heartProject([
      {
        id: 'odd',
        component: 'clinic.chamber',
        name: 'Odd',
        appearance: { part: { part: 'x', image: 'clinic.nothing' } },
      },
    ]);
    const warning = checkProject(written).warnings.find((each) => each.code === 'unknown-image');
    expect(warning?.message).toBe(
      'The element "Odd" is drawn as a part of the image "clinic.nothing", which no package in use defines; it is drawn as an ordinary shape.',
    );
  });

  it('refuses to remove an image while a part names it', () => {
    const state = heartProject([
      {
        id: 'lung',
        component: 'clinic.chamber',
        name: 'Lung',
        appearance: { part: { part: 'lung', image: ATLAS.id } },
      },
    ]);
    const outcome = run({ type: 'remove-image', id: ATLAS.id }, state);
    expect(outcome.ok ? [] : outcome.problems.map((each) => [each.code, each.subjects])).toEqual([
      ['in-use', ['lung']],
    ]);
    expect(run({ type: 'remove-image', id: ATLAS.id }, heartProject()).ok).toBe(true);
  });
});

describe('replacing a picture with anchored parts', () => {
  it('says which anchored parts it would lose, with the elements drawn as them', () => {
    const state = heartProject([chamber('lv-2', 'Second left ventricle', 'left-ventricle')]);
    const next = cleanedImage(svgImage(HEART.id, NO_VENTRICLE, 'Heart'));
    expect(partsLostByReplacing(state, HEART.id, next)).toEqual([
      {
        part: 'left-ventricle',
        elements: [
          { id: 'lv', name: 'Left ventricle' },
          { id: 'lv-2', name: 'Second left ventricle' },
        ],
      },
    ]);
    expect(partsLostByReplacing(state, HEART.id, cleanedImage(HEART))).toEqual([]);
    expect(partsLostByReplacing(state, ATLAS.id, undefined)).toEqual([]);
    expect(partsLostByReplacing(state, HEART.id, undefined).map((each) => each.part)).toEqual([
      'left-ventricle',
      'right-ventricle',
    ]);
  });

  it('keeps the anchors, warns unknown-part in its answer, and an undo brings the part back', () => {
    const state = heartProject();
    const outcome = run(replaceHeart(NO_VENTRICLE), state);
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    expect(
      outcome.warnings.filter((each) => each.code === 'unknown-part').map((each) => each.subjects),
    ).toEqual([['lv', HEART.id]]);
    expect(outcome.state.model).toBe(state.model);
    expect(codes(outcome.state)).toContain('unknown-part');
    // An action that changes no anchor does not say it again.
    const later = run(
      { type: 'update-element', id: 'rv', changes: { name: 'Right' } },
      outcome.state,
    );
    expect(later.ok && later.warnings.map((each) => each.code)).toEqual([]);
    const undone = applyOperations(outcome.state, outcome.inverse).state;
    expect(unknownPartWarnings(undone)).toEqual([]);
    // Bringing the part back anchors it again, and says nothing.
    const back = run(replaceHeart(HEART_SVG), outcome.state);
    expect(back.ok && back.warnings.map((each) => each.code)).not.toContain('unknown-part');
    expect(back.ok && unknownPartWarnings(back.state)).toEqual([]);
  });

  it('warns too-many-parts as a picture past the caps on parts is defined', () => {
    const squares = Array.from(
      { length: 1030 },
      (_, at) => `<path d="M${at} 0h1v1z" id="p${at}"/>`,
    );
    const outcome = run(
      {
        type: 'define-image',
        package: 'clinic',
        image: { name: 'Atlas', svg: `<svg viewBox="0 0 1100 1" ${NS}>${squares.join('')}</svg>` },
      },
      heartProject(),
    );
    expect(outcome.ok && outcome.warnings.map((each) => each.code)).toEqual(['too-many-parts']);
  });
});
