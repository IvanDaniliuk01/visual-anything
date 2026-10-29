/**
 * How a comparison's changes read (ADR 0070): what each is about, by its kind and its name in either
 * version, and what differs, path by path, with the values before and after. The Changes tab, the
 * canvas's announcements and the Markdown summary all word them so.
 *
 * Names are what people wrote and are never translated; everything else is in the language the app
 * reads in.
 */
import {
  type Change,
  type ChangeStatus,
  type Comparison,
  type ItemRef,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, JsonValue } from '@visual-anything/schema';
import type { Translator } from '../../i18n';

/** The kinds of item a comparison groups its changes by, in the order it lists them. */
export type ChangeKind = ItemRef['kind'];

/** What a group of changes of one kind is called. */
export function kindHeading(t: Translator, kind: ChangeKind): string {
  switch (kind) {
    case 'project':
      return t('The project');
    case 'world':
      return t('World');
    case 'order':
      return t('The order of elements');
    case 'element':
      return t('Elements');
    case 'relation':
      return t('Relations');
    case 'package':
      return t('Packages');
    case 'component':
      return t('Components');
    case 'relation-type':
      return t('Relation types');
    case 'image':
      return t('Images');
    case 'view':
      return t('Views');
    case 'position':
      return t('Shapes’ places');
    case 'free-shape':
      return t('Free shapes');
    case 'stacking':
      return t('Stacking orders');
    case 'route':
      return t('Routes');
    case 'scenario':
      return t('Scenarios');
    case 'step':
      return t('Steps');
    case 'tour':
      return t('Tours');
    case 'tour-step':
      return t('Tour steps');
    case 'thread':
      return t('Threads');
    case 'comment':
      return t('Comments');
  }
}

/** What a state is called, in a heading, a filter and the legend. */
export function statusName(t: Translator, status: ChangeStatus): string {
  switch (status) {
    case 'added':
      return t('Added');
    case 'removed':
      return t('Removed');
    case 'changed':
      return t('Changed');
    case 'moved':
      return t('Moved');
  }
}

/** The glyph each state is drawn with, on the canvas, in the list and in exports. */
export const STATUS_GLYPHS: Readonly<Record<ChangeStatus, string>> = {
  added: '+',
  removed: '−',
  changed: '~',
  moved: '→',
};

/** How many changes of one state: “3 added”. */
export function countText(t: Translator, status: ChangeStatus, count: number): string {
  switch (status) {
    case 'added':
      return t({ one: '{count} added', other: '{count} added' }, { count });
    case 'removed':
      return t({ one: '{count} removed', other: '{count} removed' }, { count });
    case 'changed':
      return t({ one: '{count} changed', other: '{count} changed' }, { count });
    case 'moved':
      return t({ one: '{count} moved', other: '{count} moved' }, { count });
  }
}

/** How many changes of each state, as a line of counts: “3 added, 1 removed, …”. */
export function countsText(t: Translator, counts: Record<ChangeStatus, number>): string {
  return (['added', 'removed', 'changed', 'moved'] as const)
    .map((status) => countText(t, status, counts[status]))
    .join(', ');
}

/** Reads the names of what changes mention, in either version. */
export class ChangeNames {
  constructor(
    private readonly older: ProjectSnapshot,
    private readonly newer: ProjectSnapshot,
    private readonly comparison: Pick<Comparison, 'names'>,
  ) {}

  /** The name of what an id names, in the newer version or else the older, or the id itself. */
  of(id: Id): string {
    const named = Object.hasOwn(this.comparison.names, id) ? this.comparison.names[id] : undefined;
    return named?.after ?? named?.before ?? this.lookUp(id) ?? id;
  }

  /** Its name before and after, when it was renamed. */
  renamed(id: Id): { before: string; after: string } | undefined {
    const named = Object.hasOwn(this.comparison.names, id) ? this.comparison.names[id] : undefined;
    return named?.before !== undefined &&
      named.after !== undefined &&
      named.before !== named.after
      ? { before: named.before, after: named.after }
      : undefined;
  }

  /** A relation's ends, from the version that holds it. */
  endsOf(id: Id): { from: Id; to: Id } | undefined {
    this.ends ??= new Map(
      [...this.older.model.relations, ...this.newer.model.relations].map((relation) => [
        relation.id,
        { from: relation.from, to: relation.to },
      ]),
    );
    return this.ends.get(id);
  }

  private ends: Map<Id, { from: Id; to: Id }> | undefined;
  private known: Map<Id, string> | undefined;

  /** A view's name in either version. */
  view(id: Id): string {
    const found =
      this.newer.views.find((each) => each.id === id) ??
      this.older.views.find((each) => each.id === id);
    return found?.name ?? this.of(id);
  }

  private lookUp(id: Id): string | undefined {
    if (!this.known) {
      // The older version first, so that the newer one's names win.
      const known = new Map<Id, string>();
      for (const version of [this.older, this.newer]) {
        known.set(version.model.world.id, version.model.world.name);
        for (const element of version.model.elements) known.set(element.id, element.name);
        for (const relation of version.model.relations) {
          if (relation.name !== undefined) known.set(relation.id, relation.name);
        }
        for (const view of version.views) known.set(view.id, view.name);
        for (const each of [...version.scenarios, ...version.tours]) known.set(each.id, each.name);
        for (const file of version.packages) {
          known.set(file.id, file.name);
          for (const each of [...file.components, ...file.relationTypes]) {
            known.set(each.id, each.name);
          }
        }
      }
      this.known = known;
    }
    return this.known.get(id);
  }
}

/** What a change is about, in a few words: “Billing API”, “Patient to WhatsApp channel”. */
export function changeTitle(t: Translator, change: Change, names: ChangeNames): string {
  const { ref } = change;
  switch (ref.kind) {
    case 'project':
      return t('The project');
    case 'world':
      return t('World');
    case 'order':
      return t('The order of elements');
    case 'element':
      return names.of(ref.id);
    case 'relation':
      return relationTitle(t, ref.id, names);
    case 'package':
      return names.of(ref.package);
    case 'component':
    case 'relation-type':
    case 'image':
      return names.of(ref.id);
    case 'view':
      return names.view(ref.view);
    case 'position':
      return t('{element} in “{view}”', { element: names.of(ref.element), view: names.view(ref.view) });
    case 'free-shape':
      return t('A free shape in “{view}”', { view: names.view(ref.view) });
    case 'stacking':
      return t('What sits in {container}, in “{view}”', {
        container: names.of(ref.container),
        view: names.view(ref.view),
      });
    case 'route':
      return t('The route of {relation}, in “{view}”', {
        relation: relationTitle(t, ref.relation, names),
        view: names.view(ref.view),
      });
    case 'scenario':
    case 'tour':
    case 'thread':
      return names.of(ref.id);
    case 'step':
    case 'tour-step':
    case 'comment':
      return names.of(ref.id);
  }
}

/** A relation by its name, or by its ends when it has none. */
function relationTitle(t: Translator, id: Id, names: ChangeNames): string {
  const named = names.of(id);
  if (named !== id) return named;
  const ends = names.endsOf(id);
  return ends ? t('{from} to {to}', { from: names.of(ends.from), to: names.of(ends.to) }) : id;
}

/** The longest a value is written in a list, in characters, before it is cut. */
const LONGEST_VALUE = 60;

/** A value as a change writes it: text in quotes, numbers and the rest as JSON, cut when long. */
export function valueText(t: Translator, value: JsonValue | undefined): string {
  if (value === undefined) return t('none');
  const text = typeof value === 'string' ? `“${value}”` : JSON.stringify(value);
  return text.length > LONGEST_VALUE ? `${text.slice(0, LONGEST_VALUE - 1)}…` : text;
}

/** What a difference's path is called: its words for the common ones, and the path as it is. */
export function pathText(t: Translator, path: string, names: ChangeNames): string {
  const [first = '', ...rest] = path.split('.');
  const tail = rest.join('.');
  switch (first) {
    case 'name':
      return t('Name');
    case 'description':
      return t('Description');
    case 'component':
      return t('Component');
    case 'relationType':
      return t('Relation type');
    case 'from':
      return t('From');
    case 'to':
      return t('To');
    case 'x':
    case 'y':
    case 'width':
    case 'height':
      return first;
    case 'container':
      return t('Container');
    case 'pinned':
      return t('Pinned');
    case 'attributes':
      return tail === '' ? t('Attributes') : t('Attribute “{name}”', { name: tail });
    case 'appearance':
      return tail === '' ? t('Appearance') : t('Appearance: {trait}', { trait: tail });
    case 'steps':
      return tail === '' ? t('Steps') : t('Step “{name}”', { name: names.of(tail) });
    case 'comments':
      return tail === '' ? t('Comments') : t('A comment');
    default:
      return path;
  }
}

/** One difference as a line: “Name: “A” → “B””. */
export function differenceText(
  t: Translator,
  difference: Change['differences'][number],
  names: ChangeNames,
): string {
  return t('{what}: {before} → {after}', {
    what: pathText(t, difference.path, names),
    before: valueText(t, difference.before),
    after: valueText(t, difference.after),
  });
}

/** What differs in a change, in one line: its first differences, and how many more there are. */
export function differencesText(
  t: Translator,
  change: Change,
  names: ChangeNames,
  most = 2,
): string {
  const { differences } = change;
  if (differences.length === 0) return '';
  const shown = differences.slice(0, most).map((each) => differenceText(t, each, names));
  const more = differences.length - shown.length;
  if (more > 0) shown.push(t({ one: 'and {count} more', other: 'and {count} more' }, { count: more }));
  return shown.join('; ');
}

/** A change as one sentence, as screen readers hear it: its state, what it is, and what differs. */
export function changeSentence(t: Translator, change: Change, names: ChangeNames): string {
  const what = changeTitle(t, change, names);
  const differs = differencesText(t, change, names, 3);
  const said = t('{status}: {what}.', { status: statusName(t, change.status), what });
  return differs === '' ? said : `${said} ${differs}.`;
}

/** The changes grouped by kind, in the order a comparison lists the kinds. */
export function changesByKind(changes: readonly Change[]): [ChangeKind, Change[]][] {
  const groups = new Map<ChangeKind, Change[]>();
  for (const change of changes) {
    const list = groups.get(change.ref.kind);
    if (list) list.push(change);
    else groups.set(change.ref.kind, [change]);
  }
  return [...groups];
}
