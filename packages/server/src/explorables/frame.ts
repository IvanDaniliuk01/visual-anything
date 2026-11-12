/**
 * The frame the explorables' listener serves for an address (ADR 0107): the explorable's text as the
 * project holds it now and the bytes of each of its script libraries' files, built into one document
 * by the core's `buildFrame`, with its policy.
 *
 * It trusts no definition's hash. It hashes the exact text it serves and the exact bytes of each
 * library file it inlines, works the approval hash out from those (`approvalHashOf`), and serves the
 * frame only when that hash is the one the address names and the person's preferences approve it. A
 * definition may say anything: a package brought in from elsewhere names whatever hash it likes.
 */
import {
  FrameRefusal,
  approvalHashOf,
  buildFrame,
  explorableTextHash,
  explorableTextOf,
  explorablesIn,
  isApproved,
  type ExplorableApproval,
  type FrameScriptLibrary,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { hashOf } from '../solids/files';
import type { FrameAnswer } from './listener';
import { readScriptLibraryFile } from '../script-libraries/files';

/** What a frame is built from beside the project: the app's origin and the `va` runtime. */
export interface FrameSources {
  folder: string;
  state: ProjectSnapshot;
  approvals: readonly ExplorableApproval[];
  /** The app's origin, which the frame's `frame-ancestors` names, such as `http://127.0.0.1:47700`. */
  appOrigin: string;
  /** The `va` runtime's script. */
  runtime: string;
}

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** The frame document an address names, or why it is not served. */
export async function explorableFrame(
  sources: FrameSources,
  explorable: Id,
  hash: string,
): Promise<FrameAnswer> {
  const { folder, state, approvals, appOrigin, runtime } = sources;
  const catalog = explorablesIn(state);
  const defined = catalog.explorable(explorable);
  const held = explorableTextOf(state, explorable);
  if (defined === undefined || held === undefined) {
    return { ok: false, status: 404, message: 'The project holds no such explorable to run.' };
  }
  const libraries: FrameScriptLibrary[] = [];
  const libraryHashes: string[] = [];
  for (const id of defined.definition.scriptLibraries ?? []) {
    const library = catalog.scriptLibrary(id);
    // An explorable uses only its own package's script libraries.
    if (library === undefined || library.package !== defined.package) {
      return { ok: false, status: 404, message: `The script library "${id}" is not defined.` };
    }
    const read = await readScriptLibraryFile(folder, library.definition.hash);
    if (!read.ok) {
      return {
        ok: false,
        status: 404,
        message: `The file of the script library "${library.definition.npm}" cannot be read: ${read.message}`,
      };
    }
    let text: string;
    try {
      text = UTF8.decode(read.bytes);
    } catch {
      return { ok: false, status: 404, message: 'A script library’s file is not UTF-8 text.' };
    }
    libraryHashes.push(hashOf(read.bytes));
    libraries.push({ global: library.definition.global, text });
  }
  const approval = approvalHashOf(explorableTextHash(held.text), libraryHashes);
  if (approval !== hash) {
    return {
      ok: false,
      status: 404,
      message: 'The explorable or its script libraries changed: this frame is not theirs now.',
    };
  }
  if (!isApproved(approvals, approval)) {
    return { ok: false, status: 403, message: 'This explorable is not approved as it is now.' };
  }
  try {
    const frame = buildFrame({ text: held.text, scriptLibraries: libraries, runtime, appOrigin });
    return { ok: true, html: frame.html, policy: frame.policy };
  } catch (error) {
    if (error instanceof FrameRefusal) return { ok: false, status: 404, message: error.message };
    throw error;
  }
}
