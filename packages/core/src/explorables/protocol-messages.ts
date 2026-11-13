/**
 * What the local program and the app say about explorables on the live connection (ADR 0107,
 * protocol version 13), and the frame addresses both build and read:
 *
 * - `explorables/listen`, from an app, answered by `explorables/listening`: the port of the
 *   explorables' listener, which the program starts on first asking, and the nonce made for the
 *   session that every frame's address holds. The nonce is not the session token. The app makes a
 *   fresh label for each frame and builds its address with {@link explorableFrameAddress}; the
 *   listener reads it back with {@link readExplorableFramePath} and serves only an approved frame.
 * - `script-library/consent`, from the program, answered by `script-library/consented`: Claude asks
 *   for a script library, and the person sees the package, its exact version and the registry's two
 *   addresses before any byte is fetched; the program fetches only after `approved: true`.
 * - `script-library/fetch`, from an app: the person asks for one themselves, having seen the same in
 *   the app's own dialog.
 * - `script-library/kept`, from the program, for either: what was kept and its size, once the
 *   `define-script-library` action that names it has run; or `script-library/refused`, and why.
 *
 * An explorable's text travels in the project itself (`explorableTexts`); the approvals are the
 * preference `explorableApprovals`, which `preferences/set` and `preferences/changed` carry; and a
 * file changed outside the app comes as the action "The file of … changed", as any action does.
 * Each reader checks a message strictly, and answers it or why it cannot be read.
 */
import type { Id, ScriptLibraryDefinition } from '@visual-anything/schema';
import { isId } from '../ids';
import type { ProblemCode } from '../problems';

type Read<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface ExplorablesListenMessage {
  type: 'explorables/listen';
  requestId: string;
}

export interface ExplorablesListeningMessage {
  type: 'explorables/listening';
  requestId: string;
  /** The listener's port on 127.0.0.1, reached as `http://<label>.localhost:<port>/`. */
  port: number;
  /** The nonce every frame's address starts with, made for the session. */
  nonce: string;
}

/** Who asks for a script library, as the consent dialog says it. */
export type ScriptLibraryAsker = 'claude' | 'person';

/** A script library as asked for: an npm package at one exact version, for one of the project's packages. */
export interface ScriptLibraryAsk {
  /** The project's own package that is to define it. */
  package: Id;
  /** The npm package, such as `d3` or `@scope/name`. */
  npm: string;
  /** Its exact version. */
  version: string;
  /** The file to keep from the tarball, when the asker chose one; else the package's own build. */
  path?: string;
  /** The global the file sets, when the asker knows it. */
  global?: string;
}

export interface ScriptLibraryConsentMessage extends ScriptLibraryAsk {
  type: 'script-library/consent';
  requestId: string;
  asker: ScriptLibraryAsker;
  /** The registry's addresses the program will read, from {@link registryAddresses}. */
  document: string;
  tarball: string;
  /**
   * The explorables the person approved whose script library this changes, each by its id and name:
   * their package defines a library of that npm package at another version, which the one fetched
   * replaces. Only when Claude asks, and they stay approved, since Claude's change continues their
   * approvals (ADR 0107, A10's review; protocol version 17). Left out when there are none.
   */
  approvedExplorables?: ApprovedExplorable[];
}

/** An approved explorable a consent names: its id, and its name for the dialog to say. */
export interface ApprovedExplorable {
  id: Id;
  name: string;
}

export interface ScriptLibraryConsentedMessage {
  type: 'script-library/consented';
  requestId: string;
  approved: boolean;
}

export interface ScriptLibraryFetchMessage extends ScriptLibraryAsk {
  type: 'script-library/fetch';
  requestId: string;
}

export interface ScriptLibraryKeptMessage {
  type: 'script-library/kept';
  requestId: string;
  /** The script library as its package now defines it. */
  library: ScriptLibraryDefinition;
}

export interface ScriptLibraryRefusedMessage {
  type: 'script-library/refused';
  requestId: string;
  code: ProblemCode;
  message: string;
}

/** The npm registry's addresses for a package's version: its document, and its tarball. */
export function registryAddresses(
  npm: string,
  version: string,
): { document: string; tarball: string } {
  const base = `https://registry.npmjs.org/${npm.replace('/', '%2F')}`;
  const name = npm.includes('/') ? npm.slice(npm.indexOf('/') + 1) : npm;
  return {
    document: `${base}/${version}`,
    tarball: `https://registry.npmjs.org/${npm}/-/${name}-${version}.tgz`,
  };
}

/** How an npm package is named, as `ScriptLibraryDefinition.npm` says. */
export const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
/** An exact version, as `ScriptLibraryDefinition.version` says. */
export const NPM_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
/** The global a script library sets. */
export const LIBRARY_GLOBAL = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;

// ——— Frame addresses ———

/** A frame's label: a fresh one for each frame, so that each is a site of its own. */
export const FRAME_LABEL = /^[a-z0-9]{16,32}$/;
/** The session's nonce, which every frame's path starts with: base64url, 22 to 64 characters. */
export const FRAME_NONCE = /^[A-Za-z0-9_-]{22,64}$/;

const HASH = /^[0-9a-f]{64}$/;

function isPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}

/** What a frame's address names: the explorable and the approval hash of the frame to serve. */
export interface ExplorableFrameAddress {
  label: string;
  port: number;
  nonce: string;
  explorable: Id;
  /** {@link approvalHashOf} the text and libraries the frame is to hold: a changed text is not it. */
  hash: string;
}

/** A frame's address: `http://<label>.localhost:<port>/<nonce>/frame/<explorable>/<hash>`. */
export function explorableFrameAddress(address: ExplorableFrameAddress): string {
  const { label, port, nonce, explorable, hash } = address;
  if (!FRAME_LABEL.test(label) || !isPort(port) || !FRAME_NONCE.test(nonce)) {
    throw new Error('A frame’s address takes a fresh label, the listener’s port and its nonce.');
  }
  if (!isId(explorable) || !HASH.test(hash)) {
    throw new Error('A frame’s address names an explorable by id and its approval hash.');
  }
  return `http://${label}.localhost:${port}/${nonce}/frame/${explorable}/${hash}`;
}

/** Whether a request's `Host` is a frame's: a label of {@link FRAME_LABEL} under `localhost`, on the port. */
export function isFrameHost(host: string | undefined, port: number): boolean {
  if (typeof host !== 'string') return false;
  const match = /^([a-z0-9]+)\.localhost:(\d{1,5})$/.exec(host);
  return match !== null && FRAME_LABEL.test(match[1] as string) && Number(match[2]) === port;
}

/** The explorable and hash a request's path names, under the session's nonce; `undefined` for any other path. */
export function readExplorableFramePath(
  path: string,
  nonce: string,
): { explorable: Id; hash: string } | undefined {
  const parts = path.split('/');
  if (parts.length !== 5 || parts[0] !== '' || parts[1] !== nonce || parts[2] !== 'frame') {
    return undefined;
  }
  const [, , , explorable, hash] = parts as [string, string, string, string, string];
  return isId(explorable) && HASH.test(hash) ? { explorable, hash } : undefined;
}

/** The source the app's own policy allows frames from: every label of the listener's port. */
export function explorableFrameSource(port: number): string {
  if (!isPort(port)) throw new Error('A port is a whole number from 1 to 65535.');
  return `http://*.localhost:${port}`;
}

// ——— Readers ———

const MAX_REQUEST_ID = 100;

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function requestIdOf(message: Record<string, unknown>): string | undefined {
  const { requestId } = message;
  return typeof requestId === 'string' && requestId !== '' && requestId.length <= MAX_REQUEST_ID
    ? requestId
    : undefined;
}

function onlyKeys(message: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(message).every((key) => keys.includes(key));
}

/** Reads `explorables/listen`, from an app. */
export function readExplorablesListen(
  message: Record<string, unknown>,
): Read<ExplorablesListenMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  if (!onlyKeys(message, ['type', 'requestId'])) {
    return fail('explorables/listen holds only its id.');
  }
  return { ok: true, value: { type: 'explorables/listen', requestId } };
}

/** Reads `explorables/listening`, from the program. */
export function readExplorablesListening(
  message: Record<string, unknown>,
): Read<ExplorablesListeningMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The answer has no valid request id.');
  if (!onlyKeys(message, ['type', 'requestId', 'port', 'nonce'])) {
    return fail('explorables/listening holds nothing else.');
  }
  const { port, nonce } = message;
  if (!isPort(port) || typeof nonce !== 'string' || !FRAME_NONCE.test(nonce)) {
    return fail("The explorables' listener is named by its port and the session's nonce.");
  }
  return { ok: true, value: { type: 'explorables/listening', requestId, port, nonce } };
}

function readAsk(message: Record<string, unknown>): Read<ScriptLibraryAsk> {
  const { package: owner, npm, version, path, global } = message;
  if (!isId(owner)) return fail('A script library goes in a package, named by its id.');
  if (typeof npm !== 'string' || npm.length > 214 || !NPM_NAME.test(npm)) {
    return fail('A script library is an npm package, named as the registry names one.');
  }
  if (typeof version !== 'string' || version.length > 100 || !NPM_VERSION.test(version)) {
    return fail('A script library is asked for at one exact version.');
  }
  if (
    path !== undefined &&
    (typeof path !== 'string' ||
      path === '' ||
      path.length > 500 ||
      path.startsWith('/') ||
      path.split('/').some((part) => part === '' || part === '.' || part === '..') ||
      /[\\\0]/.test(path))
  ) {
    return fail("A script library's file is a path inside its package.");
  }
  if (global !== undefined && (typeof global !== 'string' || !LIBRARY_GLOBAL.test(global))) {
    return fail('A script library sets a global named as JavaScript names one.');
  }
  return {
    ok: true,
    value: {
      package: owner,
      npm,
      version,
      ...(path === undefined ? {} : { path }),
      ...(global === undefined ? {} : { global }),
    },
  };
}

/** The most explorables a consent names: as many as one package defines. */
const MAX_APPROVED_NAMED = 64;

/** A consent's approved explorables, each `{ id, name }` once; undefined when they are not. */
function readApproved(value: unknown): ApprovedExplorable[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_APPROVED_NAMED) {
    return undefined;
  }
  const read: ApprovedExplorable[] = [];
  const seen = new Set<Id>();
  for (const each of value as unknown[]) {
    if (typeof each !== 'object' || each === null || Array.isArray(each)) return undefined;
    const { id, name, ...rest } = each as Record<string, unknown>;
    if (Object.keys(rest).length > 0 || !isId(id) || seen.has(id)) return undefined;
    if (typeof name !== 'string' || name === '' || name.length > 200) return undefined;
    seen.add(id);
    read.push({ id, name });
  }
  return read;
}

const ASK_KEYS = ['type', 'requestId', 'package', 'npm', 'version', 'path', 'global'];

/** Reads `script-library/fetch`, from an app. */
export function readScriptLibraryFetch(
  message: Record<string, unknown>,
): Read<ScriptLibraryFetchMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  if (!onlyKeys(message, ASK_KEYS)) {
    return fail(
      'script-library/fetch holds its id, the package, the npm package, its version, a path and a global.',
    );
  }
  const ask = readAsk(message);
  if (!ask.ok) return ask;
  return { ok: true, value: { type: 'script-library/fetch', requestId, ...ask.value } };
}

/** Reads `script-library/consent`, from the program: its addresses must be the registry's own. */
export function readScriptLibraryConsent(
  message: Record<string, unknown>,
): Read<ScriptLibraryConsentMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  if (!onlyKeys(message, [...ASK_KEYS, 'asker', 'document', 'tarball', 'approvedExplorables'])) {
    return fail('script-library/consent holds nothing else.');
  }
  const ask = readAsk(message);
  if (!ask.ok) return ask;
  const { asker, document, tarball, approvedExplorables } = message;
  if (asker !== 'claude' && asker !== 'person') return fail('A request says who asks.');
  const addresses = registryAddresses(ask.value.npm, ask.value.version);
  if (document !== addresses.document || tarball !== addresses.tarball) {
    return fail("A request names the registry's own addresses for the version.");
  }
  const named = approvedExplorables === undefined ? [] : readApproved(approvedExplorables);
  if (approvedExplorables !== undefined && (asker !== 'claude' || named === undefined)) {
    return fail(
      'A request of Claude’s names the approved explorables it changes, each once by its id and name, at most 64.',
    );
  }
  return {
    ok: true,
    value: {
      type: 'script-library/consent',
      requestId,
      asker,
      ...ask.value,
      document,
      tarball,
      ...(named === undefined || named.length === 0 ? {} : { approvedExplorables: named }),
    },
  };
}

/** Reads `script-library/consented`, from an app. */
export function readScriptLibraryConsented(
  message: Record<string, unknown>,
): Read<ScriptLibraryConsentedMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The answer has no valid request id.');
  if (
    !onlyKeys(message, ['type', 'requestId', 'approved']) ||
    typeof message.approved !== 'boolean'
  ) {
    return fail('script-library/consented holds its id and whether the person approved.');
  }
  return {
    ok: true,
    value: { type: 'script-library/consented', requestId, approved: message.approved },
  };
}

/** Reads `script-library/kept`, from the program, by its envelope: the library is the project's. */
export function readScriptLibraryKept(
  message: Record<string, unknown>,
): Read<ScriptLibraryKeptMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The answer has no valid request id.');
  if (!onlyKeys(message, ['type', 'requestId', 'library'])) {
    return fail('script-library/kept holds nothing else.');
  }
  const { library } = message;
  if (
    typeof library !== 'object' ||
    library === null ||
    Array.isArray(library) ||
    !isId((library as { id?: unknown }).id) ||
    typeof (library as { hash?: unknown }).hash !== 'string' ||
    !HASH.test((library as { hash: string }).hash)
  ) {
    return fail('A kept script library is named by its id and hash.');
  }
  return {
    ok: true,
    value: {
      type: 'script-library/kept',
      requestId,
      library: library as ScriptLibraryDefinition,
    },
  };
}

/** Reads `script-library/refused`, from the program. */
export function readScriptLibraryRefused(
  message: Record<string, unknown>,
): Read<ScriptLibraryRefusedMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The answer has no valid request id.');
  if (!onlyKeys(message, ['type', 'requestId', 'code', 'message'])) {
    return fail('script-library/refused holds nothing else.');
  }
  const { code, message: text } = message;
  if (
    typeof code !== 'string' ||
    code.length > 64 ||
    typeof text !== 'string' ||
    text.length > 2000
  ) {
    return fail('A refusal says its code and why.');
  }
  return {
    ok: true,
    value: { type: 'script-library/refused', requestId, code: code as ProblemCode, message: text },
  };
}

// ——— The files of `script-libraries/` no package names (A10.2, protocol 15) ———

/** The most files one removal names. */
export const MAX_SCRIPT_LIBRARY_FILES_REMOVED = 1024;

export interface ScriptLibraryFilesListMessage {
  type: 'script-library-files/list';
  requestId: string;
}

export interface ScriptLibraryFilesRemoveMessage {
  type: 'script-library-files/remove';
  requestId: string;
  /** The files to remove, by their hashes, which name them `script-libraries/<hash>.js`. */
  hashes: string[];
}

/** A file of `script-libraries/` that no package names. */
export interface UnnamedScriptLibraryFileEntry {
  hash: string;
  /** Its size, in bytes. */
  bytes: number;
}

/** A file a removal would not remove, and why. */
export interface KeptScriptLibraryFileEntry {
  hash: string;
  message: string;
}

export interface ScriptLibraryFilesListedMessage {
  type: 'script-library-files/listed';
  requestId: string;
  /** The files no package names now, by hash, in order. */
  files: UnnamedScriptLibraryFileEntry[];
  /** For a removal: the files it removed. */
  removed?: string[];
  /** For a removal: the files it would not remove, and why. */
  kept?: KeptScriptLibraryFileEntry[];
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && HASH.test(value);
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads `script-library-files/list`, from an app. */
export function readScriptLibraryFilesList(
  message: Record<string, unknown>,
): Read<ScriptLibraryFilesListMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  if (!onlyKeys(message, ['type', 'requestId'])) {
    return fail('script-library-files/list holds only its id.');
  }
  return { ok: true, value: { type: 'script-library-files/list', requestId } };
}

/**
 * Reads `script-library-files/remove`, from an app: hashes only, never a path, so that nothing it
 * names can lie outside `script-libraries/`.
 */
export function readScriptLibraryFilesRemove(
  message: Record<string, unknown>,
): Read<ScriptLibraryFilesRemoveMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  if (!onlyKeys(message, ['type', 'requestId', 'hashes'])) {
    return fail(
      'script-library-files/remove holds only its id and the hashes of the files to remove.',
    );
  }
  const { hashes } = message;
  if (
    !Array.isArray(hashes) ||
    hashes.length === 0 ||
    hashes.length > MAX_SCRIPT_LIBRARY_FILES_REMOVED ||
    !hashes.every(isHash)
  ) {
    return fail(
      `A removal names 1 to ${MAX_SCRIPT_LIBRARY_FILES_REMOVED} script library files by their SHA-256, in lowercase hexadecimal.`,
    );
  }
  return {
    ok: true,
    value: { type: 'script-library-files/remove', requestId, hashes: [...new Set(hashes)] },
  };
}

/** Reads `script-library-files/listed`, from the program. */
export function readScriptLibraryFilesListed(
  message: Record<string, unknown>,
): Read<ScriptLibraryFilesListedMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The answer has no valid request id.');
  if (!onlyKeys(message, ['type', 'requestId', 'files', 'removed', 'kept'])) {
    return fail('script-library-files/listed holds nothing else.');
  }
  const { files, removed, kept } = message;
  const isFile = (file: unknown): file is UnnamedScriptLibraryFileEntry =>
    isPlain(file) &&
    isHash(file.hash) &&
    typeof file.bytes === 'number' &&
    Number.isInteger(file.bytes) &&
    file.bytes >= 0;
  if (!Array.isArray(files) || !files.every(isFile)) {
    return fail('The files are listed by their hashes and sizes.');
  }
  if (removed !== undefined && (!Array.isArray(removed) || !removed.every(isHash))) {
    return fail('The files removed are listed by their hashes.');
  }
  const isKept = (each: unknown): each is KeptScriptLibraryFileEntry =>
    isPlain(each) &&
    isHash(each.hash) &&
    typeof each.message === 'string' &&
    each.message.length <= 2000;
  if (kept !== undefined && (!Array.isArray(kept) || !kept.every(isKept))) {
    return fail('The files kept are listed by their hashes, each with why.');
  }
  return {
    ok: true,
    value: {
      type: 'script-library-files/listed',
      requestId,
      files: files.map(({ hash, bytes }) => ({ hash, bytes })),
      ...(removed === undefined ? {} : { removed: [...removed] }),
      ...(kept === undefined
        ? {}
        : { kept: kept.map(({ hash, message: why }) => ({ hash, message: why })) }),
    },
  };
}
