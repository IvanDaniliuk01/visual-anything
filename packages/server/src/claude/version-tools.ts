/**
 * Claude's tools for versions (ADR 0070, ADR 0071): `list_versions` lists the versions of the
 * project's repository that the program can read, `compare_versions` compares one with the project
 * now, its changes 200 at a time, and `show_comparison` shows that comparison in the person's app, as
 * if they had chosen it in Compare with…. A version is named only as the program listed it: the
 * project as opened, or a commit of one of the program's last five listings within ten minutes,
 * whether an app or Claude asked for it (ADR 0071's clarification of 2026-10-29). Nothing here writes
 * to the project, the history or the repository.
 */
import {
  isCommitId,
  itemKey,
  type Change,
  type Comparison,
  type ListedVersion,
  type VersionRef,
} from '@visual-anything/core';
import { z } from 'zod';
import type { Program } from './bridge';
import { GUIDE, ONE_TAB, READ, fail, guideApps, id, ok, sentences, tool } from './kit';
import { idOf } from './proposal-tools';
import type { Tool, ToolOutcome } from './tools';

/** The most changes `compare_versions` answers in one call (ADR 0070). */
export const MAX_CHANGES_PER_CALL = 200;

/** The most versions `list_versions` answers in one call, and how many by default. */
export const MAX_VERSIONS_PER_CALL = 200;
const DEFAULT_VERSIONS = 50;

/** The most differences a change lists, and the longest value it gives whole, as JSON text. */
const MAX_DIFFERENCES = 20;
const MAX_VALUE_TEXT = 1000;

/** The kinds of version a listing holds. */
const VERSION_KINDS = ['head', 'branch', 'remote', 'tag', 'commit'] as const;

/** How a comparison is drawn, as the guidance `comparison` takes it. */
const DRAWINGS = ['before', 'after', 'comparison'] as const;

/** What names a version for these tools: the project as opened, or a commit listed. */
const OPENED = 'opened';

const versionInput = () =>
  z
    .string()
    .min(1)
    .max(64)
    .describe(
      `"${OPENED}" for the project as Visual Anything opened it, or last read it from disk; or a commit's full id, as list_versions gives it in commit.`,
    );

/** The version a tool's input names, or why it names none. */
function versionOf(text: string): { ok: true; version: VersionRef } | { ok: false; why: string } {
  if (text === OPENED) return { ok: true, version: { kind: 'opened' } };
  const commit = text.toLowerCase();
  if (isCommitId(commit)) return { ok: true, version: { kind: 'commit', commit } };
  return {
    ok: false,
    why: `"${text}" names no version: give "${OPENED}", or a commit's full id of 40 or 64 hexadecimal digits as list_versions gives it. Branch and tag names, HEAD and short ids are not taken; list_versions gives their commits.`,
  };
}

/** A version as Claude reads it, its time as an ISO date. */
function listedOf(version: ListedVersion) {
  return {
    kind: version.kind,
    ...(version.name === undefined ? {} : { name: version.name }),
    commit: version.commit,
    short: version.short,
    subject: version.subject,
    author: version.author,
    time: new Date(version.time).toISOString(),
  };
}

/** A value as an answer gives it: whole, or its JSON text cut, when it is long. */
export function briefValue(value: unknown): unknown {
  const text = JSON.stringify(value);
  if (text === undefined || text.length <= MAX_VALUE_TEXT) return value;
  return { cut: `${text.slice(0, MAX_VALUE_TEXT)}…`, length: text.length };
}

/** One change as Claude reads it: its key, status, name, the items it takes and what differs. */
function changeOf(comparison: Comparison, change: Change) {
  const named = idOf(change.ref);
  const names = named === undefined ? undefined : comparison.names[named];
  const name = names?.after ?? names?.before;
  const renamed =
    names?.before !== undefined && names.after !== undefined && names.before !== names.after;
  const differences = change.differences.slice(0, MAX_DIFFERENCES).map((difference) => ({
    path: difference.path,
    ...(difference.before === undefined ? {} : { before: briefValue(difference.before) }),
    ...(difference.after === undefined ? {} : { after: briefValue(difference.after) }),
  }));
  return {
    key: itemKey(change.ref),
    status: change.status,
    ...(name === undefined ? {} : { name }),
    ...(renamed ? { wasNamed: names.before } : {}),
    ...(change.items.length > 1 ? { takes: change.items.slice(1).map(itemKey).slice(0, 20) } : {}),
    ...(change.items.length > 21 ? { takesMore: change.items.length - 21 } : {}),
    ...(differences.length === 0 ? {} : { differences }),
    ...(change.differences.length > MAX_DIFFERENCES
      ? { moreDifferences: change.differences.length - MAX_DIFFERENCES }
      : {}),
  };
}

/** What the answer of a version tool says while Claude's proposal waits, which it leaves out. */
async function proposalLeftOut(program: Program): Promise<Record<string, string>> {
  if (program.proposal === undefined) return {};
  const { open } = await program.proposal();
  return open === undefined
    ? {}
    : {
        proposed: `Compared with the project now, without your proposal "${open.id}": its changes wait for the person's review. read_proposal lists them.`,
      };
}

const NO_VERSIONS = 'This Visual Anything reads no versions.';

const listVersionsTool = tool({
  name: 'list_versions',
  title: 'List versions',
  description: `Lists the versions of the project that compare_versions and show_comparison can name: HEAD, the local branches, the remote-tracking branches and the tags of the project's git repository, each newest first, and the last 200 commits on HEAD that touched the project folder. Each has its kind, its name (a branch's or tag's), its commit, a short id, its subject, its author and its time. Visual Anything only reads the repository; it writes nothing to it.

Besides these, "${OPENED}" always names the project as Visual Anything opened it, or last read it from disk, with no git needed.

A commit can be named while one of Visual Anything's last five listings, made within ten minutes, holds it, whether the person's app or you asked for it: list again before comparing when it is older. When git cannot list any version, why says so, such as a folder outside any repository.

Filter with kind, and page with offset and limit (at most ${MAX_VERSIONS_PER_CALL}, ${DEFAULT_VERSIONS} by default).

Example: {}
Example: {"kind": "branch"}
Example: {"kind": "commit", "offset": 50, "limit": 50}`,
  input: {
    kind: z
      .enum(VERSION_KINDS)
      .optional()
      .describe('Only versions of this kind: head, branch, remote, tag or commit.'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('How many versions to skip, for the next page; 0 by default.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_VERSIONS_PER_CALL)
      .optional()
      .describe(`How many versions to answer; ${DEFAULT_VERSIONS} by default.`),
  },
  hints: READ,
  run: async ({ kind, offset = 0, limit = DEFAULT_VERSIONS }, program) => {
    if (program.listVersions === undefined) return fail(NO_VERSIONS);
    const listing = await program.listVersions();
    const matching = listing.versions.filter((each) => kind === undefined || each.kind === kind);
    const page = matching.slice(offset, offset + limit);
    const next = offset + page.length;
    return ok({
      opened: `"${OPENED}" names the project as Visual Anything opened it, or last read it from disk.`,
      total: matching.length,
      versions: page.map(listedOf),
      ...(next < matching.length ? { next } : {}),
      ...(listing.why === undefined ? {} : { why: listing.why }),
      note: 'Name a version to compare_versions or show_comparison by its commit, as given here, or by "opened". It can be named for ten minutes, while it stays in one of the last five listings.',
    });
  },
});

const compareVersionsTool = tool({
  name: 'compare_versions',
  title: 'Compare a version with the project now',
  description: `Compares a version, the older, with the project now, the newer, by id (ADR 0070), and answers what was added, removed, changed and moved: the counts, then the changes, at most ${MAX_CHANGES_PER_CALL} a call from offset. It changes nothing, and shows nothing to the person: show_comparison does.

Name the version as list_versions gives it: a commit's full id, or "${OPENED}" for the project as Visual Anything opened it. With view, it keeps to what that view draws in either version and to the view's own changes.

Each change has:
- key: the item it is about, such as "element:<id>", "relation:<id>", "view:<id>" or "position:<view>:<element> in <container>";
- status: added, removed, changed or moved;
- name: what the item is called, now or in the version; wasNamed when it was renamed;
- takes: the items it takes with it, such as the places of an element added or removed;
- differences: for a change or a move, each path with its value before and after; a long value comes cut.

Ids are never reused, so an id in both versions is the same thing, renamed or not. Reading a commit can take a while on a large project.

Example: {"version": "${OPENED}"}
Example: {"version": "3f1c9a0e7b2d4c6f8a1e0b9d7c5a3f1e2d4b6a8c"}
Example: {"version": "3f1c9a0e7b2d4c6f8a1e0b9d7c5a3f1e2d4b6a8c", "view": "overview", "offset": 200}`,
  input: {
    version: versionInput(),
    view: id()
      .optional()
      .describe('Keep to what this view draws, in either version, and its own changes.'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('How many changes to skip, for the next page; 0 by default.'),
  },
  hints: READ,
  run: async ({ version: text, view, offset = 0 }, program) => {
    if (program.compareVersion === undefined) return fail(NO_VERSIONS);
    const named = versionOf(text);
    if (!named.ok) return fail(named.why);
    const answer = await program.compareVersion(named.version, view);
    if (!answer.ok) return fail(`The version could not be compared: ${sentences(answer.problems)}`);
    const { comparison } = answer;
    const page = comparison.changes.slice(offset, offset + MAX_CHANGES_PER_CALL);
    const next = offset + page.length;
    return ok({
      version: text,
      ...(view === undefined ? {} : { view }),
      counts: comparison.counts,
      total: comparison.changes.length,
      offset,
      changes: page.map((change) => changeOf(comparison, change)),
      ...(next < comparison.changes.length ? { next } : {}),
      ...(comparison.changes.length === 0
        ? { note: 'Nothing differs between the version and the project now.' }
        : {}),
      ...(await proposalLeftOut(program)),
    });
  },
});

const showComparisonTool = tool({
  name: 'show_comparison',
  title: 'Show a comparison in the app',
  description: `Shows the person a version compared with the project now, in their app, as if they had chosen it in Compare with…: the canvas draws the view read-only, with what was added, removed, changed and moved marked, and the Changes tab lists every change. The person steps through the changes with ] and [, and ends it with Escape. It changes nothing in the project.

Name the version as list_versions gives it: a commit's full id, or "${OPENED}". show draws the view as the version had it (before), as it is now (after), or with every change marked (comparison, the default). It first compares the version, so that a version that cannot be compared is refused here, with why, and answers the counts. ${ONE_TAB}

Example: {"version": "${OPENED}"}
Example: {"version": "3f1c9a0e7b2d4c6f8a1e0b9d7c5a3f1e2d4b6a8c", "view": "overview", "show": "before"}`,
  input: {
    version: versionInput(),
    view: id()
      .optional()
      .describe(
        `The view to open, when the project now has it; left out, the one open. ${ONE_TAB}`,
      ),
    show: z.enum(DRAWINGS).optional().describe('before, after, or comparison, the default.'),
  },
  hints: GUIDE,
  run: async ({ version: text, view, show }, program): Promise<ToolOutcome> => {
    const named = versionOf(text);
    if (!named.ok) return fail(named.why);
    if (program.compareVersion === undefined) return fail(NO_VERSIONS);
    const answer = await program.compareVersion(named.version, view);
    if (!answer.ok) return fail(`The version could not be compared: ${sentences(answer.problems)}`);
    const state = await program.project();
    const opens = view === undefined || state.views.some((each) => each.id === view);
    return guideApps(
      program,
      {
        kind: 'comparison',
        version: named.version,
        ...(view === undefined ? {} : { view }),
        ...(show === undefined ? {} : { show }),
      },
      {
        counts: answer.comparison.counts,
        ...(opens
          ? {}
          : {
              view: `The project now has no view "${view}", so the app compares in the view it has open; compare_versions with view lists that view's changes.`,
            }),
      },
    );
  },
});

export const VERSION_TOOLS: readonly Tool[] = [
  listVersionsTool,
  compareVersionsTool,
  showComparisonTool,
];
