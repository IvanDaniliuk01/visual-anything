/**
 * Checking a face's contrast (ADR 0083): every text's color against the background it is drawn on,
 * in both themes, warned under 4.5:1, or 3:1 for large text, as stored colors are checked. It reads the
 * compiled face, not one element's drawing: every branch of a condition is checked, and a class made
 * from a slot is checked without a rule and with each rule it could pick.
 */
import { contrastRatio, MINIMUM_MARK_CONTRAST, MINIMUM_TEXT_CONTRAST } from '../colors';
import type { ThemeName } from '../preferences';
import type { CompiledFace, CompiledMarkup, TemplateNode } from './compile';
import { resolveFaceColor, type FacePalette } from './palette';
import type { FaceProblem } from './problems';
import type { TextTemplate } from './slots';
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
/** The most texts one face's check looks at, so that conditions within conditions stay cheap. */
const MAX_CHECKS = 4_000;

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
  let checks = 0;
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
    checks += 1;
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
    nodes: readonly TemplateNode[],
    parent: FaceStyle,
    back: FaceColor,
    ancestors: readonly Matched[],
    markup: CompiledMarkup,
  ): void => {
    for (const node of nodes) {
      if (checks > MAX_CHECKS) return;
      switch (node.kind) {
        case 'text':
          if (node.template.some((part) => typeof part !== 'string' || part.trim() !== '')) {
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
  }
  return problems;
}

/** The sets of classes an element is checked with: its literal ones, and each a slot could add. */
function classChoices(templates: readonly TextTemplate[], known: ReadonlySet<string>): string[][] {
  const literal: string[] = [];
  const patterns: RegExp[] = [];
  for (const template of templates) {
    if (template.every((part) => typeof part === 'string')) {
      literal.push(template.join(''));
      continue;
    }
    const source = template
      .map((part) =>
        typeof part === 'string' ? part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '[a-z0-9-]*',
      )
      .join('');
    patterns.push(new RegExp(`^${source}$`));
  }
  const choices = [literal];
  for (const name of known) {
    if (choices.length > MAX_CLASS_CHOICES) break;
    if (!literal.includes(name) && patterns.some((pattern) => pattern.test(name)))
      choices.push([...literal, name]);
  }
  return choices;
}
