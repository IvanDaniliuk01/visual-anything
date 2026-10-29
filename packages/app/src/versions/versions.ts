/**
 * The versions Compare with… offers (ADR 0070, ADR 0071): the project as opened, then `HEAD`,
 * branches, remote branches, tags and recent commits as the program listed them, each named as the
 * program gave it. Names, subjects and authors from a repository are shown as text only, and a version
 * is asked for only as the program listed it: the project as opened, or a listed commit by its id.
 */
import type { ListedVersion, VersionRef } from '@visual-anything/core';
import type { SummaryVersion } from '../export/comparison-summary';
import type { Translator } from '../i18n';

/**
 * A version chosen to compare with: the project as opened, a version this tab saw listed, or a commit
 * Claude named from a listing of its own, which this tab knows by its id alone.
 */
export type ChosenVersion =
  | { kind: 'opened' }
  | { kind: 'listed'; version: ListedVersion }
  | { kind: 'named'; commit: string };

/** The project as the program opened it, or last read it from disk. */
export const OPENED: ChosenVersion = { kind: 'opened' };

/** A listed version, chosen. */
export function chosenOf(version: ListedVersion): ChosenVersion {
  return { kind: 'listed', version };
}

/** How the program is asked for a version: as it listed it, and never by a name. */
export function refOf(chosen: ChosenVersion): VersionRef {
  switch (chosen.kind) {
    case 'opened':
      return { kind: 'opened' };
    case 'listed':
      return { kind: 'commit', commit: chosen.version.commit };
    case 'named':
      return { kind: 'commit', commit: chosen.commit };
  }
}

/** How many digits of a commit Claude named are shown, as git's short ids are. */
const SHORT = 7;

/** What a version is called in a sentence, such as “main (a1b2c3d)”. */
export function versionName(t: Translator, chosen: ChosenVersion): string {
  switch (chosen.kind) {
    case 'opened':
      return t('the project as opened');
    case 'named':
      return t('commit {short}', { short: chosen.commit.slice(0, SHORT) });
    case 'listed': {
      const { version } = chosen;
      if (version.kind === 'commit' || version.name === undefined) {
        return version.kind === 'head'
          ? t('HEAD ({short})', { short: version.short })
          : t('commit {short}', { short: version.short });
      }
      return t('{name} ({short})', { name: version.name, short: version.short });
    }
  }
}

/** What the comparison of a version is called on the canvas and in its exports. */
export function versionTitle(t: Translator, chosen: ChosenVersion): string {
  return t('Compared with {version}', { version: versionName(t, chosen) });
}

/** A version as the Markdown summary names it: by its branch or tag, its commit and its date. */
export function summaryVersionOf(t: Translator, chosen: ChosenVersion): SummaryVersion {
  switch (chosen.kind) {
    case 'opened':
      return { name: t('The project as opened') };
    case 'named':
      return { commit: chosen.commit };
    case 'listed': {
      const { version } = chosen;
      const name = version.kind === 'head' ? 'HEAD' : version.name;
      return {
        ...(name === undefined || version.kind === 'commit' ? {} : { name }),
        commit: version.commit,
        date: version.time,
      };
    }
  }
}

/** The order of the kinds in the list, and what each is called beside a version. */
const KINDS: readonly (ListedVersion['kind'] | 'opened')[] = [
  'opened',
  'head',
  'branch',
  'remote',
  'tag',
  'commit',
];

/** What a kind of version is called beside it in the list. */
export function kindName(t: Translator, kind: ListedVersion['kind'] | 'opened'): string {
  switch (kind) {
    case 'opened':
      return t('As opened');
    case 'head':
      return t('HEAD');
    case 'branch':
      return t('Branch');
    case 'remote':
      return t('Remote branch');
    case 'tag':
      return t('Tag');
    case 'commit':
      return t('Commit');
  }
}

/** The most versions of one kind the list shows at once; typing finds the others. */
export const MOST_OF_A_KIND = 50;

/** One version in the list. */
export interface VersionOption {
  /** Unique in the list: its kind, its commit and its name. */
  key: string;
  chosen: ChosenVersion;
  kind: ListedVersion['kind'] | 'opened';
}

/**
 * The versions to choose from, in the list's order, that hold what is typed, whatever the case, in
 * their kind, name, short id, commit, subject or author; and how many more hold it than the list
 * shows.
 */
export function versionOptions(
  t: Translator,
  versions: readonly ListedVersion[],
  typed: string,
): { options: VersionOption[]; more: number } {
  const wanted = typed.trim().toLowerCase();
  const holds = (...texts: readonly string[]) =>
    wanted === '' || texts.some((text) => text.toLowerCase().includes(wanted));
  const options: VersionOption[] = [];
  let more = 0;
  if (holds(kindName(t, 'opened'), t('The project as opened'))) {
    options.push({ key: 'opened', chosen: OPENED, kind: 'opened' });
  }
  for (const kind of KINDS) {
    if (kind === 'opened') continue;
    let shown = 0;
    for (const version of versions) {
      if (version.kind !== kind) continue;
      const found = holds(
        kindName(t, kind),
        version.name ?? '',
        version.short,
        version.commit,
        version.subject,
        version.author,
      );
      if (!found) continue;
      if (shown === MOST_OF_A_KIND) {
        more += 1;
        continue;
      }
      shown += 1;
      options.push({
        key: `${kind}:${version.commit}:${version.name ?? ''}`,
        chosen: chosenOf(version),
        kind,
      });
    }
  }
  return { options, more };
}
