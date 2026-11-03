/**
 * Home (ADR 0093): where the local program starts when it is given no folder, and what its Projects
 * screen offers. The projects folder is `Documents/Visual Anything` in the person's home folder; the
 * projects in it are its subfolders that hold a `.vaproject`. Everything here only reads folders and
 * the one project file of each, never follows a link, and runs nothing it finds.
 */
import { existsSync, statSync } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { basename, join, posix, resolve, win32 } from 'node:path';
import { MAX_HOME_PATH, MAX_HOME_PROJECTS, builtinPackage, type HomeProject } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { errorCode, errorReason } from './errors';
import { toForwardSlashes } from './paths';

/** An absolute folder in this variable names the projects folder instead, for tests and portable use. */
export const PROJECTS_ENV = 'VISUAL_ANYTHING_PROJECTS';

/** The name of the projects folder inside the Documents folder. */
export const PROJECTS_FOLDER_NAME = 'Visual Anything';

/** The largest project file read to name a project on the Projects screen. */
const MAX_PROJECT_FILE = 1024 * 1024;

/**
 * The projects folder (ADR 0093): `Visual Anything` in the person's Documents folder, or in their home
 * folder when it has no Documents folder. On Windows the Documents folder is the profile's, or the one
 * OneDrive keeps when only that one exists; elsewhere an absolute `XDG_DOCUMENTS_DIR` names it. An
 * absolute `VISUAL_ANYTHING_PROJECTS` names the projects folder itself. It is made when first needed,
 * never here.
 */
export function projectsFolder(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
  home: string,
  isFolder: (path: string) => boolean = folderExists,
): string {
  const paths = platform === 'win32' ? win32 : posix;
  const absolute = (value: string | undefined): value is string =>
    value !== undefined && value !== '' && paths.isAbsolute(value);
  const chosen = env[PROJECTS_ENV];
  if (absolute(chosen)) return paths.normalize(chosen);
  const candidates = [
    ...(platform !== 'win32' && platform !== 'darwin' && absolute(env.XDG_DOCUMENTS_DIR)
      ? [env.XDG_DOCUMENTS_DIR]
      : []),
    paths.join(home, 'Documents'),
    ...(platform === 'win32' ? [paths.join(home, 'OneDrive', 'Documents')] : []),
  ];
  const documents = candidates.find((each) => isFolder(each)) ?? home;
  return paths.join(documents, PROJECTS_FOLDER_NAME);
}

function folderExists(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** A project's world (ADR 0093): the first built-in package it uses besides Systems. */
export function worldOf(packages: unknown): Id | undefined {
  if (!Array.isArray(packages)) return undefined;
  return (packages as unknown[]).find(
    (each): each is Id =>
      typeof each === 'string' && each !== 'systems' && builtinPackage(each) !== undefined,
  );
}

/** What the Projects screen says of a project folder. */
export type ProjectSummary = Omit<HomeProject, 'path'>;

/**
 * What a folder that holds a project is: its name, its world and when its files last changed; undefined
 * for a folder that holds no `.vaproject`, a link, or nothing that is there. It reads the folder, the
 * names in it and the one project file, never anything else.
 */
export async function describeProject(folder: string): Promise<ProjectSummary | undefined> {
  try {
    const info = await lstat(folder);
    if (!info.isDirectory()) return undefined;
    const entries = await readdir(folder, { withFileTypes: true });
    const file = entries.find((entry) => entry.isFile() && entry.name.endsWith('.vaproject'));
    if (file === undefined) return undefined;
    let changed = info.mtimeMs;
    // Every file is written as a temporary file renamed into its folder, which changes the folder.
    for (const entry of entries) {
      if (!entry.isFile() && !entry.isDirectory()) continue;
      const each = await lstat(join(folder, entry.name)).catch(() => undefined);
      if (each !== undefined) changed = Math.max(changed, each.mtimeMs);
    }
    const project = await readSmallJson(join(folder, file.name));
    const name =
      typeof project?.name === 'string' && project.name.trim() !== ''
        ? project.name
        : basename(folder);
    const world = worldOf(project?.packages);
    return { name, ...(world === undefined ? {} : { world }), changed: Math.round(changed) };
  } catch {
    return undefined;
  }
}

/** A JSON object in a regular file no larger than a project file is read for its name; else undefined. */
async function readSmallJson(path: string): Promise<Record<string, unknown> | undefined> {
  const handle = await open(path, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_PROJECT_FILE) return undefined;
    const text = (await handle.readFile()).toString('utf8').replace(/^﻿/, '');
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  } finally {
    await handle.close();
  }
}

/**
 * The projects in the projects folder: each subfolder that holds a `.vaproject`, the last changed
 * first, at most {@link MAX_HOME_PROJECTS}. A projects folder that is not there yet holds none.
 */
export async function listProjects(root: string): Promise<HomeProject[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const folders = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .slice(0, MAX_HOME_PROJECTS);
  const found = await Promise.all(
    folders.map(async (entry) => {
      const path = join(root, entry.name);
      const summary = await describeProject(path);
      return summary === undefined ? undefined : { path, ...summary };
    }),
  );
  return found
    .filter((each): each is HomeProject => each !== undefined)
    .sort((a, b) => b.changed - a.changed || compareText(a.name, b.name));
}

/** Names that Windows keeps for devices, which no folder may take, whatever follows a dot. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** The longest folder name made from a project's name. */
const MAX_FOLDER_NAME = 80;

/**
 * The name of a new project's folder, made from the project's name so that it works on every system:
 * without the characters Windows refuses in a name, nor control characters, nor dots or spaces at its
 * ends, nor a device's name, and at most 80 characters; "Project" when nothing is left.
 */
export function folderNameFor(name: string): string {
  let made = name
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- control characters are what this removes.
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  made = [...made].slice(0, MAX_FOLDER_NAME).join('');
  made = made.replace(/^[.\s]+|[.\s]+$/g, '');
  if (made === '') return 'Project';
  if (RESERVED.test(made.split('.')[0] ?? '')) made = `${made} project`;
  return made;
}

/** What a folder an app named on the Projects screen holds, once checked. */
export type HomeFolder =
  | { ok: true; folder: string; holds: 'project' | 'nothing' }
  | { ok: false; message: string };

/**
 * Checks a folder an app named to open (ADR 0093): an absolute path, not of the network nor of a
 * device, to a folder that is there and holds a `.vaproject`, or nothing yet but entries whose names
 * start with a dot. Its real path comes back. It reads the folder and the names in it, nothing else.
 */
export async function checkHomeFolder(
  path: string,
  platform: NodeJS.Platform = process.platform,
): Promise<HomeFolder> {
  const shown = toForwardSlashes(path);
  const paths = platform === 'win32' ? win32 : posix;
  if (path.length > MAX_HOME_PATH || path.includes('\0')) {
    return { ok: false, message: 'That is not the path of a folder.' };
  }
  if (!paths.isAbsolute(path)) {
    return {
      ok: false,
      message: `Give the whole path of the folder, from the top of its drive, not ${shown}.`,
    };
  }
  if (platform === 'win32' && /^[\\/]{2}/.test(path)) {
    return {
      ok: false,
      message: `Visual Anything opens folders on this computer, not on the network: ${shown}.`,
    };
  }
  let real: string;
  try {
    real = await realpath(resolve(path));
    const info = await lstat(real);
    if (!info.isDirectory()) return { ok: false, message: `${shown} is a file, not a folder.` };
    const entries = await readdir(real, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name.endsWith('.vaproject'))) {
      return { ok: true, folder: real, holds: 'project' };
    }
    if (entries.every((entry) => entry.name.startsWith('.'))) {
      return { ok: true, folder: real, holds: 'nothing' };
    }
  } catch (error) {
    if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') {
      return { ok: false, message: `There is no folder ${shown}.` };
    }
    return { ok: false, message: `The folder ${shown} could not be read: ${errorReason(error)}` };
  }
  return {
    ok: false,
    message: `${shown} holds no project: a folder opens when it holds a .vaproject file, or nothing yet to start a project in.`,
  };
}

/** Whether two paths name the same folder, without case where the system's names have none. */
export function samePath(a: string, b: string, platform: NodeJS.Platform = process.platform) {
  const key = (path: string) => {
    const forward = path.replaceAll('\\', '/').replace(/\/+$/, '');
    return platform === 'win32' || platform === 'darwin' ? forward.toLowerCase() : forward;
  };
  return key(a) === key(b);
}

/** Compares by UTF-16 code units, the same on every machine and locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
