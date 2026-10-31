/**
 * Solids (ADR 0075): the canonical form's reader, the description worked out from it, the hash that
 * names its file, and the camera's maths that the scene and the solid worker share.
 */
import { problem, type Problem } from '../problems';
import { sha256Bytes } from '../code/hash';
import { describeSolid, type SolidDescription } from './describe';
import { readCanonicalGlb, SolidRefusal } from './glb';

export * from './anchoring';
export * from './caps';
export * from './camera';
export * from './catalog';
// Anchor parts… for solids, and the anchored parts a replacement loses.
export {
  planSolidAnchoring,
  solidAnchoredElements,
  solidAnchoringCommand,
  solidDrawingPartsOf,
  solidDrawnWithParts,
  solidPartsLostByReplacing,
  type IndexedSolidPart,
  type PlannedSolidPart,
  type SolidAnchorPlan,
  type SolidAnchorPlanning,
  type SolidAnchoredElement,
  type SolidDrawingParts,
} from './anchoring';
export { checkSolids } from './check';
export * from './messages';
export { describeSolid, roundLength, type SolidDescription } from './describe';
export {
  readCanonicalGlb,
  readElement,
  SolidRefusal,
  type SolidAccessor,
  type SolidBufferView,
  type SolidDocument,
  type SolidMesh,
  type SolidNode,
} from './glb';

/** What reading a solid's file answers: its description, or the problems that make it not canonical. */
export type SolidReading =
  | { ok: true; description: SolidDescription; hash: string; bytes: number }
  | { ok: false; problems: Problem[] };

/**
 * Reads a solid's file strictly as the canonical form the local program's cleaner writes, and works
 * out its description. Anything else, a GLB the cleaner did not write included, is refused with
 * `invalid-solid`, or `solid-too-large` past a cap. Never throws on bytes.
 */
export function readSolid(bytes: Uint8Array): SolidReading {
  try {
    const document = readCanonicalGlb(bytes);
    const description = describeSolid(document);
    return { ok: true, description, hash: solidHash(bytes), bytes: bytes.length };
  } catch (error) {
    if (error instanceof SolidRefusal) return { ok: false, problems: [error.problem] };
    // Bytes that send the reader past what it checked are refused as well, never thrown.
    return { ok: false, problems: [problem('invalid-solid', 'The file could not be read.')] };
  }
}

/**
 * The SHA-256 of a solid's file, in lowercase hexadecimal, which names it `solids/<hash>.glb`.
 * Synchronous, as `codeHash` is, so that the program and the app agree on it without waiting.
 */
export function solidHash(bytes: Uint8Array): string {
  return sha256Bytes(bytes);
}
