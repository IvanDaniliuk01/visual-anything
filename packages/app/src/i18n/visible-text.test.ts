/**
 * Every component file writes no visible text of its own: every word goes through `t()` or `useT()`
 * (ADR-0038). This finds words written as JSX text, or as a literal in an attribute people read or
 * hear, directly or as a branch of a condition, in every component file of the app, and words written
 * into the page by hand, as `textContent` or `aria-label`, in every file.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SOURCE = resolve(import.meta.dirname, '..');

/**
 * The folders whose files the person never sees: the test harnesses, and the benchmark's own page,
 * which reports to whoever measures the app.
 */
const NOT_SHOWN = ['test/', 'bench/'];

/** The app's source files, but tests and what the person never sees, relative to `src`. */
function sourceFiles(pattern: RegExp): string[] {
  const found: string[] = [];
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (pattern.test(name) && !/\.test\.tsx?$/.test(name)) {
        found.push(relative(SOURCE, path).replaceAll('\\', '/'));
      }
    }
  };
  walk(SOURCE);
  return found.filter((path) => !NOT_SHOWN.some((folder) => path.startsWith(folder))).sort();
}

/** Every component file of the app. */
const COMPONENTS = sourceFiles(/\.tsx$/);

/** The attributes whose text people read or hear. */
const READ_ATTRIBUTES = new Set([
  'title',
  'aria-label',
  'aria-roledescription',
  'aria-valuetext',
  'placeholder',
  'alt',
  'label',
]);

/** The properties and attributes of the page's elements whose text people read or hear. */
const READ_PROPERTIES = new Set([
  'textContent',
  'innerText',
  'title',
  'ariaLabel',
  'placeholder',
  'alt',
  ...READ_ATTRIBUTES,
]);

/** Names that read the same in every language. */
const PROPER_NAMES = new Set(['Claude', 'Visual Anything']);

const isWords = (words: string) => /\p{L}/u.test(words) && !PROPER_NAMES.has(words.trim());

/**
 * The literals an expression gives as its value: itself, or the branches of a condition and the
 * operands of `??`, `||` and `&&` that give it. A literal given to a call, such as `t('Undo')`, is
 * the call's, not the expression's.
 */
function literalsOf(expression: ts.Expression): ts.Expression[] {
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression) ||
    ts.isTemplateExpression(expression)
  ) {
    return [expression];
  }
  if (ts.isParenthesizedExpression(expression)) return literalsOf(expression.expression);
  if (ts.isConditionalExpression(expression)) {
    return [...literalsOf(expression.whenTrue), ...literalsOf(expression.whenFalse)];
  }
  if (
    ts.isBinaryExpression(expression) &&
    [
      ts.SyntaxKind.QuestionQuestionToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.AmpersandAmpersandToken,
    ].includes(expression.operatorToken.kind)
  ) {
    return [...literalsOf(expression.left), ...literalsOf(expression.right)];
  }
  return [];
}

/** The words of a literal: its text, without what a template writes in. */
function wordsOf(literal: ts.Expression): string {
  if (ts.isTemplateExpression(literal)) {
    return [literal.head.text, ...literal.templateSpans.map((span) => span.literal.text)].join(' ');
  }
  return ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal)
    ? literal.text
    : '';
}

/** The visible texts a file writes outside `t()`, with their lines. */
function untranslatedIn(path: string, text = readFileSync(join(SOURCE, path), 'utf8')): string[] {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const report = (node: ts.Node, words: string) => {
    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    found.push(`${path}:${line}: ${words}`);
  };
  const reportLiterals = (expression: ts.Expression) => {
    for (const literal of literalsOf(expression)) {
      if (isWords(wordsOf(literal))) report(literal, literal.getText(file));
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const words = node.text.trim();
      if (isWords(words)) report(node, words);
    } else if (
      ts.isJsxExpression(node) &&
      node.expression !== undefined &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      // A child written as an expression, such as {busy ? 'Saving…' : label}.
      reportLiterals(node.expression);
    } else if (
      ts.isJsxAttribute(node) &&
      READ_ATTRIBUTES.has(node.name.getText(file)) &&
      node.initializer !== undefined
    ) {
      const value = node.initializer;
      if (ts.isStringLiteral(value)) {
        if (isWords(value.text)) report(node, value.getText(file));
      } else if (ts.isJsxExpression(value) && value.expression !== undefined) {
        reportLiterals(value.expression);
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      READ_PROPERTIES.has(node.left.name.text)
    ) {
      // Text written into the page by hand: element.textContent = 'Saved'.
      reportLiterals(node.right);
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'setAttribute'
    ) {
      const [name, value] = node.arguments;
      if (
        name !== undefined &&
        value !== undefined &&
        ts.isStringLiteral(name) &&
        READ_ATTRIBUTES.has(name.text)
      ) {
        reportLiterals(value);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('the app’s files', () => {
  it('include every component file but tests and what the person never sees', () => {
    expect(COMPONENTS).toContain('App.tsx');
    expect(COMPONENTS).toContain('canvas/CanvasArea.tsx');
    expect(COMPONENTS).toContain('shell/definitions/ComponentEditor.tsx');
    expect(COMPONENTS.some((path) => path.startsWith('test/') || path.startsWith('bench/'))).toBe(
      false,
    );
  });

  // This and the next read every source file of the app, which takes seconds on a busy machine.
  it('write no visible text outside t()', { timeout: 30_000 }, () => {
    expect(COMPONENTS.flatMap((path) => untranslatedIn(path))).toEqual([]);
  });

  it('write no text into the page by hand outside t()', { timeout: 30_000 }, () => {
    expect(sourceFiles(/\.ts$/).flatMap((path) => untranslatedIn(path))).toEqual([]);
  });

  it('would be caught writing one', () => {
    expect(
      untranslatedIn(
        'example.tsx',
        [
          'const a = <p title="Hello" aria-label={`Hi ${name}`}>Some words {t("Fine")} →</p>;',
          'const b = <p placeholder={busy ? "Saving…" : t("Saved")}>{open && "Open"}{name ?? "None"}</p>;',
          "host.textContent = 'Ready';",
          "host.setAttribute('aria-label', done ? t('Done') : 'Waiting');",
        ].join('\n'),
      ),
    ).toEqual([
      'example.tsx:1: "Hello"',
      'example.tsx:1: `Hi ${name}`',
      'example.tsx:1: Some words',
      'example.tsx:2: "Saving…"',
      'example.tsx:2: "Open"',
      'example.tsx:2: "None"',
      "example.tsx:3: 'Ready'",
      "example.tsx:4: 'Waiting'",
    ]);
  });
});
