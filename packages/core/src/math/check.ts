/**
 * What a project's Math gives as it is checked (ADR 0106): every text that takes text emphasis is
 * read as it is drawn, with its blocks or as one line, and each piece of Math in it that cannot be
 * typeset gives one `math-error` warning, naming where it is, its TeX and KaTeX's message; it is drawn
 * as its TeX. Each text that holds Math gives one `reads-as-math` notice, which only tells, so that a
 * text whose dollar signs were not meant as Math can be escaped with `\$`.
 *
 * The work is capped, so that a huge project still opens fast: a text with no `$` and no `math` is
 * never read, a text holds at most `MAX_MATH_PER_TEXT` pieces of Math as the reader reads it, the same
 * TeX is typeset once, at most {@link MAX_MATH_CHECKED} distinct pieces are typeset in one check, and
 * at most `WARNINGS_SHOWN` of each kind are listed, then a summary.
 */
import type { Id } from '@visual-anything/schema';
import type { Definitions } from '../definitions';
import { problem, type Problem } from '../problems';
import { WARNINGS_SHOWN } from '../rules';
import type { ProjectSnapshot } from '../snapshot';
import { parseEmphasis, type EmphasisBlock, type EmphasisRun } from '../text/emphasis';
import { typesetMath } from './typeset';

/** How many distinct pieces of Math one check typesets at most; past it, the rest is not checked. */
export const MAX_MATH_CHECKED = 1_000;

/** How many characters of a piece's TeX a warning quotes. */
const TEX_QUOTED = 40;

/** What checking a project's Math finds. */
export interface MathFindings {
  /** `math-error`: a piece of Math that cannot be typeset, drawn as its TeX. */
  warnings: Problem[];
  /** `reads-as-math`: a text that holds Math, told and not warned about. */
  notices: Problem[];
}

/** A text that takes text emphasis, how it is read, and where it is. */
export interface EmphasisTextOf {
  text: string;
  /** Whether it is read with its blocks: false for a text of one line. */
  blocks: boolean;
  /** Where it is, as a message names it: `the description of the element "Loss"`. */
  where: string;
  /** The item it belongs to, whose file holds it; none for the project's own description. */
  subject?: Id;
}

/**
 * Every text of a project that takes text emphasis (ADR 0082), as Claude's tools list them: the
 * descriptions of the project, its packages, their components, relation types and attributes, its
 * elements, relations, views and their perspectives, scenarios and tours; notes; a tour step's
 * caption text, its reveals' texts and its speaker notes; and the values of string attributes whose
 * definition's format is `emphasis`. A perspective's description and an attribute's value are read as
 * one line, every other text with its blocks.
 */
export function* emphasisTexts(
  state: ProjectSnapshot,
  definitions: Definitions,
): Generator<EmphasisTextOf> {
  const described = function* (
    description: string | undefined,
    of: string,
    subject?: Id,
    blocks = true,
  ): Generator<EmphasisTextOf> {
    if (description === undefined || description === '') return;
    yield {
      text: description,
      blocks,
      where: `the description of ${of}`,
      ...(subject === undefined ? {} : { subject }),
    };
  };

  yield* described(state.project.description, 'the project');
  for (const file of state.packages) {
    yield* described(file.description, `the package "${file.name}"`, file.id);
    const definitionsOf = [
      ...file.components.map((each) => ({ each, of: `the component "${each.name}"` })),
      ...file.relationTypes.map((each) => ({ each, of: `the relation type "${each.name}"` })),
    ];
    for (const { each, of } of definitionsOf) {
      yield* described(each.description, of, each.id);
      for (const attribute of each.attributes ?? []) {
        yield* described(
          attribute.description,
          `the attribute "${attribute.name}" of ${of}`,
          each.id,
        );
      }
    }
  }

  const values = function* (
    attributes: Readonly<Record<string, unknown>> | undefined,
    defined: readonly { name: string; format?: string }[] | undefined,
    of: string,
    subject: Id,
  ): Generator<EmphasisTextOf> {
    if (attributes === undefined || defined === undefined) return;
    for (const definition of defined) {
      if (definition.format !== 'emphasis') continue;
      const value = attributes[definition.name];
      if (typeof value !== 'string' || value === '') continue;
      yield {
        text: value,
        blocks: false,
        where: `the value of "${definition.name}" of ${of}`,
        subject,
      };
    }
  };
  const { world, elements, relations } = state.model;
  for (const element of [world, ...elements]) {
    const of = `the element "${element.name}"`;
    yield* described(element.description, of, element.id);
    const component = definitions.component(element.component);
    yield* values(element.attributes, component?.attributes, of, element.id);
  }
  for (const relation of relations) {
    const of = `the relation "${relation.id}"`;
    yield* described(relation.description, of, relation.id);
    const type = definitions.relationType(relation.relationType);
    yield* values(relation.attributes, type?.attributes, of, relation.id);
  }

  for (const view of state.views) {
    const of = `the view "${view.name}"`;
    yield* described(view.description, of, view.id);
    yield* described(view.perspective.description, `the perspective of ${of}`, view.id, false);
    for (const shape of view.freeShapes) {
      if (shape.kind === 'note' && shape.text !== '') {
        yield { text: shape.text, blocks: true, where: `a note in ${of}`, subject: view.id };
      }
    }
  }
  for (const scenario of state.scenarios) {
    yield* described(scenario.description, `the scenario "${scenario.name}"`, scenario.id);
  }
  for (const tour of state.tours) {
    const of = `the tour "${tour.name}"`;
    yield* described(tour.description, of, tour.id);
    for (const [at, step] of tour.steps.entries()) {
      const stepOf = `step ${at + 1} of ${of}`;
      const text = (value: string | undefined, where: string): EmphasisTextOf[] =>
        value === undefined || value === ''
          ? []
          : [{ text: value, blocks: true, where, subject: tour.id }];
      yield* text(step.caption.text, `the caption of ${stepOf}`);
      for (const [index, reveal] of (step.reveal ?? []).entries()) {
        yield* text(reveal.text, `reveal ${index + 1} of ${stepOf}`);
      }
      yield* text(step.notes, `the speaker notes of ${stepOf}`);
    }
  }
}

/** One piece of Math in a text: its TeX and its style. */
interface MathIn {
  tex: string;
  display: boolean;
}

/** The pieces of Math in a text, in order, as the reader reads it. */
export function mathIn(text: string, blocks: boolean): MathIn[] {
  // Math needs a `$`, or a fence whose language is `math`: other texts are never read.
  if (!text.includes('$') && !(blocks && text.includes('math'))) return [];
  const found: MathIn[] = [];
  const runs = (list: readonly EmphasisRun[]) => {
    for (const run of list)
      if (run.math) found.push({ tex: run.math.tex, display: run.math.display });
  };
  const walk = (list: readonly EmphasisBlock[]) => {
    for (const block of list) {
      switch (block.kind) {
        case 'paragraph':
        case 'heading':
          runs(block.runs);
          break;
        case 'list':
          for (const item of block.items) walk(item.blocks);
          break;
        case 'quote':
          walk(block.blocks);
          break;
        case 'table':
          for (const cell of block.head) runs(cell);
          for (const row of block.rows) for (const cell of row) runs(cell);
          break;
        case 'math':
          found.push({ tex: block.tex, display: true });
          break;
        case 'rule':
        case 'code':
          break;
      }
    }
  };
  walk(parseEmphasis(text, { blocks }));
  return found;
}

/**
 * KaTeX's message as one line, for a warning: its context underlines the character at fault with
 * combining low lines, which read as noise outside KaTeX's own page, and it may run over lines.
 */
export function mathErrorText(error: string): string {
  return error.replace(/̲/g, '').replace(/\s+/g, ' ').trim();
}

/** A piece's TeX as a warning quotes it: on one line, and cut after {@link TEX_QUOTED} characters. */
function quoted(tex: string): string {
  const line = tex.replace(/\s+/g, ' ').trim();
  return line.length > TEX_QUOTED ? `${line.slice(0, TEX_QUOTED - 1).trimEnd()}…` : line;
}

/** Checks the Math of every text that takes text emphasis. */
export function mathFindings(state: ProjectSnapshot, definitions: Definitions): MathFindings {
  const errors: Problem[] = [];
  const notices: Problem[] = [];
  let failed = 0;
  let read = 0;
  let unchecked = 0;
  const checked = new Map<string, string | undefined>();
  for (const { text, blocks, where, subject } of emphasisTexts(state, definitions)) {
    const found = mathIn(text, blocks);
    if (found.length === 0) continue;
    const subjects = subject === undefined ? [] : [subject];
    read++;
    if (read <= WARNINGS_SHOWN) {
      notices.push(
        problem(
          'reads-as-math',
          `Math is read in ${where}: write \\$ for a dollar sign that is not Math.`,
          subjects,
        ),
      );
    }
    let skipped = false;
    for (const { tex, display } of found) {
      const key = `${display ? 'd' : 'i'}${tex}`;
      let error = checked.get(key);
      if (!checked.has(key)) {
        if (checked.size >= MAX_MATH_CHECKED) {
          skipped = true;
          continue;
        }
        const typeset = typesetMath(tex, { display });
        error = typeset.ok ? undefined : mathErrorText(typeset.error);
        checked.set(key, error);
      }
      if (error === undefined) continue;
      failed++;
      if (failed <= WARNINGS_SHOWN) {
        errors.push(
          problem(
            'math-error',
            `Math in ${where} is drawn as its TeX, "${quoted(tex)}", since it cannot be typeset: ${error}`,
            subjects,
          ),
        );
      }
    }
    if (skipped) unchecked++;
  }
  if (failed > WARNINGS_SHOWN) {
    const rest = failed - WARNINGS_SHOWN;
    errors.push(
      problem(
        'math-error',
        rest === 1
          ? `…and ${rest} more piece of Math cannot be typeset.`
          : `…and ${rest} more pieces of Math cannot be typeset.`,
      ),
    );
  }
  if (read > WARNINGS_SHOWN) {
    const rest = read - WARNINGS_SHOWN;
    notices.push(
      problem(
        'reads-as-math',
        rest === 1
          ? `…and ${rest} more text reads as Math.`
          : `…and ${rest} more texts read as Math.`,
      ),
    );
  }
  if (unchecked > 0) {
    const limit = MAX_MATH_CHECKED.toLocaleString('en-US');
    notices.push(
      problem(
        'reads-as-math',
        unchecked === 1
          ? `Math in ${unchecked} text was not checked: one check typesets at most ${limit} pieces of Math.`
          : `Math in ${unchecked} texts was not checked: one check typesets at most ${limit} pieces of Math.`,
      ),
    );
  }
  return { warnings: errors, notices };
}
