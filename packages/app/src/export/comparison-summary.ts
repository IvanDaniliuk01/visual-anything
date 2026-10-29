/**
 * A comparison's summary in Markdown (ADR 0070), for a pull request: the two versions by commit,
 * branch and date, the counts, then each change with what differs, grouped by view and by kind, with
 * links to the drawings when they are written.
 *
 * - **Every text taken from the project is escaped** so that it reads as text: a name can make no
 *   link, image, heading or HTML where the file is read. Beyond what `markdownInline` escapes, what
 *   GitHub would make a link of by itself, `www.`, `://` and an address with `@`, is broken by an
 *   invisible word joiner (U+2060), since an escape does not stop GitHub's own links.
 * - **It lists at most 1,000 changes,** then says how many more there are.
 * - Each change is listed once: under its own view for what belongs to one, such as a shape's place;
 *   else under the first view that draws it, in either version; else under the rest of the project.
 *
 * It is written in the language the app reads in; the command line writes it in English.
 */
import {
  compareView,
  itemKey,
  type Change,
  type Comparison,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { t as appT, type Translator } from '../i18n';
import {
  ChangeNames,
  STATUS_GLYPHS,
  changeTitle,
  changesByKind,
  countsText,
  differenceText,
  kindHeading,
  statusName,
} from '../versions/changes/describe';
import { markdownInline } from './markdown';

/** The most changes a summary lists. */
export const MOST_SUMMARY_CHANGES = 1000;

/** A version as the summary names it: by its branch or tag, its commit and its date. */
export interface SummaryVersion {
  /** A branch's or tag's name, or how the version is known, such as “the files on disk”. */
  name?: string;
  /** Its commit's id, of which the summary writes the first 12 digits. */
  commit?: string;
  /** When it was made, in milliseconds since 1970 or as a date. */
  date?: number | Date;
}

/** The drawings written beside the summary for one view: a path or an address for each. */
export interface SummaryDrawings {
  before?: string;
  after?: string;
  comparison?: string;
}

export interface SummaryOptions {
  /** The two versions, as the summary names them. */
  versions?: { older?: SummaryVersion; newer?: SummaryVersion };
  /** The drawings written beside it, by view id. */
  drawings?: Readonly<Record<Id, SummaryDrawings>>;
  /** The most changes it lists; 1,000 by default. */
  most?: number;
  /** The language it is written in; the app's by default. */
  t?: Translator;
}

/** Writes the Markdown summary of a comparison of `older` with `newer`. */
export function writeComparisonSummary(
  older: ProjectSnapshot,
  newer: ProjectSnapshot,
  comparison: Comparison,
  options: SummaryOptions = {},
): string {
  const t = options.t ?? appT;
  const most = Math.max(0, options.most ?? MOST_SUMMARY_CHANGES);
  const names = new ChangeNames(older, newer, comparison);
  const lines: string[] = [];
  lines.push(
    `# ${t('Changes to {project}', { project: text(newer.project.name || older.project.name) })}`,
    '',
  );
  const { older: was, newer: is } = options.versions ?? {};
  lines.push(`- ${t('Older version: {version}', { version: versionText(t, was) })}`);
  lines.push(`- ${t('Newer version: {version}', { version: versionText(t, is) })}`);
  lines.push(`- ${t('Counts: {counts}', { counts: countsText(t, comparison.counts) })}`);
  lines.push('');
  if (comparison.changes.length === 0) {
    lines.push(t('No changes.'), '');
    return lines.join('\n');
  }

  const groups = groupedByView(comparison, older, newer);
  let listed = 0;
  for (const group of groups) {
    const drawings = group.view === undefined ? undefined : options.drawings?.[group.view];
    // Past the most it lists, a view still links its drawings.
    if (listed >= most && !drawings) continue;
    lines.push(
      `## ${
        group.view === undefined
          ? t('The rest of the project')
          : t('View “{view}”', { view: text(names.view(group.view)) })
      }`,
      '',
    );
    if (drawings) {
      const links = (
        [
          ['before', t('Before')],
          ['after', t('After')],
          ['comparison', t('Comparison')],
        ] as const
      )
        .filter(([drawing]) => drawings[drawing] !== undefined)
        .map(([drawing, label]) => `[${text(label)}](${linkTarget(drawings[drawing] as string)})`);
      if (links.length > 0) lines.push(`${t('Drawings')}: ${links.join(' · ')}`, '');
    }
    for (const [kind, changes] of changesByKind(group.changes)) {
      if (listed >= most) break;
      lines.push(`### ${kindHeading(t, kind)}`, '');
      for (const change of changes) {
        if (listed >= most) break;
        lines.push(changeLine(t, change, names));
        listed += 1;
      }
      lines.push('');
    }
  }
  const more = comparison.changes.length - listed;
  if (more > 0) {
    lines.push(
      t(
        {
          one: 'And {count} more change, which this summary does not list.',
          other: 'And {count} more changes, which this summary does not list.',
        },
        { count: more },
      ),
      '',
    );
  }
  return lines.join('\n');
}

/** A change as a line of the list: its glyph, its state, what it is, and each difference. */
function changeLine(t: Translator, change: Change, names: ChangeNames): string {
  const head = `- ${markdownInline(STATUS_GLYPHS[change.status])} **${statusName(t, change.status)}** ${text(
    changeTitle(t, change, names),
  )}`;
  const differs = change.differences.map(
    (difference) => `  - ${text(differenceText(t, difference, names))}`,
  );
  return [head, ...differs].join('\n');
}

/** The changes by the view they are listed under, the views in the newer version's order first. */
function groupedByView(
  comparison: Comparison,
  older: ProjectSnapshot,
  newer: ProjectSnapshot,
): { view: Id | undefined; changes: Change[] }[] {
  const views = [
    ...newer.views.map((view) => view.id),
    ...older.views
      .map((view) => view.id)
      .filter((id) => !newer.views.some((view) => view.id === id)),
  ];
  const byView = new Map<Id | undefined, Change[]>();
  const add = (view: Id | undefined, change: Change) => {
    const list = byView.get(view);
    if (list) list.push(change);
    else byView.set(view, [change]);
  };
  // What each view draws, worked out only when a change asks it.
  const drawn = new Map<Id, ReadonlySet<string>>();
  const drawnIn = (view: Id) => {
    let keys = drawn.get(view);
    if (!keys) {
      keys = new Set(compareView(comparison, older, newer, view).states.keys());
      drawn.set(view, keys);
    }
    return keys;
  };
  for (const change of comparison.changes) {
    const { ref } = change;
    if ('view' in ref) {
      add(ref.view, change);
    } else if (ref.kind === 'element' || ref.kind === 'relation') {
      const key = itemKey(ref);
      add(
        views.find((view) => drawnIn(view).has(key)),
        change,
      );
    } else {
      add(undefined, change);
    }
  }
  return [...views, undefined]
    .filter((view) => byView.has(view))
    .map((view) => ({ view, changes: byView.get(view) ?? [] }));
}

/** A version as one line: its name, its commit and its date, whichever it has. */
function versionText(t: Translator, version: SummaryVersion | undefined): string {
  if (!version) return t('unnamed');
  const parts: string[] = [];
  if (version.name !== undefined && version.name !== '') parts.push(text(version.name));
  if (version.commit !== undefined && /^[0-9a-f]{4,64}$/i.test(version.commit)) {
    parts.push(`\`${version.commit.slice(0, 12)}\``);
  }
  if (version.date !== undefined) {
    const date = new Date(version.date);
    if (!Number.isNaN(date.getTime())) parts.push(date.toISOString().slice(0, 10));
  }
  return parts.length > 0 ? parts.join(' · ') : t('unnamed');
}

/**
 * A text from the project as Markdown reads it as text: escaped, and with what GitHub links by
 * itself broken by an invisible word joiner.
 */
export function text(value: string): string {
  return markdownInline(
    value
      .replace(/(w)(ww\.)/gi, '$1⁠$2')
      .replace(/:\/\//g, ':⁠//')
      .replace(/(\S)@(?=\S)/g, '$1⁠@'),
  );
}

/** A drawing's path or address as a link's target: in angle brackets, with nothing that ends it. */
function linkTarget(target: string): string {
  return `<${target.replace(/[<>\s\\]/g, (character) => encodeURIComponent(character))}>`;
}
