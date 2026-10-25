/**
 * Watches a project folder for changes made outside the app, such as a git pull or an editor. It
 * reports once things have been quiet for a moment, since a pull touches many files, and it ignores
 * every file that opening the project would not read, the writer's temporary files among them.
 */
import { readdirSync, statSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { fileKindOf } from '@visual-anything/schema';
import { FOLDERS, folderKindOf, isProjectPath, type FolderKind } from './layout';
import { toForwardSlashes } from './paths';

/**
 * How the folder is watched:
 * - `recursive`: one native recursive watcher on the project folder, as Windows and macOS offer.
 * - `folders`: one watcher on the project folder and one on each of its packages, views and scenarios
 *   folders. A project is never deeper than that. On Linux, Node's recursive watcher watches each file
 *   by itself and loses track of a file once it is replaced by a rename, as atomic writes do, while a
 *   watcher on its folder sees every change to it.
 */
export type WatchMode = 'recursive' | 'folders';

export interface WatchOptions {
  /** How long things must be quiet before a change is reported, in milliseconds. */
  delay?: number;
  /** The longest a change waits to be reported while changes keep coming; ten delays by default. */
  maxDelay?: number;
  mode?: WatchMode;
  /** Receives what goes wrong while watching; the watcher keeps going. */
  onError?: (error: unknown) => void;
}

export interface ProjectWatcher {
  /** Stops watching; nothing is reported after it. */
  close(): void;
}

/** How long the folder must be quiet before a change is reported: a pull touches many files. */
export const WATCH_DELAY = 200;

/** The mode that watches reliably on a platform. */
export function defaultWatchMode(platform: NodeJS.Platform = process.platform): WatchMode {
  return platform === 'win32' || platform === 'darwin' ? 'recursive' : 'folders';
}

const FOLDER_KINDS = Object.keys(FOLDERS) as FolderKind[];

/** Receives a change: its kind as `fs.watch` names it, and its path; `null` when the path is unknown. */
type OnEvent = (eventType: string, path: string | null) => void;

/**
 * Watches the project files in a folder and calls `onChange` once they have been quiet for `delay`
 * milliseconds after a change. It throws when the folder cannot be watched at all.
 */
export function watchProject(
  folder: string,
  onChange: () => void,
  options: WatchOptions = {},
): ProjectWatcher {
  const delay = options.delay ?? WATCH_DELAY;
  const maxDelay = options.maxDelay ?? delay * 10;
  const onError = options.onError ?? (() => {});
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** When the oldest change not yet reported happened. */
  let pendingSince: number | undefined;

  // What the project files were when last reported: a platform may tell of changes that touch none of
  // them, as macOS tells of the folder itself, so only a real change is reported.
  let last = filesOf(folder);
  /** Whether a change since the last report named a file the project reads, which always counts. */
  let namedAFile = false;
  const report = () => {
    timer = undefined;
    pendingSince = undefined;
    if (closed) return;
    const now = filesOf(folder);
    const named = namedAFile;
    namedAFile = false;
    if (!named && now === last) return;
    last = now;
    onChange();
  };
  const onEvent: OnEvent = (eventType, path) => {
    if (closed) return;
    if (path !== null) {
      // A folder's own times change along with its files, which report themselves.
      if (eventType === 'change' && isFolderPath(path)) return;
      if (!isProjectPath(path)) return;
      // The folder itself, '' or '.', and the folders of the project name no file.
      if (fileKindOf(path.split('/').pop() ?? '') !== undefined) namedAFile = true;
    }
    const now = Date.now();
    pendingSince ??= now;
    clearTimeout(timer);
    timer = setTimeout(report, Math.max(0, Math.min(delay, pendingSince + maxDelay - now)));
  };

  const stop =
    (options.mode ?? defaultWatchMode()) === 'recursive'
      ? watchRecursively(folder, onEvent, onError)
      : watchFolders(folder, onEvent, onError);
  return {
    close: () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      stop();
    },
  };
}

/** Watches the folder and everything in it with one native watcher. */
function watchRecursively(folder: string, onEvent: OnEvent, onError: (error: unknown) => void) {
  const watcher = watch(folder, { recursive: true }, (eventType, filename) =>
    onEvent(eventType, filename === null ? null : toForwardSlashes(filename)),
  );
  watcher.on('error', onError);
  return () => watcher.close();
}

/**
 * Watches the project folder and each folder of packages, views and scenarios in it. A folder that
 * appears is watched from then on, and one that is removed or replaced is followed.
 */
function watchFolders(folder: string, onEvent: OnEvent, onError: (error: unknown) => void) {
  const children = new Map<FolderKind, { watcher: FSWatcher; inode: number }>();
  let stopped = false;

  /**
   * Starts, stops or restarts the watcher of each folder to follow what is on disk now. A folder
   * named in `renew` gets a new watcher even when its inode is the same: it was made, removed or
   * moved, and a folder made anew can reuse the inode number of the one it replaces.
   */
  const follow = (renew: FolderKind | 'all' | undefined = undefined) => {
    for (const kind of FOLDER_KINDS) {
      const path = join(folder, FOLDERS[kind]);
      const inode = folderInode(path);
      const current = children.get(kind);
      if (renew !== 'all' && renew !== kind && current?.inode === inode) continue;
      current?.watcher.close();
      children.delete(kind);
      if (inode === undefined || stopped) continue;
      try {
        const watcher = watch(path, (eventType, filename) =>
          onEvent(eventType, filename === null ? null : `${FOLDERS[kind]}/${filename}`),
        );
        // A folder removed while watched can fail its watcher, as on Windows: follow it again.
        watcher.on('error', () => {
          if (children.get(kind)?.watcher === watcher) {
            watcher.close();
            children.delete(kind);
          }
          onEvent('rename', null);
        });
        children.set(kind, { watcher, inode });
      } catch (error) {
        onError(error);
      }
    }
  };

  const root = watch(folder, (eventType, filename) => {
    const kind = filename === null ? undefined : folderKindOf(filename);
    if (filename === null) follow('all');
    else if (kind !== undefined) follow(eventType === 'rename' ? kind : undefined);
    onEvent(eventType, filename);
  });
  root.on('error', onError);
  follow();
  return () => {
    stopped = true;
    root.close();
    for (const { watcher } of children.values()) watcher.close();
    children.clear();
  };
}

/** Whether a path names one of the folders of packages, views or scenarios. */
/**
 * The size and time of every file opening the project reads, in one string, so that two are equal only
 * when none of those files changed.
 */
function filesOf(folder: string): string {
  const lines: string[] = [];
  const add = (path: string) => {
    try {
      const stats = statSync(join(folder, path));
      if (stats.isFile()) lines.push(`${path} ${stats.size} ${stats.mtimeMs} ${stats.ino}`);
    } catch {
      // Gone between listing and reading: its absence is the change.
    }
  };
  const list = (path: string): string[] => {
    try {
      return readdirSync(join(folder, path));
    } catch {
      return [];
    }
  };
  for (const name of list('')) {
    const kind = fileKindOf(name);
    if (kind === 'project' || kind === 'model') add(name);
  }
  for (const kind of FOLDER_KINDS) {
    // A folder of the project that appears, goes or is replaced counts too, even while empty.
    const inode = folderInode(join(folder, FOLDERS[kind]));
    if (inode !== undefined) lines.push(`${FOLDERS[kind]}/ ${inode}`);
    for (const name of list(FOLDERS[kind])) {
      if (fileKindOf(name) === kind) add(`${FOLDERS[kind]}/${name}`);
    }
  }
  return lines.sort().join('\n');
}

function isFolderPath(path: string): boolean {
  return !path.includes('/') && folderKindOf(path) !== undefined;
}

/** The inode of a folder, which changes when the folder is replaced; `undefined` when there is none. */
function folderInode(path: string): number | undefined {
  try {
    const stats = statSync(path);
    return stats.isDirectory() ? stats.ino : undefined;
  } catch {
    return undefined;
  }
}
