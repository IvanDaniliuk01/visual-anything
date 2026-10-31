/**
 * Checking a face's contrast (ADR 0083): every text's color against the background it is drawn on,
 * in both themes, warned under 4.5:1, or 3:1 for large text, as stored colors are checked. It reads the
 * compiled face, not one element's drawing: every branch of a condition is checked, and a class made
 * from a slot is checked without a rule and with each rule it could pick.
 */
import { contrastRatio, MINIMUM_MARK_CONTRAST, MINIMUM_TEXT_CONTRAST } from '../colors';
import type { ThemeName } from '../preferences';
import type { CompiledFace, CompiledMarkup, FaceNode } from './compile';
import { resolveFaceColor, type FacePalette } from './palette';
import type { FaceProblem } from './problems';
import type { SlotText } from './slots';
import {
  cascade,
  computeStyle,
  INITIAL_STYLE,
  TAG_DEFAULTS,
  type FaceColor,
  type FaceStyle,
  type Matched,
} from './style';

/** The most ways one element's classes are checked. */
const MAX_CLASS_CHOICES = 8;
/**
 * The most steps one face's check takes, every element visited with each of its class choices and
 * every text counted: class choices multiply through nested elements, so the walk stops when its
 * budget is spent, and says so.
 */
const MAX_STEPS = 4_096;

/** Large text, as WCAG counts it: 18 pt, or 14 pt in bold. */
function large(style: FaceStyle): boolean {
  return style.fontSize >= 24 || (style.bold && style.fontSize >= 18.66);
}

/** The contrast problems of a face, drawn on shapes of these colors in each theme. */
export function faceContrastProblems(
  compiled: CompiledFace,
  palettes: Readonly<Record<ThemeName, FacePalette>>,
): FaceProblem[] {
  const problems: FaceProblem[] = [];
  const seen = new Set<string>();
  const classNames = new Set<string>();
  for (const rule of compiled.rules) {
    for (const selector of rule.selectors) {
      for (const compound of selector.compounds)
        for (const name of compound.classes) classNames.add(name);
    }
  }
  let steps = 0;
  /** Takes a step of the budget, answering false once it is spent. */
  const step = (): boolean => {
    steps += 1;
    return steps <= MAX_STEPS;
  };
  const markups: CompiledMarkup[] = [
    ...(compiled.markup === undefined ? [] : [compiled.markup]),
    ...compiled.variants.values(),
  ];
  const rootMatch: Matched = { name: 'face', classes: [] };
  const rootStyle = computeStyle(INITIAL_STYLE, cascade(compiled.rules, rootMatch, []));

  const check = (
    style: FaceStyle,
    back: FaceColor,
    markup: CompiledMarkup,
    at: { line: number; column: number },
  ) => {
    for (const theme of ['light', 'dark'] as const) {
      const palette = palettes[theme];
      const text = resolveFaceColor(style.color, palette);
      const behind = resolveFaceColor(back, palette);
      const ratio = contrastRatio(text, behind);
      const least = large(style) ? MINIMUM_MARK_CONTRAST : MINIMUM_TEXT_CONTRAST;
      if (ratio >= least) continue;
      const key = `${JSON.stringify(markup.part)} ${at.line} ${at.column} ${theme}`;
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push({
        code: 'face-contrast',
        severity: 'warning',
        part: markup.part,
        line: at.line,
        column: at.column,
        reason: `Its text, ${text} on ${behind}, reads at ${ratio.toFixed(1)}:1 in the ${theme} theme, under ${least}:1.`,
      });
    }
  };

  const visit = (
    nodes: readonly FaceNode[],
    parent: FaceStyle,
    back: FaceColor,
    ancestors: readonly Matched[],
    markup: CompiledMarkup,
  ): void => {
    for (const node of nodes) {
      if (steps > MAX_STEPS) return;
      switch (node.kind) {
        case 'text':
          if (node.text.some((part) => typeof part !== 'string' || part.trim() !== '')) {
            if (!step()) return;
            check(parent, back, markup, node.at);
          }
          break;
        case 'choice':
          for (const branch of node.branches) visit([branch.node], parent, back, ancestors, markup);
          break;
        case 'each':
          visit(node.children, parent, back, ancestors, markup);
          break;
        case 'element':
          for (const classes of classChoices(node.classes, classNames)) {
            if (!step()) return;
            const matched: Matched = { name: node.tag, classes };
            const style = computeStyle(parent, [
              ...(TAG_DEFAULTS[node.tag] ?? []),
              ...cascade(compiled.rules, matched, ancestors),
              ...node.inline,
            ]);
            if (style.display === 'none') continue;
            const behind = style.background ?? back;
            if (node.tag === 'detail' || node.tag === 'badges')
              check(style, behind, markup, node.at);
            visit(node.children, style, behind, [...ancestors, matched], markup);
          }
          break;
      }
    }
  };

  for (const markup of markups) {
    visit(markup.nodes, rootStyle, rootStyle.background ?? 'fill', [rootMatch], markup);
    if (steps > MAX_STEPS) {
      problems.push({
        code: 'face-contrast',
        severity: 'warning',
        part: markup.part,
        line: 0,
        column: 0,
        reason:
          'Its contrast was checked only in part: its conditions and classes made from values give more ways to draw it than the check reads.',
      });
      break;
    }
  }
  return problems;
}

/** The sets of classes an element is checked with: its literal ones, and each a slot could add. */
function classChoices(classes: readonly SlotText[], known: ReadonlySet<string>): string[][] {
  const literal: string[] = [];
  const patterns: (readonly string[])[] = [];
  for (const each of classes) {
    if (each.every((part) => typeof part === 'string')) literal.push(each.join(''));
    else patterns.push(classPattern(each));
  }
  const choices = [literal];
  for (const name of known) {
    if (choices.length > MAX_CLASS_CHOICES) break;
    if (!literal.includes(name) && patterns.some((pattern) => classMatches(pattern, name))) {
      choices.push([...literal, name]);
    }
  }
  return choices;
}

/**
 * A class with slots as the literal texts between its slots, in order: slots side by side count as
 * one, and the first and last texts are empty when the class starts or ends with a slot.
 */
export function classPattern(text: SlotText): readonly string[] {
  const literals = [''];
  let slotted = false;
  for (const part of text) {
    if (typeof part === 'string') {
      literals[literals.length - 1] += part;
      slotted = false;
    } else if (!slotted) {
      literals.push('');
      slotted = true;
    }
  }
  return literals;
}

const SLOT_CHARACTER = /^[a-z0-9-]$/;

/**
 * Whether a class name is one a class's slots could write, in time linear in the name: the first
 * text as its start, the last as its end, the ones between found in order at their first place, and
 * what the slots write made of `[a-z0-9-]` only. The first place is the best one: a later place would
 * only give the slot before it more characters to hold.
 */
export function classMatches(literals: readonly string[], name: string): boolean {
  if (literals.length === 1) return name === literals[0];
  const first = literals[0]!;
  const last = literals.at(-1)!;
  if (first.length + last.length > name.length) return false;
  if (!name.startsWith(first) || !name.endsWith(last)) return false;
  const end = name.length - last.length;
  let at = first.length;
  const slotFits = (from: number, to: number): boolean => {
    for (let index = from; index < to; index += 1) {
      if (!SLOT_CHARACTER.test(name[index]!)) return false;
    }
    return true;
  };
  for (let index = 1; index < literals.length - 1; index += 1) {
    const literal = literals[index]!;
    const found = name.indexOf(literal, at);
    if (found === -1 || found + literal.length > end) return false;
    if (!slotFits(at, found)) return false;
    at = found + literal.length;
  }
  return slotFits(at, end);
}
