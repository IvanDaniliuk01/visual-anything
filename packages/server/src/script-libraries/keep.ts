/**
 * Keeping a script library (ADR 0107), once the person approved the registry's addresses: the
 * version's document and its tarball from the npm registry, the tarball checked against the
 * registry's SHA-512 `integrity`, read strictly, the chosen build kept as
 * `script-libraries/<sha256>.js` with the tarball's license text beside it, and the definition the
 * package is to hold. The caller runs `define-script-library` with it, as the program's own command.
 */
import { createHash } from 'node:crypto';
import {
  MAX_SCRIPT_LIBRARIES_BYTES,
  MAX_SCRIPT_LIBRARY_BYTES,
  explorablesIn,
  isId,
  isLicenseId,
  modelIndexOf,
  registryAddresses,
  slug,
  type ProblemCode,
  type ProjectSnapshot,
  type ScriptLibraryAsk,
} from '@visual-anything/core';
import type { ScriptLibraryDefinition } from '@visual-anything/schema';
import { hashOf } from '../solids/files';
import type { WriteOptions } from '../writer';
import { candidatePaths, licenseText, normalizePath, readBuild, type BuildRead } from './build';
import { writeScriptLibraryFile } from './files';
import type { RegistryFetcher } from './registry';
import { TarballRefusal, readTarball, type TarballCaps } from './tarball';

/** What keeping a script library came to. */
export type Kept =
  | { ok: true; library: ScriptLibraryDefinition }
  | { ok: false; code: ProblemCode; message: string };

export interface KeepInput {
  folder: string;
  /** The project as it is when the fetch starts, for the id and the project's cap. */
  state: ProjectSnapshot;
  ask: ScriptLibraryAsk;
  fetcher: RegistryFetcher;
  writer?: WriteOptions;
  tarball?: TarballCaps;
}

const INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/;
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** The most bytes of license text kept beside a library. */
const MAX_LICENSE_BYTES = 1024 * 1024;

/** Fetches, checks and keeps a script library; says what the package is to define, or why not. */
export async function keepScriptLibrary(input: KeepInput): Promise<Kept> {
  const { folder, state, ask, fetcher } = input;
  const { npm, version } = ask;
  const named = `"${npm}" ${version}`;
  const refused = (code: ProblemCode, message: string): Kept => ({ ok: false, code, message });
  const invalid = (why: string) =>
    refused('invalid-script-library', `The script library ${named} is not kept: ${why}.`);
  const addresses = registryAddresses(npm, version);

  const visit = fetcher.visit();
  let document: Record<string, unknown>;
  let tarball: Buffer;
  try {
    const read = await visit.get(addresses.document, 'document');
    if (!read.ok) {
      return refused(
        read.refused ? 'fetch-refused' : 'fetch-failed',
        `The registry's document of ${named} could not be fetched: it ${read.reason}.`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(UTF8.decode(read.bytes));
    } catch {
      return invalid("the registry's document is not JSON");
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return invalid("the registry's document holds no version");
    }
    document = parsed as Record<string, unknown>;
    if (document.name !== npm || document.version !== version) {
      return invalid("the registry's document is of another package or version");
    }
    const dist = document.dist as Record<string, unknown> | undefined;
    const integrity = dist?.integrity;
    if (typeof dist !== 'object' || dist === null || dist.tarball !== addresses.tarball) {
      return refused(
        'fetch-refused',
        `The script library ${named} is not kept: the registry names its tarball somewhere other than ${addresses.tarball}.`,
      );
    }
    if (typeof integrity !== 'string' || !INTEGRITY.test(integrity)) {
      return invalid('the registry gives its tarball no SHA-512 integrity');
    }
    const got = await visit.get(addresses.tarball, 'tarball');
    if (!got.ok) {
      return refused(
        got.refused ? 'fetch-refused' : 'fetch-failed',
        `The tarball of ${named} could not be fetched: it ${got.reason}.`,
      );
    }
    tarball = got.bytes;
    const digest = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
    if (digest !== integrity) {
      return invalid("its tarball does not match the registry's integrity");
    }
  } finally {
    visit.end();
  }

  let files: Map<string, Buffer>;
  try {
    files = await readTarball(tarball, input.tarball);
  } catch (error) {
    if (error instanceof TarballRefusal)
      return invalid(lowerFirst(error.message.replace(/\.$/, '')));
    throw error;
  }

  const chosen = chooseBuild(files, document, ask);
  if (!chosen.ok) {
    return invalid(chosen.reason);
  }
  const { path, bytes, global } = chosen;
  if (bytes.length > MAX_SCRIPT_LIBRARY_BYTES) {
    return refused(
      'script-library-too-large',
      `The script library ${named} is not kept: "${path}" is past 16 MiB.`,
    );
  }
  const hash = hashOf(bytes);
  const id = libraryId(state, ask);
  const total = projectBytes(state, id, hash, bytes.length);
  if (total > MAX_SCRIPT_LIBRARIES_BYTES) {
    return refused(
      'script-library-too-large',
      `The script library ${named} is not kept: the project's script libraries would take more than 128 MiB.`,
    );
  }
  const license = licenseText(files);
  await writeScriptLibraryFile(
    folder,
    hash,
    bytes,
    license === undefined ? undefined : license.subarray(0, MAX_LICENSE_BYTES),
    input.writer,
  );
  const spdx = document.license;
  const library: ScriptLibraryDefinition = {
    id,
    npm,
    version,
    tarball: addresses.tarball,
    integrity: (document.dist as { integrity: string }).integrity,
    path,
    ...(isLicenseId(spdx) ? { license: spdx } : {}),
    global,
    hash,
    bytes: bytes.length,
  };
  return { ok: true, library };
}

/** The build a library keeps: the asker's path, or the first of the document's that is one. */
function chooseBuild(
  files: ReadonlyMap<string, Buffer>,
  document: Record<string, unknown>,
  ask: ScriptLibraryAsk,
): { ok: true; path: string; bytes: Buffer; global: string } | { ok: false; reason: string } {
  const paths = ask.path === undefined ? candidatePaths(document) : [normalizePath(ask.path)];
  let first: Extract<BuildRead, { ok: false }> | undefined;
  for (const path of paths) {
    const bytes = files.get(path);
    if (bytes === undefined) continue;
    if (bytes.length > MAX_SCRIPT_LIBRARY_BYTES) {
      return { ok: false, reason: `"${path}" is past 16 MiB` };
    }
    let text: string;
    try {
      text = UTF8.decode(bytes);
    } catch {
      first ??= { ok: false, kind: 'not-script', reason: `"${path}" is not UTF-8 text` };
      continue;
    }
    const read = readBuild(path, text, {
      npm: ask.npm,
      ...(ask.global === undefined ? {} : { global: ask.global }),
      packageType: document.type,
    });
    if (read.ok) return { ok: true, path, bytes, global: read.global };
    first ??= read;
  }
  if (first === undefined) {
    return {
      ok: false,
      reason:
        ask.path === undefined
          ? 'its package names no file it holds'
          : `its package holds no "${normalizePath(ask.path)}"`,
    };
  }
  if (first.kind === 'module' || first.kind === 'commonjs') {
    return {
      ok: false,
      reason: `${first.reason}; this version of Visual Anything takes only a single-file build that sets a global (UMD or IIFE), and a package with only modules, such as three.js, is not taken yet`,
    };
  }
  return { ok: false, reason: first.reason };
}

/**
 * The id a library takes in its package: the one it has when the package defines this npm package
 * already, whose version it then changes; otherwise the package's id and the npm package's name.
 */
function libraryId(state: ProjectSnapshot, ask: ScriptLibraryAsk): string {
  const catalog = explorablesIn(state);
  const own = state.packages.find((file) => file.id === ask.package);
  const same = own?.scriptLibraries?.find((each) => each.npm === ask.npm);
  if (same !== undefined) return same.id;
  const index = modelIndexOf(state);
  const taken = (id: string) =>
    catalog.scriptLibraries.has(id) ||
    catalog.explorables.has(id) ||
    index.element(id) !== undefined ||
    index.relation(id) !== undefined ||
    state.packages.some(
      (file) =>
        file.id === id ||
        file.components.some((each) => each.id === id) ||
        file.relationTypes.some((each) => each.id === id),
    );
  const base = `${ask.package}.${slug(ask.npm.replace(/^@/, ''), 'library')}`;
  for (let n = 1; ; n += 1) {
    const id = n === 1 ? base : `${base}-${n}`;
    if (isId(id) && !taken(id)) return id;
    if (n > 1000) return `${ask.package}.library-${hashOf(Buffer.from(ask.npm)).slice(0, 8)}`;
  }
}

/** The bytes the project's script libraries would take, each file once by its hash. */
function projectBytes(
  state: ProjectSnapshot,
  replaced: string,
  hash: string,
  bytes: number,
): number {
  const sizes = new Map<string, number>();
  for (const { definition } of explorablesIn(state).scriptLibraries.values()) {
    if (definition.id !== replaced) sizes.set(definition.hash, definition.bytes);
  }
  sizes.set(hash, bytes);
  return [...sizes.values()].reduce((sum, each) => sum + each, 0);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
