/**
 * The Mermaid reader (ADR-0042, R34): a reader of our own for the subsets Visual Anything reads,
 * flowcharts and C4, ER and class diagrams; Mermaid's own package is not used. It reads the text
 * only: directives, styles, links and callbacks are reported and never followed, and labels, which
 * Mermaid lets hold HTML, become plain text. Each diagram becomes one view that shows what it holds.
 */
import type { ImportPlan, PlannedView } from './plan';
import { PastLimits, PlanBuilder } from './builder';
import { readC4, readClassDiagram, readErDiagram } from './mermaid-diagrams';
import { readFlowchart } from './mermaid-flowchart';
import {
  baseName,
  hasExtension,
  own,
  usesOf,
  type ReadOptions,
  type ImportInput,
  type ImportReader,
  type ReadResult,
} from './reader';
import { MAX_IMPORT_TEXT, labelText } from './text';

/** A line of the diagram, without its comment, and where it was in the file, counted from 1. */
export interface MermaidLine {
  text: string;
  line: number;
}

/** What each kind of diagram reader is given, and gives back. */
export type DiagramReader = (
  lines: readonly MermaidLine[],
  builder: () => PlanBuilder,
  /** What the project uses, so that suggestions name only that, when the reader is told. */
  options: { uses?: (id: string) => boolean },
) => { builder: PlanBuilder; title?: string } | { problems: string[] };

/** The diagrams Visual Anything reads, by the keyword that starts them. */
const READ: Readonly<Record<string, { format: string; read: DiagramReader }>> = {
  graph: { format: 'mermaid-flowchart', read: readFlowchart },
  flowchart: { format: 'mermaid-flowchart', read: readFlowchart },
  'flowchart-elk': { format: 'mermaid-flowchart', read: readFlowchart },
  C4Context: { format: 'mermaid-c4', read: readC4 },
  C4Container: { format: 'mermaid-c4', read: readC4 },
  C4Component: { format: 'mermaid-c4', read: readC4 },
  C4Dynamic: { format: 'mermaid-c4', read: readC4 },
  C4Deployment: { format: 'mermaid-c4', read: readC4 },
  erDiagram: { format: 'mermaid-er', read: readErDiagram },
  classDiagram: { format: 'mermaid-class', read: readClassDiagram },
  'classDiagram-v2': { format: 'mermaid-class', read: readClassDiagram },
};

/** Mermaid's other diagrams, which are recognized and refused with what is read instead. */
const NOT_READ = new Set([
  'sequenceDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'gantt',
  'pie',
  'journey',
  'gitGraph',
  'mindmap',
  'timeline',
  'quadrantChart',
  'requirementDiagram',
  'sankey-beta',
  'sankey',
  'xychart-beta',
  'xychart',
  'block-beta',
  'block',
  'packet-beta',
  'packet',
  'kanban',
  'architecture-beta',
  'architecture',
  'radar-beta',
  'treemap-beta',
  'zenuml',
]);

/** The Mermaid reader, as the import dialog, the command line and Claude's tools list it. */
export const MERMAID: ImportReader = {
  format: 'mermaid',
  name: 'Mermaid',
  extensions: ['.mmd', '.mermaid'],
  recognizes: (input) =>
    hasExtension(input.name, MERMAID.extensions) || diagramKeyword(input.text) !== undefined,
  read: (input, options) => readMermaid(input, options),
};

/** Reads a Mermaid diagram into a plan, or says why it cannot. */
export function readMermaid(input: ImportInput, options: ReadOptions = {}): ReadResult {
  if (input.text.length > MAX_IMPORT_TEXT) {
    return {
      ok: false,
      problems: ['The file is larger than 32 MiB; an import reads at most 32 MiB.'],
    };
  }
  const prepared = prepare(input.text);
  if ('problems' in prepared) return { ok: false, problems: prepared.problems };
  const { keyword, lines, title, directives } = prepared;
  if (keyword === undefined) return { ok: false, problems: ['The text holds no Mermaid diagram.'] };
  const diagram = own(READ, keyword);
  if (diagram === undefined) {
    return {
      ok: false,
      problems: [
        NOT_READ.has(keyword)
          ? `"${keyword}" diagrams are not read: Visual Anything reads Mermaid flowcharts, and C4, ER and class diagrams.`
          : 'The text holds no Mermaid diagram.',
      ],
    };
  }
  let made: ReturnType<DiagramReader>;
  try {
    const uses = usesOf(options);
    made = diagram.read(
      lines,
      () => {
        const builder = new PlanBuilder(diagram.format, input.name);
        for (const directive of directives) builder.report(directive, 'Directives are not read.');
        return builder;
      },
      uses === undefined ? {} : { uses },
    );
  } catch (error) {
    if (error instanceof PastLimits) return { ok: false, problems: [error.message] };
    throw error;
  }
  if ('problems' in made) return { ok: false, problems: made.problems };
  const { builder } = made;
  const name = builder.name(title ?? made.title ?? baseName(input.name), 'Imported diagram');
  const view: PlannedView = {
    key: 'view',
    name,
    shows: builder.elements().map((element) => element.key),
  };
  const plan: ImportPlan = builder.build(builder.elementCount > 0 ? [view] : []);
  return { ok: true, plan };
}

/** The diagram's keyword, lines, front matter title and directives, or why it cannot be read. */
function prepare(
  text: string,
):
  | { keyword?: string; lines: MermaidLine[]; title?: string; directives: string[] }
  | { problems: string[] } {
  const all = (text.startsWith('\uFEFF') ? text.slice(1) : text).split(/\r\n|\r|\n/);
  let at = 0;
  while (at < all.length && (all[at] ?? '').trim() === '') at += 1;
  let title: string | undefined;
  if ((all[at] ?? '').trim() === '---') {
    const start = at;
    at += 1;
    while (at < all.length && (all[at] ?? '').trim() !== '---') {
      const found = /^title\s*:\s*(.*)$/.exec(all[at] ?? '');
      if (found !== null) title = unquote((found[1] ?? '').trim());
      at += 1;
    }
    if (at >= all.length) {
      return { problems: [`The front matter that starts on line ${start + 1} never ends.`] };
    }
    at += 1;
  }
  const directives: string[] = [];
  let keyword: string | undefined;
  const lines: MermaidLine[] = [];
  for (; at < all.length; at++) {
    const raw = all[at] ?? '';
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith('%%{')) {
      directives.push(trimmed);
      continue;
    }
    if (trimmed.startsWith('%%')) continue;
    if (keyword === undefined) {
      const found = /^([A-Za-z][\w-]*)\s*(.*)$/.exec(trimmed);
      keyword = found?.[1] ?? trimmed;
      // A flowchart's direction, or anything else on the keyword's line, such as "graph TD;".
      const rest = (found?.[2] ?? '').replace(/^(TB|TD|BT|RL|LR)\b\s*;?/, '').trim();
      if (rest !== '') lines.push({ text: rest, line: at + 1 });
      continue;
    }
    lines.push({ text: trimmed, line: at + 1 });
  }
  return {
    ...(keyword === undefined ? {} : { keyword }),
    lines,
    ...(title ? { title } : {}),
    directives,
  };
}

/** The keyword a Mermaid text starts with, after front matter and comments, when it is one. */
function diagramKeyword(text: string): string | undefined {
  const head = text.slice(0, 4096);
  const prepared = prepare(head);
  if ('problems' in prepared || prepared.keyword === undefined) return undefined;
  const { keyword } = prepared;
  return Object.hasOwn(READ, keyword) || NOT_READ.has(keyword) ? keyword : undefined;
}

/** A text without the double quotes around it, when it has them. */
export function unquote(text: string): string {
  return text.length >= 2 && text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
}

/**
 * The plain text of a Mermaid label: quotes and Markdown string marks taken off, Mermaid's own entity
 * codes (`#quot;`, `#35;`) read as entities, and then HTML as plain text.
 */
export function mermaidText(label: string): string {
  let text = label.trim();
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) text = text.slice(1, -1);
  if (text.startsWith('`') && text.endsWith('`') && text.length >= 2) {
    text = text.slice(1, -1).replaceAll('**', '');
  }
  text = text.replace(/#([A-Za-z][A-Za-z0-9]{1,31}|[0-9]{1,8});/g, (_whole, code: string) =>
    /^[0-9]/.test(code) ? `&#${code};` : `&${code};`,
  );
  // Font Awesome icons, as `fa:fa-car`, are pictures, which imports leave out.
  text = text.replace(/\bfa[bsrlk]?:fa-[\w-]+/g, ' ');
  return labelText(text);
}

/**
 * Splits a text at a separator that is outside double quotes, as Mermaid's statements at `;` and C4's
 * arguments at `,`.
 */
export function splitOutsideQuotes(text: string, separator: string): string[] {
  const parts: string[] = [];
  let quoted = false;
  let start = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === '"') quoted = !quoted;
    else if (char === separator && !quoted) {
      parts.push(text.slice(start, at));
      start = at + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}
