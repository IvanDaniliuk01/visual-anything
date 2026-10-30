/**
 * The core's messages about faces (ADR 0083) through the Spanish templates (ADR-0038): a corpus of
 * faces, well formed and hostile, compiled, checked, laid out, set by commands on the sample project
 * and opened with it. Every message, and every problem as the face editor shows it alone, where it
 * is and what is wrong, must read in Spanish; and each reason the faces code can give must be one the
 * corpus produces, so that a reason added to the core without a template is noticed.
 */
import {
  checkProject,
  compileFace,
  executeCommand,
  faceMessage,
  facePalette,
  faceProblems,
  layOutFace,
  type Command,
  type FaceProblem,
  type ProjectSnapshot,
  type ResolvedFace,
} from '@visual-anything/core';
import type { Face, PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { translateMessage, untranslatedParts } from './translate';

const sample = loadSample();

/** A face of markup lines, style lines and more parts. */
function face(
  markup: string | readonly string[],
  style: string | readonly string[] = [],
  more: Partial<ResolvedFace> = {},
): ResolvedFace {
  return {
    size: 'shape',
    markup: typeof markup === 'string' ? [markup] : markup,
    style: typeof style === 'string' ? [style] : style,
    variants: [],
    ...more,
  };
}

const NINE_RULES = Array.from(
  { length: 9 },
  (_, at) => `.k-${at} { color: #${String(at).repeat(6)}; }`,
).join(' ');

/** Faces that give every problem the faces code has, one or a few each. */
const CORPUS: readonly ResolvedFace[] = [
  // The strict reader.
  face('<!-- never closed'),
  face('<!-- a -- b -->'),
  face('<!DOCTYPE html>'),
  face('<b>x</b x>'),
  face('</b>'),
  face('<b><i>x</b></i>'),
  face(`${'<div>'.repeat(17)}${'</div>'.repeat(17)}`),
  face('<b>x'),
  face('<b'),
  face('<b class="a"if="x">x</b>'),
  face('</B>'),
  face('<B/>'),
  face('<b Class="x"/>'),
  face('<b></ b>'),
  face('< b/>'),
  face('<b ="x"/>'),
  face('<b></bA>'),
  face('<bA/>'),
  face('<b clAss="x"/>'),
  face('<b class/>'),
  face('<b class=x/>'),
  face('<b class="x/>'),
  face('<b class="<"/>'),
  face('<b class="a" class="b"/>'),
  face('<b>a & b</b>'),
  face('<b>&#0;</b>'),
  face('<b>&nbsp;</b>'),
  // The subset of elements and attributes.
  face('<b/>', [], {
    variants: [
      { id: 'far', markup: ['<b/>'] },
      { id: 'far', markup: ['<i/>'] },
    ],
  }),
  face('<b/>', [], { variants: [{ id: 'far', markup: ['<b/>'] }], collapsed: 'near' }),
  face('<b/>', [], {
    variants: Array.from({ length: 9 }, (_, at) => ({ id: `v${at}`, markup: ['<b/>'] })),
  }),
  face(Array.from({ length: 201 }, () => '<b/>')),
  face(Array.from({ length: 10 }, () => `<p>${'x'.repeat(1690)}</p>`)),
  face(
    '<b/>',
    Array.from({ length: 10 }, () => `/* ${'x'.repeat(1690)} */`),
  ),
  face([`<b>${'x'.repeat(2001)}</b>`], ['b {', `/* ${'x'.repeat(2001)} */`, '}']),
  face(['<rows/>', '<b/>']),
  face('<b if="status" else="status"/>'),
  face('<b else="status"/>'),
  face('<script/>'),
  face('<blink/>'),
  face('<icon/><icon/>'),
  face('<b/><rows/><contents/>'),
  face('<br>x</br>'),
  face('<rows if="status"/>'),
  face('<contents else="status"/>'),
  face('<b ref="x"/>'),
  face('<image ref="Not An Id"/>'),
  face('<b onclick="x"/>'),
  face('<b href="x"/>'),
  face('<b title="x"/>'),
  face('<image/>'),
  face('<each of="not status"><b/></each>'),
  face('<each of="attributes" class="x"><b/></each>'),
  face('<each of="attributes" for="x"><b/></each>'),
  face('<each><b/></each>'),
  face('<each of="tags" only="a"><b/></each>'),
  // Slots and conditions.
  face('<b>{{name</b>'),
  face('<b>{{attr}}</b>'),
  face('<b>{{}}</b>'),
  face('<b>{{not}}</b>'),
  face('<b>{{name ?? x}}</b>'),
  face('<b>{{name | upper}}</b>'),
  face('<b>{{name x}}</b>'),
  face('<b if="not status = 1">x</b>'),
  face('<b if="status ~ 1">x</b>'),
  face('<b if="status = x">x</b>'),
  face('<b if="status in">x</b>'),
  face('<b if="status = 1 2">x</b>'),
  face('<b if="status &lt; \'a\'">x</b>'),
  // Style the subset drops, and its caps.
  face('<b>x</b>', [
    '@media print { b { color: #000000; } }',
    'b { c { color: #000000; } }',
    `${Array.from({ length: 17 }, (_, at) => `.s${at}`).join(', ')} { color: #000000; }`,
    'a b c d e { color: #000000; }',
    '#id { color: #000000; }',
    'b { color }',
    'b { color: #000000 !important; }',
    'b { color: url(x); }',
    'b { color: red; }',
    `b { grid-template-columns: ${Array(13).fill('1fr').join(' ')}; }`,
    'b { font-size: 40px; }',
    'b { transform: none; }',
    'b',
  ]),
  face('<b style="transform: none; color: blue">x</b>'),
  face(
    '<b/>',
    Array.from({ length: 129 }, (_, at) => `.r${at} { color: #000000; }`),
  ),
  // Contrast, attributes the component does not have, and the check's budget.
  face(
    ['<p class="pale">x</p>', '<p class="dark">y</p>'],
    ['.pale { color: #FEFEFE; }', '.dark { color: #010101; }'],
  ),
  face('<b>{{nope}}</b>'),
  face(`${'<div class="k-{{status}}">'.repeat(16)}x${'</div>'.repeat(16)}`, NINE_RULES),
];

/** Faces that compile, and that laying out stops at a cap of: boxes, runs and filling. */
const TOO_LARGE_TO_LAY_OUT: readonly ResolvedFace[] = [
  face(Array.from({ length: 4 }, () => '<p>x</p>'.repeat(100))),
  face(Array.from({ length: 3 }, () => '<b>x</b><i>y</i>'.repeat(100))),
  face(`<each of="tags"><each of="tags">${'<b if="nope">x</b>'.repeat(5)}</each></each>`),
  face([]),
];

const palettes = {
  light: facePalette('light', '#FFFFFF', '#333333'),
  dark: facePalette('dark', '#1E1E1E', '#CCCCCC'),
};

/** The problems of a face, as the editor checks it for a component with a "status" and "tags". */
function problemsOf(resolved: ResolvedFace): FaceProblem[] {
  return faceProblems(resolved, { attributes: new Set(['status', 'tags']), palettes });
}

/** The fallbacks of faces that cannot be laid out. */
function layoutProblems(): FaceProblem[] {
  const input = {
    name: 'orders',
    component: 'Table',
    attributes: [
      { name: 'tags', value: Array.from({ length: 40 }, (_, at) => `t${at}`) },
      { name: 'nope', value: undefined },
    ],
  };
  return TOO_LARGE_TO_LAY_OUT.flatMap((resolved) => {
    const drawing = layOutFace(compileFace(resolved), input, { width: 200 });
    return drawing.fallback === undefined ? [] : [drawing.fallback];
  });
}

/** A face as a command sets it: only the parts it has. */
function asFace(resolved: ResolvedFace): Face {
  return {
    size: resolved.size,
    ...(resolved.markup.length === 0 ? {} : { markup: [...resolved.markup] }),
    ...(resolved.style.length === 0 ? {} : { style: [...resolved.style] }),
    ...(resolved.variants.length === 0 ? {} : { variants: [...resolved.variants] }),
    ...(resolved.collapsed === undefined ? {} : { collapsed: resolved.collapsed }),
  };
}

/** Faces the commands' own checks refuse before compiling: their parts are not what a face holds. */
const MALFORMED: readonly unknown[] = [
  5,
  { colour: 'x' },
  { size: 'big' },
  { markup: 'x' },
  { style: 'x' },
  { markup: ['a\nb'] },
  { style: ['a\nb'] },
  { variants: 'x' },
  { variants: [1] },
  { variants: [{ id: 'far', markup: [], also: 1 }] },
  { variants: [{ id: 'Far', markup: [] }] },
  { collapsed: 'Far' },
];

/** What setting faces says, on a component through its traits and on an element whole. */
function commandMessages(): string[] {
  const said: string[] = [];
  const run = (command: Command) => {
    const outcome = executeCommand(sample, command, { newId: (base) => `${base}-1` });
    if (outcome.ok) {
      said.push(outcome.label, ...outcome.warnings.map((each) => each.message));
    } else said.push(...outcome.problems.map((each) => each.message));
  };
  const faces: unknown[] = [...CORPUS.map(asFace), ...MALFORMED];
  for (const value of faces) {
    run({
      type: 'set-component-appearance',
      component: 'clinic.calendar',
      appearanceTraits: { face: value },
    } as Command);
    run({
      type: 'update-element',
      id: 'patient',
      changes: { appearance: { face: value } },
    } as Command);
  }
  // The levels that name a face's variant (ADR 0055, ADR 0083).
  for (const levels of [
    [{ from: 1, shows: ['name'], face: 'far' }],
    [{ from: 1, shows: ['face'], face: 'Far' }],
  ]) {
    run({
      type: 'set-component-appearance',
      component: 'clinic.calendar',
      appearanceTraits: { levels },
    } as Command);
  }
  return said;
}

/** What opening a project says about its faces: an element's broken face and a heavy package. */
function openingMessages(): string[] {
  const broken = asFace(
    face('<b>{{nope}}</b>', [
      ...Array.from({ length: 12 }, (_, at) => `.x${at} { transform: none; }`),
    ]),
  );
  const heavy: PackageFile = {
    id: 'heavy',
    name: 'Heavy',
    components: Array.from({ length: 40 }, (_, at) => ({
      id: `heavy.c${at}`,
      name: `C${at}`,
      derivesFrom: 'systems.box',
      appearance: {
        face: { markup: Array.from({ length: 10 }, () => `<p>${'x'.repeat(1500)}</p>`) },
      },
    })),
    relationTypes: [],
  };
  const project: ProjectSnapshot = {
    ...sample,
    project: { ...sample.project, packages: [...sample.project.packages, 'heavy'] },
    packages: [...sample.packages, heavy],
    model: {
      ...sample.model,
      elements: sample.model.elements.map((each) =>
        each.id === 'patient' ? { ...each, appearance: { face: broken } } : each,
      ),
    },
  };
  const { errors, warnings } = checkProject(project);
  return [...errors, ...warnings]
    .filter((each) => each.code.includes('face'))
    .map((each) => each.message);
}

const problems = [...CORPUS.flatMap(problemsOf), ...layoutProblems()];
const editorMessages = problems.map(faceMessage);
const said = [...commandMessages(), ...openingMessages()];

/**
 * Every reason the faces code gives, its first letter lowercased as a message holds it after where
 * the problem is. Values are in braces.
 */
const REASONS: readonly string[] = [
  // reader.ts
  'a comment is never closed with "-->".',
  'a comment holds "--", which XHTML refuses.',
  'doctypes, CDATA sections and processing instructions are not part of a face.',
  'the closing tag of "{name}" ends with ">".',
  '"</{name}>" closes no open element.',
  '"</{name}>" closes "{other}", opened at line {n}, column {m}.',
  'elements nest more than {n} deep.',
  '"<{name}>" is never closed: write "</{name}>", or "<{name}/>" when it is empty.',
  'the tag "<{name}" is never ended with ">".',
  'attributes of "{name}" are separated by spaces.',
  'a closing tag is named in lowercase.',
  'an element is named in lowercase.',
  'an attribute of "{name}" is named in lowercase.',
  'a closing tag needs a name, a letter first.',
  'an element needs a name, a letter first.',
  'an attribute of "{name}" needs a name, a letter first.',
  'a closing tag is named in lowercase letters, digits and "-".',
  'an element is named in lowercase letters, digits and "-".',
  'an attribute of "{name}" is named in lowercase letters, digits and "-".',
  'the attribute "{attribute}" of "{name}" needs a quoted value, such as {attribute}="…".',
  'the value of "{attribute}" is written in quotes.',
  'the value of "{attribute}" is never closed.',
  'the value of "{attribute}" holds "<", which is written "&lt;".',
  '"{name}" has the attribute "{attribute}" twice.',
  'a "&" starts an entity, such as "&amp;", which ends with ";".',
  '"&{name};" is not a character XHTML allows.',
  '"&{name};" is not an entity a face takes: only &amp;, &lt;, &gt;, &quot;, &apos; and numeric ones.',
  // compile.ts
  'two variants are named "{id}".',
  'a collapsed container shows the variant "{id}", which the face does not have.',
  'a face has at most {n} variants.',
  "a face's markup, its variants' included, holds at most {n} lines.",
  "a face's markup, its variants' included, holds at most {n} KiB.",
  "a face's style holds at most {n} KiB.",
  'a line holds at most 2,000 characters and no line break.',
  '<{name}/> is the last element at the top of the markup, under what the face shows above it.',
  'an element takes "if" or "else", not both: write the condition in "else".',
  '"else" follows an element with "if", or one with "else" and a condition.',
  '<{name}> is not part of a face: nothing in a face runs or is fetched.',
  '<{name}> is not an element a face takes.',
  'a markup holds <{name}/> once.',
  'a markup holds <rows/> or <contents/>, not both.',
  '<{name}/> holds nothing: write it "<{name}/>".',
  "<rows/> takes no condition: it shows where the shape's rows go.",
  "<contents/> takes no condition: it shows where the shape's contents go.",
  '"ref" belongs to <image/> only.',
  'an image is named by the id its package gives it.',
  '"{name}" is refused: nothing in a face runs.',
  '"{name}" is refused: nothing in a face is fetched.',
  '"{name}" is not an attribute a face takes: only class, style, if and else.',
  '<image/> names an image of the package with ref="its id".',
  '"of" names "attributes", or a list attribute by its name.',
  '<each> makes no box of its own: put "{name}" on what it repeats.',
  '"{name}" is not an attribute <each> takes: only of, only, except, if and else.',
  '<each> says what it repeats over with "of".',
  '"only" and "except" choose among the attributes, with of="attributes".',
  // slots.ts
  'a "{{" is never closed with "}}".',
  'a slot names an attribute as attr "its name".',
  'a slot names what it writes: name, component, count, or an attribute.',
  '"{word}" is a word of slots: write attr "{word}" for an attribute of that name.',
  'a slot gives one text in quotes after "??".',
  'a slot takes "| plain" only.',
  'a slot is a name, then ?? "a text" or | plain if wanted.',
  '"not" goes before a value alone, as in "not archived".',
  "a condition compares with =, !=, <, <=, >, >= or in, as in status = 'live'.",
  'a condition compares with a text in quotes or a number.',
  "a condition with in lists texts in quotes or numbers, as in status in 'live' 'frozen'.",
  'a condition compares with one text in quotes or one number.',
  '"{op}" compares with a number.',
  // style.ts
  '"@" rules are not part of a face: they are dropped.',
  'this text is not a rule: a rule is selectors, then declarations in braces.',
  'rules do not nest: this rule is dropped.',
  "a face's style holds at most {n} rules.",
  'a rule lists at most {n} selectors: it is dropped.',
  'a selector joins at most {n} parts: "{selector}" is dropped.',
  'the selector "{selector}" is not one a face takes: an element, a class, both, or those joined by spaces. It is dropped.',
  '"{text}" is not a declaration: it is a property, ":" and a value.',
  '"!important" is not part of a face: "{property}" is dropped.',
  'the value of "{property}" holds characters a face\'s style does not take: it is dropped.',
  '"{value}" is not a value "{property}" takes in a face: it is dropped.',
  'a grid has at most {n} columns: "{property}" is dropped.',
  'a face\'s text is {n} to {m} px: "font-size: {value}" is dropped.',
  '"{property}" is not a property a face takes: it is dropped.',
  // contrast.ts and check.ts
  'its text, {text} on {back}, reads at {n}:1 in the light theme, under {m}:1.',
  'its text, {text} on {back}, reads at {n}:1 in the dark theme, under {m}:1.',
  'its contrast was checked only in part: its conditions and classes made from values give more ways to draw it than the check reads.',
  'it names the attribute "{name}", which the component does not have.',
  // layout.ts
  'a face lays out at most {n} runs of text.',
  'a face fills at most {n} parts of its markup.',
  'a face lays out at most {n} boxes.',
  'the face has no markup.',
];

/** A reason's template as a pattern: its braces stand for any text. */
function patternOfReason(template: string): RegExp {
  const source = template
    .split(/\{\w+\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.+?');
  return new RegExp(`^${source}$`, 'u');
}

function lowercasedFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

describe('the messages about faces', () => {
  it('read in Spanish as the core writes them: refusals, warnings and labels', () => {
    const untranslated = [...new Set(said)].filter(
      (message) => untranslatedParts('es', message).length > 0,
    );
    expect(untranslated).toEqual([]);
    expect(said.length).toBeGreaterThan(100);
  });

  it('read in Spanish as the face editor shows them alone: where, then what is wrong', () => {
    const untranslated = [...new Set(editorMessages)].filter(
      (message) => untranslatedParts('es', message).length > 0,
    );
    expect(untranslated).toEqual([]);
  });

  it('come from every reason the faces code gives, and from no other', () => {
    const reasons = [...new Set(problems.map((each) => lowercasedFirst(each.reason)))];
    const patterns = REASONS.map(patternOfReason);
    const unknown = reasons.filter((reason) => !patterns.some((pattern) => pattern.test(reason)));
    expect(unknown).toEqual([]);
    const unproduced = REASONS.filter(
      (_, at) => !reasons.some((reason) => patterns[at]!.test(reason)),
    );
    expect(unproduced).toEqual([]);
  });

  it('read as Spanish people would write them', () => {
    expect(
      translateMessage(
        'es',
        'The face of the component "Calendar": Line 2, column 3 of the markup: <img> is not part of a face: nothing in a face runs or is fetched.',
      ),
    ).toBe(
      'La cara del componente "Calendar": Línea 2, columna 3 del marcado: <img> no es parte de una cara: nada en una cara se ejecuta ni se descarga.',
    );
    expect(
      translateMessage(
        'es',
        'Line 1, column 4 of the markup: it names the attribute "nope", which the component does not have.',
      ),
    ).toBe(
      'Línea 1, columna 4 del marcado: nombra el atributo "nope", que el componente no tiene.',
    );
    expect(translateMessage('es', 'In the variant "far": two variants are named "far".')).toBe(
      'En la variante "far": dos variantes se llaman "far".',
    );
    expect(
      translateMessage(
        'es',
        'Line 3 of the style: a line holds at most 2,000 characters and no line break.',
      ),
    ).toBe(
      'Línea 3 del estilo: una línea tiene como máximo 2.000 caracteres y ningún salto de línea.',
    );
    expect(translateMessage('es', 'The face of the element "Patient" has 3 more problems.')).toBe(
      'La cara del elemento "Patient" tiene 3 problemas más.',
    );
    expect(translateMessage('es', 'The face of the element "Patient" has 1 more problems.')).toBe(
      'La cara del elemento "Patient" tiene 1 problema más.',
    );
  });
});
