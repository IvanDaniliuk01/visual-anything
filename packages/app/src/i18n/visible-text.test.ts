/**
 * Once a component's file has moved to the catalog, it writes no visible text of its own: every word
 * goes through `t()` or `useT()` (ADR-0038). This finds words written as JSX text, or as a literal in
 * an attribute people read or hear, in the files that have moved.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SOURCE = resolve(import.meta.dirname, '..');

/** The component files that have moved to the catalog. */
const TRANSLATED = [
  'App.tsx',
  'shell/Header.tsx',
  'shell/Notices.tsx',
  'shell/Outline.tsx',
  'shell/ModelTab.tsx',
  'shell/ModelPanel.tsx',
  'history/HistoryPanel.tsx',
  'export/ExportControl.tsx',
  'shell/ViewList.tsx',
  'shell/VirtualTree.tsx',
  'shell/Shell.tsx',
  'shell/StatusScreen.tsx',
  'shell/ProjectErrorBoundary.tsx',
  'theme/ThemeControl.tsx',
  'i18n/LanguageControl.tsx',
  'scenarios/ScenarioPanel.tsx',
  'scenarios/StepDetails.tsx',
  'scenarios/RecordingCue.tsx',
  'scenarios/PlaybackEmphasis.tsx',
  'guidance/GuidanceLayer.tsx',
  'canvas/ExploreBar.tsx',
  'canvas/DeleteDialog.tsx',
  'canvas/ContainerChooser.tsx',
  'canvas/RelationMenu.tsx',
  'canvas/InlineEditor.tsx',
  'canvas/KeyboardHelp.tsx',
  'canvas/routing/RouteMenu.tsx',
  'canvas/routing/RouteSection.tsx',
  'shell/inspector/RowsSection.tsx',
  'view-state/CopyAddress.tsx',
  'search/FindBar.tsx',
  'shell/definitions/ImageControl.tsx',
  'shell/definitions/ImagePreview.tsx',
  'shell/definitions/ElementImageTrait.tsx',
];

/** The attributes whose text people read or hear. */
const READ_ATTRIBUTES = new Set(['title', 'aria-label', 'placeholder', 'alt', 'label']);

/** Names that read the same in every language. */
const PROPER_NAMES = new Set(['Claude', 'Visual Anything']);

/** The visible texts a file writes outside `t()`, with their lines. */
function untranslatedIn(path: string, text = readFileSync(join(SOURCE, path), 'utf8')): string[] {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const report = (node: ts.Node, words: string) => {
    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    found.push(`${path}:${line}: ${words}`);
  };
  const isWords = (words: string) => /\p{L}/u.test(words) && !PROPER_NAMES.has(words.trim());
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const words = node.text.trim();
      if (isWords(words)) report(node, words);
    } else if (
      ts.isJsxAttribute(node) &&
      READ_ATTRIBUTES.has(node.name.getText(file)) &&
      node.initializer !== undefined
    ) {
      const value = node.initializer;
      const literal = ts.isStringLiteral(value)
        ? value
        : ts.isJsxExpression(value) &&
            value.expression !== undefined &&
            (ts.isStringLiteral(value.expression) ||
              ts.isNoSubstitutionTemplateLiteral(value.expression) ||
              ts.isTemplateExpression(value.expression))
          ? value.expression
          : undefined;
      if (literal !== undefined && isWords(literal.getText(file).slice(1, -1))) {
        report(node, literal.getText(file));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('the files that have moved to the catalog', () => {
  it('write no visible text outside t()', () => {
    expect(TRANSLATED.flatMap((path) => untranslatedIn(path))).toEqual([]);
  });

  it('would be caught writing one', () => {
    expect(
      untranslatedIn(
        'example.tsx',
        'const a = <p title="Hello" aria-label={`Hi ${name}`}>Some words {t("Fine")} →</p>;',
      ),
    ).toEqual([
      'example.tsx:1: "Hello"',
      'example.tsx:1: `Hi ${name}`',
      'example.tsx:1: Some words',
    ]);
  });
});
