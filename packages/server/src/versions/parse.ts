/**
 * Reads what git answers, strictly (ADR 0071): each answer has the shape its call asks for, `-z`
 * where git offers it, and every object id has the length the repository's object format gives. An
 * answer of any other shape is refused whole, never guessed at.
 */
import { MAX_SUBJECT } from '@visual-anything/core';
import { GitError } from './git';

/** The repository's object format: the length of its ids. */
export type ObjectFormat = 'sha1' | 'sha256';

export function idLength(format: ObjectFormat): number {
  return format === 'sha1' ? 40 : 64;
}

/** Whether text is an object id of the format. */
export function isObjectId(text: string, format: ObjectFormat): boolean {
  return text.length === idLength(format) && /^[0-9a-f]+$/.test(text);
}

const TEXT = new TextDecoder('utf-8');

function unreadable(what: string): GitError {
  return new GitError('output', `Git’s answer about ${what} did not read.`);
}

/** Where the project folder sits: its repository's top, its prefix in it, and the object format. */
export interface RepositoryPlace {
  top: string;
  /** The project folder's path in the repository, ending in `/`, or empty at the top. */
  prefix: string;
  format: ObjectFormat;
}

/** Reads `rev-parse --show-toplevel --show-prefix --show-object-format`: three lines. */
export function parseRepositoryPlace(output: Buffer): RepositoryPlace {
  const lines = TEXT.decode(output).split('\n');
  const [top, prefix, format, end] = lines;
  if (
    lines.length !== 4 ||
    end !== '' ||
    top === undefined ||
    top === '' ||
    prefix === undefined ||
    (prefix !== '' && !prefix.endsWith('/')) ||
    prefix.includes('\0') ||
    (format !== 'sha1' && format !== 'sha256')
  ) {
    throw unreadable('the repository');
  }
  return { top, prefix, format };
}

/** Reads `rev-parse --verify` of one commit: its id, on a line. */
export function parseCommitId(output: Buffer, format: ObjectFormat): string {
  const text = TEXT.decode(output);
  const id = text.endsWith('\n') ? text.slice(0, -1) : '';
  if (!isObjectId(id, format)) throw unreadable('a commit');
  return id;
}

/** One entry of a tree, as `ls-tree -z -l` lists it. */
export interface TreeEntry {
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  id: string;
  /** Its size in bytes, for a blob the repository holds. */
  size?: number;
  /** Its name, or its path from the top with `--full-tree` and a path. */
  path: string;
}

/** Reads `ls-tree -z -l`: `<mode> <type> <id> <size>\t<path>`, each ended by NUL. */
export function parseTree(output: Buffer, format: ObjectFormat): TreeEntry[] {
  const records = splitEnded(output, 0, 'a tree');
  const length = idLength(format);
  const entry = new RegExp(
    `^([0-7]{6}) (blob|tree|commit) ([0-9a-f]{${length}}) +(\\d{1,15}|-|BAD)\\t([^\\0]+)$`,
    's',
  );
  return records.map((record) => {
    const match = entry.exec(TEXT.decode(record));
    if (match === null) throw unreadable('a tree');
    const [, mode = '', type = '', id = '', size = '', path = ''] = match;
    // A tree or a submodule has no size; a blob a partial clone lacks has one git cannot say: BAD.
    if ((type === 'blob') === (size === '-')) throw unreadable('a tree');
    return {
      mode,
      type: type as TreeEntry['type'],
      id,
      ...(/^\d+$/.test(size) ? { size: Number(size) } : {}),
      path,
    };
  });
}

/** A commit, as a listing shows it. */
export interface CommitInfo {
  commit: string;
  short: string;
  author: string;
  /** In seconds since 1970. */
  time: number;
  subject: string;
}

/**
 * The format of `log -z` that {@link parseLog} reads: the id, the short id, the author's name, the
 * committer's time and the subject, each ended by NUL. The author's email is never asked for.
 */
export const LOG_FORMAT = '--format=%H%x00%h%x00%an%x00%ct%x00%s';

/** Reads `log -z` in {@link LOG_FORMAT}: five fields a commit, each ended by NUL. */
export function parseLog(output: Buffer, format: ObjectFormat): CommitInfo[] {
  const fields = splitEnded(output, 0, 'commits').map((field) => TEXT.decode(field));
  if (fields.length % 5 !== 0) throw unreadable('commits');
  const commits: CommitInfo[] = [];
  for (let i = 0; i < fields.length; i += 5) {
    const [commit = '', short = '', author = '', time = '', subject = ''] = fields.slice(i, i + 5);
    if (!isObjectId(commit, format) || !isShortId(short, commit) || !/^\d{1,15}$/.test(time)) {
      throw unreadable('commits');
    }
    commits.push({ commit, short, author, time: Number(time), subject });
  }
  return commits;
}

/**
 * The format of `for-each-ref` that {@link parseRefs} reads: the ref's name, whether it is a symbolic
 * ref, its object's type and id, and the same of what an annotated tag points to, with that commit's
 * short id, subject, author's name and time. Fields are ended by NUL, refs by a new line.
 */
export const REF_FORMAT =
  '--format=' +
  [
    '%(refname)',
    '%(symref)',
    '%(objecttype)',
    '%(objectname)',
    '%(objectname:short)',
    '%(subject)',
    '%(authorname)',
    '%(committerdate:unix)',
    '%(*objecttype)',
    '%(*objectname)',
    '%(*objectname:short)',
    '%(*subject)',
    '%(*authorname)',
    '%(*committerdate:unix)',
  ]
    .map((field) => `${field}%00`)
    .join('');

const REF_FIELDS = 14;

/** A ref that names a commit, directly or through an annotated tag. */
export interface RefInfo extends CommitInfo {
  /** Its full name, such as `refs/heads/main`. */
  ref: string;
}

/**
 * Reads `for-each-ref` in {@link REF_FORMAT}. Symbolic refs, such as `refs/remotes/origin/HEAD`, and
 * refs that name no commit, such as a tag of a tree, are left out.
 */
export function parseRefs(output: Buffer, format: ObjectFormat): RefInfo[] {
  const refs: RefInfo[] = [];
  for (const line of splitEnded(output, 0x0a, 'refs')) {
    const fields = splitEnded(line, 0, 'refs').map((field) => TEXT.decode(field));
    if (fields.length !== REF_FIELDS) throw unreadable('refs');
    const [ref = '', symref = '', type = '', id = '', short = '', subject = '', author = ''] =
      fields;
    const [time = '', peeledType = '', peeledId = '', peeledShort = ''] = fields.slice(7, 11);
    const [peeledSubject = '', peeledAuthor = '', peeledTime = ''] = fields.slice(11);
    if (!ref.startsWith('refs/') || !isObjectId(id, format)) throw unreadable('refs');
    if (symref !== '') continue;
    const commit =
      type === 'commit'
        ? { commit: id, short, subject, author, time }
        : type === 'tag' && peeledType === 'commit'
          ? {
              commit: peeledId,
              short: peeledShort,
              subject: peeledSubject,
              author: peeledAuthor,
              time: peeledTime,
            }
          : undefined;
    if (commit === undefined) continue;
    if (
      !isObjectId(commit.commit, format) ||
      !isShortId(commit.short, commit.commit) ||
      !/^\d{1,15}$/.test(commit.time)
    ) {
      throw unreadable('refs');
    }
    refs.push({ ref, ...commit, time: Number(commit.time) });
  }
  return refs;
}

function isShortId(short: string, id: string): boolean {
  return short.length >= 4 && id.startsWith(short);
}

/**
 * The parts of an answer, each ended by `end`: the answer must be empty or end with it.
 */
function splitEnded(output: Uint8Array, end: number, what: string): Uint8Array[] {
  if (output.length === 0) return [];
  if (output[output.length - 1] !== end) throw unreadable(what);
  const parts: Uint8Array[] = [];
  let start = 0;
  for (let i = 0; i < output.length; i += 1) {
    if (output[i] === end) {
      parts.push(output.subarray(start, i));
      start = i + 1;
    }
  }
  return parts;
}

/** Control characters, and the line and paragraph separators. */
// eslint-disable-next-line no-control-regex -- control characters are what it finds.
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]', 'g');

/**
 * Text from a cloned repository, made fit to show: control characters become spaces, and it is cut
 * at `max` UTF-16 code units, never inside a character.
 */
export function shownText(text: string, max = MAX_SUBJECT): string {
  const clean = text.replace(CONTROL, ' ');
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return /[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/** The first line of a subject, made fit to show. */
export function shownSubject(subject: string): string {
  return shownText(subject.split('\n', 1)[0] ?? '');
}
