/**
 * Watches a project's `explorables/` for files saved outside the app (ADR 0107), such as by the
 * person's editor or git. It only says when to look: once things have been quiet for a moment, the
 * session reads each explorable's file and compares its bytes with those it last read or wrote, so
 * the program's own writes, and events that change nothing, come to nothing.
 *
 * It watches the project folder itself, without recursion, for `explorables/` appearing, going or
 * being replaced, and the folder `explorables/` while it is there.
 */
import { statSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { ProjectWatcher } from '../watcher';
import { EXPLORABLES_FOLDER } from './files';

export interface ExplorablesWatchOptions {
  /** How long things must be quiet before a change is reported, in milliseconds; 200 by default. */
  delay?: number;
  /** Receives what goes wrong while watching; the watcher keeps going. */
  onError?: (error: unknown) => void;
}

/** Watches `explorables/` in a project folder, and calls `onChange` once it is quiet after a change. */
export function watchExplorables(
  folder: string,
  onChange: () => void,
  options: ExplorablesWatchOptions = {},
): ProjectWatcher {
  const delay = options.delay ?? 200;
  const onError = options.onError ?? (() => {});
  const at = join(folder, EXPLORABLES_FOLDER);
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let child: { watcher: FSWatcher; inode: number } | undefined;

  const soon = () => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (!closed) onChange();
    }, delay);
  };

  /** Starts, stops or restarts the folder's watcher to follow what is on disk now. */
  const follow = (renew: boolean) => {
    if (closed) return;
    const inode = folderInode(at);
    if (!renew && child?.inode === inode) return;
    child?.watcher.close();
    child = undefined;
    if (inode === undefined) return;
    try {
      const watcher = watch(at, () => soon());
      watcher.on('error', () => {
        if (child?.watcher === watcher) {
          watcher.close();
          child = undefined;
        }
        soon();
      });
      child = { watcher, inode };
    } catch (error) {
      onError(error);
    }
  };

  const root = watch(folder, (eventType, filename) => {
    if (filename === null || filename.toLowerCase() === EXPLORABLES_FOLDER) {
      follow(eventType === 'rename');
      soon();
    }
  });
  root.on('error', onError);
  follow(true);
  return {
    close: () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      root.close();
      child?.watcher.close();
      child = undefined;
    },
  };
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
