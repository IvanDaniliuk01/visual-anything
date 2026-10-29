/**
 * What the program runs on the project's repository (ADR 0071): where the project folder sits in it,
 * the versions it lists, a ref the person typed resolved to its commit, and a commit's project files
 * read by their tree and blob ids. Every argument comes from git's own answers or from fixed text:
 * the prefix `rev-parse` gives, the ids it lists, and the commit ids the program listed. Paths go
 * after `--`, refs after `--end-of-options`.
 */
import { isCommitId, type ListedVersion } from '@visual-anything/core';
import { fileKindOf, type FileKind } from '@visual-anything/schema';
import { folderKindOf, FOLDERS, type FolderKind } from '../layout';
import type { ProjectFileProblem, ProjectSource, SourceFile, SourceFolder } from '../project';
import { capOf, describeCap } from '../regular-files';
import { describeBytes, GitError, isInsidePath, type Git } from './git';
import {
  LOG_FORMAT,
  REF_FORMAT,
  isObjectId,
  parseCommitId,
  parseLog,
  parseRefs,
  parseRepositoryPlace,
  parseTree,
  shownSubject,
  shownText,
  type CommitInfo,
  type RepositoryPlace,
  type TreeEntry,
} from './parse';

/** The project folder's repository, as git found it from the folder alone. */
export interface Repository {
  git: Git;
  place: RepositoryPlace;
}

/** Why a folder outside any repository has no commits to compare with. */
export const NOT_A_REPOSITORY =
  'The project folder is not in a git repository, so it has no commits to compare with. Comparing with the project as opened works without one.';

/**
 * Finds the project folder's repository with `rev-parse`, run in the project folder: its top, the
 * folder's prefix in it, and its object format. A repository git does not trust is refused with
 * git's reason; the program never adds a `safe.directory`. With a git older than 2.44, a partial
 * clone is refused, since that git cannot keep a read from fetching what the clone lacks.
 */
export async function openRepository(
  git: Git,
  signal?: AbortSignal,
): Promise<{ ok: true; repository: Repository } | { ok: false; why: string }> {
  let place: RepositoryPlace;
  try {
    place = parseRepositoryPlace(
      await git.run({
        args: ['rev-parse', '--show-toplevel', '--show-prefix', '--show-object-format'],
        ...(signal === undefined ? {} : { signal }),
      }),
    );
  } catch (error) {
    if (error instanceof GitError && (error.failure === 'stopped' || error.failure === 'timeout')) {
      throw error;
    }
    if (error instanceof GitError && error.failure === 'exit') {
      if (/not a git repository/i.test(error.stderr)) return { ok: false, why: NOT_A_REPOSITORY };
      if (/dubious ownership|unsafe repository/i.test(error.stderr)) {
        return {
          ok: false,
          why: `Git does not trust the project folder's repository, so its commits are not read: ${firstLines(error.stderr)}`,
        };
      }
    }
    return { ok: false, why: `Git could not read the project folder's repository: ${reasonOf(error)}` };
  }
  if (isInsidePath(place.top, git.path)) {
    return {
      ok: false,
      why: `The git found, ${git.path}, lies inside the project's repository, so Visual Anything does not run it.`,
    };
  }
  const repository = { git, place };
  if (!git.hasNoLazyFetch && (await isPartialClone(repository, signal))) {
    return {
      ok: false,
      why: `The project's repository is a partial clone, which lacks objects: reading its commits needs git 2.44 or later, which can keep a read from fetching them, and the git found is ${git.version.text}.`,
    };
  }
  return { ok: true, repository };
}

/** Whether the repository is a partial clone: a promisor remote, or the extension that marks one. */
async function isPartialClone(repository: Repository, signal?: AbortSignal): Promise<boolean> {
  const asks: string[][] = [
    ['config', '--get', 'extensions.partialclone'],
    ['config', '--get-regexp', '^remote\\..*\\.promisor$'],
  ];
  for (const args of asks) {
    try {
      const said = await repository.git.run({ args, ...(signal === undefined ? {} : { signal }) });
      if (said.length > 0) return true;
    } catch (error) {
      // `config --get` ends with 1 when nothing is set.
      if (!(error instanceof GitError && error.failure === 'exit' && error.code === 1)) throw error;
    }
  }
  return false;
}

/** The most refs of each kind listed, and the most recent commits. */
export const MAX_REFS = 1000;
export const MAX_COMMITS = 200;

const REF_KINDS = [
  { kind: 'branch', prefix: 'refs/heads/' },
  { kind: 'remote', prefix: 'refs/remotes/' },
  { kind: 'tag', prefix: 'refs/tags/' },
] as const;

/**
 * The versions a repository lists (ADR 0071): `HEAD`; its local branches, remote-tracking branches
 * and tags, each newest first and at most {@link MAX_REFS} of each, annotated tags peeled to their
 * commit; and the last {@link MAX_COMMITS} commits on `HEAD` that touched the project folder. Names
 * and subjects are text to show, never passed back to git.
 */
export async function listVersions(
  repository: Repository,
  signal?: AbortSignal,
): Promise<ListedVersion[]> {
  const { git, place } = repository;
  const run = (args: string[]) => git.run({ args, ...(signal === undefined ? {} : { signal }) });
  const versions: ListedVersion[] = [];
  const head = await headCommit(repository, signal);
  if (head !== undefined) {
    const [info] = parseLog(
      await run(['log', '-z', LOG_FORMAT, '-n', '1', '--end-of-options', head]),
      place.format,
    );
    if (info === undefined || info.commit !== head) {
      throw new GitError('output', "Git's answer about HEAD did not read.");
    }
    versions.push(listed('head', info));
  }
  for (const { kind, prefix } of REF_KINDS) {
    const refs = parseRefs(
      await run([
        'for-each-ref',
        `--count=${MAX_REFS}`,
        '--sort=-creatordate',
        REF_FORMAT,
        '--end-of-options',
        prefix,
      ]),
      place.format,
    );
    for (const ref of refs) {
      if (!ref.ref.startsWith(prefix)) continue;
      versions.push(listed(kind, ref, ref.ref.slice(prefix.length)));
    }
  }
  if (head !== undefined) {
    // Paths are read from where git runs, the project folder: `.` is its prefix.
    const commits = parseLog(
      await run([
        'log',
        '-z',
        LOG_FORMAT,
        '-n',
        String(MAX_COMMITS),
        '--end-of-options',
        head,
        '--',
        '.',
      ]),
      place.format,
    );
    for (const commit of commits) versions.push(listed('commit', commit));
  }
  return versions;
}

/** HEAD's commit, or `undefined` for a repository with no commits yet. */
async function headCommit(repository: Repository, signal?: AbortSignal): Promise<string | undefined> {
  try {
    return parseCommitId(
      await repository.git.run({
        args: ['rev-parse', '--verify', '--quiet', '--end-of-options', 'HEAD^{commit}'],
        ...(signal === undefined ? {} : { signal }),
      }),
      repository.place.format,
    );
  } catch (error) {
    if (error instanceof GitError && error.failure === 'exit' && error.code === 1) return undefined;
    throw error;
  }
}

function listed(kind: ListedVersion['kind'], info: CommitInfo, name?: string): ListedVersion {
  return {
    kind,
    ...(name === undefined ? {} : { name: shownText(name, 1000) }),
    commit: info.commit,
    short: info.short,
    subject: shownSubject(info.subject),
    author: shownText(info.author),
    time: info.time * 1000,
  };
}

/** Why the text of a ref the person typed is refused before git hears of it, or `undefined`. */
export function refusedRef(text: string): string | undefined {
  if (text.length < 1 || text.length > 255) return 'A ref has 1 to 255 characters.';
  if (text.startsWith('-')) return 'A ref does not start with "-".';
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f:\\]/.test(text) || text.includes('..')) {
    return 'A ref has no space, control character, ":", "\\" or "..".';
  }
  return undefined;
}

/**
 * Resolves a ref the person typed on the command line to its commit (ADR 0071): the text is checked
 * first, then `rev-parse --verify` gives the id, which is all that is used from then on.
 */
export async function resolveRef(
  repository: Repository,
  text: string,
  signal?: AbortSignal,
): Promise<{ ok: true; commit: string } | { ok: false; why: string }> {
  const refused = refusedRef(text);
  if (refused !== undefined) return { ok: false, why: refused };
  try {
    const commit = parseCommitId(
      await repository.git.run({
        args: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${text}^{commit}`],
        ...(signal === undefined ? {} : { signal }),
      }),
      repository.place.format,
    );
    return { ok: true, commit };
  } catch (error) {
    if (error instanceof GitError && error.failure === 'exit') {
      return { ok: false, why: `${text} names no commit of the project's repository.` };
    }
    return { ok: false, why: reasonOf(error) };
  }
}

// ——— A commit's project files ———

/** How a commit is read: its limits, and what stops it. */
export interface ReadOptions {
  signal?: AbortSignal;
}

/** A commit's project files as bytes, or what keeps them from being read. */
export type CommitRead =
  { ok: true; source: ProjectSource } | { ok: false; problems: ProjectFileProblem[] };

/** Why a file of a commit is not read, by its mode. */
const NOT_READ: Record<string, string> = {
  '120000': 'In this commit, the file is a link; Visual Anything reads only regular files.',
  '160000': 'In this commit, the file is a submodule; Visual Anything reads only regular files.',
};
const NOT_REGULAR = 'In this commit, the file is not a regular file; Visual Anything reads only regular files.';
const MISSING =
  "This commit's copy of the file is not in the repository, which is a partial clone: fetch it with git, then compare again.";

const REGULAR = new Set(['100644', '100755']);

/** A project file of a commit: its blob to read, with its size, or why it is not read. */
type Found = { path: string; id: string; size: number } | { path: string; unread: string };

/**
 * Reads a commit's project files (ADR 0071): `ls-tree` finds the project folder's tree and lists it,
 * and the trees of the kind folders by their ids; one `cat-file --batch` then reads the blobs, each
 * within its kind's cap by `ls-tree`'s size and again by the batch's own, before a byte of it is read.
 * A link or a submodule where a project file or a kind folder belongs is a problem of that file, and
 * nothing it names is read.
 */
export async function readCommit(
  repository: Repository,
  commit: string,
  options: ReadOptions = {},
): Promise<CommitRead> {
  const { git, place } = repository;
  if (!isCommitId(commit) || !isObjectId(commit, place.format)) {
    return refusedWhole('A version is a commit the program listed, by its id.');
  }
  const signal = options.signal;
  const lsTree = async (args: string[]) =>
    parseTree(
      await git.run({
        args: ['ls-tree', '--full-tree', '-z', '-l', ...args],
        ...(signal === undefined ? {} : { signal }),
      }),
      place.format,
    );

  let entries: TreeEntry[];
  if (place.prefix === '') {
    entries = await lsTree(['--end-of-options', commit]);
  } else {
    const folder = place.prefix.slice(0, -1);
    const found = (await lsTree(['--end-of-options', commit, '--', folder])).filter(
      (entry) => entry.path === folder,
    );
    const [tree] = found;
    if (tree === undefined || found.length > 1) {
      return refusedWhole(
        `This commit has no folder ${folder}: the project folder may have had another name then.`,
      );
    }
    if (tree.type !== 'tree') {
      return refusedWhole(`In this commit, ${folder} is not a folder, so it holds no project.`);
    }
    entries = await lsTree(['--end-of-options', tree.id]);
  }

  // Each file of the version, where it goes: at the top, or in its kind's folder.
  const files: { where: 'top' | FolderKind; file: Found }[] = [];
  const folders: Record<FolderKind, SourceFolder> = {
    package: undefined,
    view: undefined,
    scenario: undefined,
    tour: undefined,
    comment: undefined,
  };
  const folderTrees = new Map<FolderKind, TreeEntry>();
  for (const entry of entries) {
    if (!isName(entry.path)) throw treeUnreadable();
    const kind = folderKindOf(entry.path);
    if (kind !== undefined) {
      const twice = folderTrees.has(kind) || folders[kind] !== undefined;
      const problem = folderProblem(entry, kind, twice);
      if (problem === undefined) {
        folderTrees.set(kind, entry);
      } else {
        folderTrees.delete(kind);
        folders[kind] = { problem, name: entry.path };
      }
      continue;
    }
    const fileKind = fileKindOf(entry.path);
    if (fileKind !== 'project' && fileKind !== 'model') continue;
    const file = fileOf(entry, entry.path, fileKind);
    if (file !== undefined) files.push({ where: 'top', file });
  }
  for (const [kind, tree] of folderTrees) {
    for (const entry of await lsTree(['--end-of-options', tree.id])) {
      if (!isName(entry.path)) throw treeUnreadable();
      if (fileKindOf(entry.path) !== kind) continue;
      const file = fileOf(entry, `${tree.path}/${entry.path}`, kind);
      if (file !== undefined) files.push({ where: kind, file });
    }
  }

  if (files.length > git.limits.files) {
    return refusedWhole(
      `This version holds more than ${git.limits.files.toLocaleString('en-US')} project files, the most Visual Anything reads of one version.`,
    );
  }
  const blobs = new Map<string, number>();
  for (const { file } of files) if ('id' in file) blobs.set(file.id, file.size);
  let total = 0;
  for (const size of blobs.values()) total += size;
  if (total > git.limits.totalBytes) {
    return refusedWhole(
      `This version's project files hold more than ${describeBytes(git.limits.totalBytes)} in all, the most Visual Anything reads of one version.`,
    );
  }

  const read = await readBlobs(git, [...blobs], signal);
  const sourceOf = (file: Found): SourceFile => {
    if (!('id' in file)) return file;
    const bytes = read.get(file.id);
    return bytes === undefined ? { path: file.path, unread: MISSING } : { path: file.path, bytes };
  };
  const top = files.filter(({ where }) => where === 'top').map(({ file }) => sourceOf(file));
  for (const kind of folderTrees.keys()) {
    folders[kind] = {
      files: files.filter(({ where }) => where === kind).map(({ file }) => sourceOf(file)),
    };
  }
  return { ok: true, source: { top, folders } };
}

function treeUnreadable(): GitError {
  return new GitError('output', "Git's answer about a tree did not read.");
}

/** Why a kind folder of a commit is not read, or `undefined` when it is a tree to list. */
function folderProblem(entry: TreeEntry, kind: FolderKind, twice: boolean): string | undefined {
  const name = entry.path;
  if (twice) {
    return `In this commit, more than one folder is named ${FOLDERS[kind]} but for case; Visual Anything reads only one.`;
  }
  if (entry.mode === '120000') {
    return `In this commit, ${name} is a link; Visual Anything reads only real folders and regular files.`;
  }
  if (entry.mode === '160000') {
    return `In this commit, ${name} is a submodule; Visual Anything reads only real folders and regular files.`;
  }
  if (entry.type !== 'tree') {
    return `${name} is not a folder; ${extensionOf(kind)} files go in ${FOLDERS[kind]}/.`;
  }
  return undefined;
}

function extensionOf(kind: FolderKind): string {
  return { package: '.vapackage', view: '.vaview', scenario: '.vascenario', tour: '.vatour', comment: '.vacomment' }[kind];
}

/**
 * A project file of a commit: why it is not read, or its blob to read, within its kind's cap. A tree
 * with a project file's name is passed over, as a folder is on disk.
 */
function fileOf(entry: TreeEntry, path: string, kind: FileKind): Found | undefined {
  if (entry.type === 'tree') return undefined;
  const notRead = NOT_READ[entry.mode];
  if (notRead !== undefined) return { path, unread: notRead };
  if (entry.type !== 'blob' || !REGULAR.has(entry.mode)) return { path, unread: NOT_REGULAR };
  if (entry.size === undefined) return { path, unread: MISSING };
  if (entry.size > capOf(kind)) {
    return {
      path,
      unread: `The file holds more than ${describeCap(capOf(kind))}, the most a file of this kind may hold.`,
    };
  }
  return { path, id: entry.id, size: entry.size };
}

/** Whether a tree entry's name is one name: not empty, without `/`, and neither `.` nor `..`. */
function isName(name: string): boolean {
  return name !== '' && name !== '.' && name !== '..' && !name.includes('/');
}

/**
 * Reads blobs by id with one `cat-file --batch`: each one's bytes, by id; a blob the repository
 * lacks is left out. Each header must name the blob asked for, as a blob of the size `ls-tree` gave;
 * otherwise git is stopped before a byte more is read.
 */
async function readBlobs(
  git: Git,
  blobs: readonly (readonly [id: string, size: number])[],
  signal?: AbortSignal,
): Promise<Map<string, Buffer>> {
  const read = new Map<string, Buffer>();
  if (blobs.length === 0) return read;
  const batch = new BatchReader(blobs, read);
  await git.run({
    args: ['cat-file', '--batch'],
    input: blobs.map(([id]) => `${id}\n`).join(''),
    output: (chunk) => batch.write(chunk),
    ...(signal === undefined ? {} : { signal }),
  });
  batch.end();
  return read;
}

/** The most bytes of a batch's header line: an id, a type and a size. */
const MAX_HEADER = 200;

/** Reads `cat-file --batch`'s output as it comes, strictly. */
export class BatchReader {
  #next = 0;
  #header: Buffer[] = [];
  #headerBytes = 0;
  #body: { id: string; bytes: Buffer; filled: number } | undefined;
  #newline = false;

  constructor(
    private readonly blobs: readonly (readonly [id: string, size: number])[],
    private readonly read: Map<string, Buffer>,
  ) {}

  write(chunk: Buffer): void {
    let at = 0;
    while (at < chunk.length) {
      if (this.#newline) {
        if (chunk[at] !== 0x0a) throw batchUnreadable();
        this.#newline = false;
        at += 1;
        continue;
      }
      const body = this.#body;
      if (body !== undefined) {
        const take = Math.min(body.bytes.length - body.filled, chunk.length - at);
        chunk.copy(body.bytes, body.filled, at, at + take);
        body.filled += take;
        at += take;
        if (body.filled === body.bytes.length) {
          this.read.set(body.id, body.bytes);
          this.#body = undefined;
          this.#newline = true;
        }
        continue;
      }
      const end = chunk.indexOf(0x0a, at);
      const part = chunk.subarray(at, end === -1 ? chunk.length : end);
      this.#headerBytes += part.length;
      if (this.#headerBytes > MAX_HEADER) throw batchUnreadable();
      this.#header.push(part);
      if (end === -1) return;
      at = end + 1;
      this.#takeHeader(Buffer.concat(this.#header).toString('latin1'));
      this.#header = [];
      this.#headerBytes = 0;
    }
  }

  /** Checks that every blob asked for was answered, and nothing more. */
  end(): void {
    if (this.#next !== this.blobs.length || this.#body !== undefined || this.#newline || this.#headerBytes > 0) {
      throw batchUnreadable();
    }
  }

  #takeHeader(header: string): void {
    const blob = this.blobs[this.#next];
    if (blob === undefined) throw batchUnreadable();
    const [id, size] = blob;
    this.#next += 1;
    if (header === `${id} missing`) return;
    if (header !== `${id} blob ${size}`) throw batchUnreadable();
    if (size === 0) {
      this.read.set(id, Buffer.alloc(0));
      this.#newline = true;
      return;
    }
    this.#body = { id, bytes: Buffer.alloc(size), filled: 0 };
  }
}

function batchUnreadable(): GitError {
  return new GitError('output', "Git's answer with the files' contents did not read.");
}

function refusedWhole(message: string): CommitRead {
  return { ok: false, problems: [{ file: '.', pointer: '', message }] };
}

/** The first lines of what git said, at most a few hundred characters, for a reason shown as text. */
function firstLines(text: string): string {
  const said = text.trim().split('\n').slice(0, 6).join(' ').replace(/\s+/g, ' ');
  return said.length > 600 ? `${said.slice(0, 600)}…` : said;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
