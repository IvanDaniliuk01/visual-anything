/**
 * Destinations (ADR 0056): values of `destination` attributes that open something when followed —
 * a view of this project, a view of another project, or a web address. They arrive from the app, from
 * Claude and from hand-edited files, so they are read strictly here: by the commands that store them,
 * by the checks on opening and by whatever follows them. Anything else is never followed.
 *
 * Only `https:` web addresses are destinations, without a user name or password, a backslash, or any
 * character a browser would read otherwise than the confirmation names their host. Another project is
 * named by a path relative to this project's folder that never leads out of the folder holding it.
 */
import type { AttributeDefinition, Attributes, Destination } from '@visual-anything/schema';
import { isId } from './ids';

/** The longest web address a destination holds, in characters. */
export const MAX_WEB_ADDRESS_LENGTH = 2048;

/** The longest path to another project a destination holds, in characters. */
export const MAX_PROJECT_PATH_LENGTH = 1024;

/** The most elements a destination to a view focuses on. */
export const MAX_DESTINATION_FOCUS = 100;

/** What a destination opens. */
export type DestinationKind = 'view' | 'project' | 'web';

/** What a destination opens: a view of this project, another project, or a web address. */
export function destinationKind(destination: Destination): DestinationKind {
  if ('url' in destination) return 'web';
  if ('project' in destination) return 'project';
  return 'view';
}

/** A destination as read, or why the value is not one. */
export type DestinationRead = { ok: true; destination: Destination } | { ok: false; why: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A name of a key, quoted, for saying a value has a key it should not. */
function extraKey(value: Record<string, unknown>, keys: readonly string[]): string | undefined {
  return Object.keys(value).find((key) => !keys.includes(key));
}

/**
 * Reads a destination strictly: exactly one of its three forms, with only the keys that form has.
 * The destination it gives is a fresh copy, which shares nothing with the value read.
 */
export function readDestination(value: unknown): DestinationRead {
  if (!isRecord(value)) {
    return {
      ok: false,
      why: 'A destination is an object: { "view": … }, { "project": … } or { "url": … }.',
    };
  }
  const has = (key: string) => Object.hasOwn(value, key);
  const forms = [has('view') && !has('project'), has('project'), has('url')];
  if (forms.filter(Boolean).length !== 1) {
    return {
      ok: false,
      why: 'A destination opens one thing: a view, with "view"; another project, with "project"; or a web address, with "url".',
    };
  }
  if (has('url')) {
    const extra = extraKey(value, ['url']);
    if (extra !== undefined) return { ok: false, why: `A web address has no "${extra}".` };
    const why = webAddressProblem(value.url);
    return why === undefined
      ? { ok: true, destination: { url: value.url as string } }
      : { ok: false, why };
  }
  if (has('project')) {
    const extra = extraKey(value, ['project', 'view']);
    if (extra !== undefined)
      return { ok: false, why: `A destination to a project has no "${extra}".` };
    const path = value.project;
    if (typeof path !== 'string') {
      return { ok: false, why: 'The project of a destination is a path, as text.' };
    }
    const why = projectPathProblem(path);
    if (why !== undefined) return { ok: false, why };
    if (value.view !== undefined && !isId(value.view)) {
      return { ok: false, why: 'The view of a destination is named by its id.' };
    }
    return {
      ok: true,
      destination:
        value.view === undefined ? { project: path } : { project: path, view: value.view },
    };
  }
  const extra = extraKey(value, ['view', 'focus']);
  if (extra !== undefined) return { ok: false, why: `A destination to a view has no "${extra}".` };
  if (!isId(value.view)) return { ok: false, why: 'The view of a destination is named by its id.' };
  if (value.focus === undefined) return { ok: true, destination: { view: value.view } };
  const focus = value.focus;
  if (
    !Array.isArray(focus) ||
    focus.length === 0 ||
    focus.length > MAX_DESTINATION_FOCUS ||
    !focus.every(isId) ||
    new Set(focus).size !== focus.length
  ) {
    return {
      ok: false,
      why: `What a destination focuses on is a list of 1 to ${MAX_DESTINATION_FOCUS} different element ids.`,
    };
  }
  return { ok: true, destination: { view: value.view, focus: [...focus] } };
}

/** Whether a value is a destination, as {@link readDestination} reads it. */
export function isDestination(value: unknown): value is Destination {
  return readDestination(value).ok;
}

// Web addresses --------------------------------------------------------------------------------------

/** A label of a host name: letters, digits and hyphens, neither first nor last a hyphen. */
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';

/** The authority of an `https:` address: a host name, IPv4 or IPv6 address, and maybe a port. */
const AUTHORITY = new RegExp(
  `^(?<host>(?:${LABEL}\\.)*${LABEL}|\\[[0-9a-f:.]{2,45}\\])(?::(?<port>\\d{1,5}))?$`,
  'i',
);

/** What no web address a destination holds may have: space, control characters, a backslash. */
// eslint-disable-next-line no-control-regex -- control characters are what it refuses
const NEVER_IN_ADDRESS = /[\s\\\x00-\x1f\x7f]/;

/**
 * The parts of an `https:` web address as browsers read it, or why it is not one a destination holds.
 * Its authority runs to the first `/`, `?` or `#`, and is a host and an optional port only: an address
 * with a user name or a password is refused, since the confirmation could not name its host plainly.
 */
function webAddressParts(url: unknown): { host: string } | { why: string } {
  if (typeof url !== 'string') return { why: 'A web address is text.' };
  if (!url.startsWith('https://')) {
    return {
      why: 'Only web addresses that start with https:// open; file:, javascript: and other schemes never do.',
    };
  }
  if ([...url].length > MAX_WEB_ADDRESS_LENGTH) {
    return { why: `A web address holds at most ${MAX_WEB_ADDRESS_LENGTH} characters.` };
  }
  if (NEVER_IN_ADDRESS.test(url)) {
    return { why: 'A web address holds no spaces, line breaks or backslashes.' };
  }
  const rest = url.slice('https://'.length);
  const end = rest.search(/[/?#]/);
  const authority = end === -1 ? rest : rest.slice(0, end);
  if (authority.includes('@')) {
    return { why: 'A web address with a user name or a password never opens.' };
  }
  const match = AUTHORITY.exec(authority);
  const host = match?.groups?.host;
  if (host === undefined) return { why: `"${authority}" is not the host of a web address.` };
  const port = match?.groups?.port;
  if (port !== undefined && Number(port) > 65_535) {
    return { why: `${port} is not a port: ports go up to 65535.` };
  }
  return { host: host.toLowerCase() };
}

/** Why a value is not a web address a destination holds; nothing when it is one. */
export function webAddressProblem(url: unknown): string | undefined {
  const parts = webAddressParts(url);
  return 'why' in parts ? parts.why : undefined;
}

/**
 * The host of a web address a destination holds, in lowercase, as the confirmation names it before
 * it opens; `undefined` for anything that is not one.
 */
export function webAddressHost(url: string): string | undefined {
  const parts = webAddressParts(url);
  return 'host' in parts ? parts.host : undefined;
}

// Paths to other projects ----------------------------------------------------------------------------

/**
 * Why a path is not one to another project, read lexically: relative to this project's folder,
 * written with `/`, and never leading out of the folder that holds this project's folder. Nothing
 * when it is one. The local program checks the real folder again before it opens anything.
 */
export function projectPathProblem(path: string): string | undefined {
  if (path === '' || [...path].length > MAX_PROJECT_PATH_LENGTH) {
    return `A path to a project has 1 to ${MAX_PROJECT_PATH_LENGTH} characters.`;
  }
  // eslint-disable-next-line no-control-regex -- control characters are what it refuses
  if (/[\x00-\x1f\x7f]/.test(path)) return 'A path to a project holds no control characters.';
  if (path.includes('\\')) return 'A path to a project is written with /, not \\.';
  if (path.startsWith('/') || path.includes(':')) {
    return 'A path to a project is relative to this project’s folder, as ../billing is.';
  }
  let depth = 1;
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    depth += segment === '..' ? -1 : 1;
    if (depth < 0) {
      return 'A path to a project never leads out of the folder that holds this project’s folder.';
    }
  }
  return undefined;
}

/**
 * The folder a path to another project names, worked out against this project's folder, written with
 * `/` and without a trailing one; `undefined` when the path is not one. The result never lies outside
 * the folder holding `folder`.
 */
export function resolveProjectPath(folder: string, path: string): string | undefined {
  if (projectPathProblem(path) !== undefined) return undefined;
  const base = folder.replaceAll('\\', '/').replace(/\/+$/, '');
  const parts = base.split('/');
  // The folder holding this project's folder, which nothing may leave.
  const floor = parts.length - 1;
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length <= floor) return undefined;
      parts.pop();
    } else parts.push(segment);
  }
  return parts.join('/');
}

// Destinations of elements and relations --------------------------------------------------------------

/** A destination an element or a relation has, by the attribute that holds it. */
export interface FoundDestination {
  attribute: string;
  destination: Destination;
  /** Whether the value is its own, rather than its definition's default. */
  own: boolean;
}

/**
 * The destinations an element or a relation has: first, in the order its definitions give their
 * attributes, the values of attributes of type `destination`, its own or else the default, that are
 * destinations; then, in their own order, the values of attributes its definitions do not define that
 * read as destinations, which an element can have without its component defining one. A value of any
 * other attribute is never one.
 */
export function destinationsOf(
  item: { attributes?: Attributes },
  definitions: readonly AttributeDefinition[],
): FoundDestination[] {
  const found: FoundDestination[] = [];
  const values = item.attributes;
  for (const definition of definitions) {
    if (definition.type !== 'destination') continue;
    const own = values !== undefined && Object.hasOwn(values, definition.name);
    const read = readDestination(own ? values[definition.name] : definition.default);
    if (read.ok) found.push({ attribute: definition.name, destination: read.destination, own });
  }
  if (values === undefined) return found;
  for (const name of Object.keys(values)) {
    const value = values[name];
    // Only an object can be one, so the rest is passed by at once.
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    if (definitions.some((definition) => definition.name === name)) continue;
    const read = readDestination(value);
    if (read.ok) found.push({ attribute: name, destination: read.destination, own: true });
  }
  return found;
}
