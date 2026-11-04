/**
 * Where pictures' media files come from (ADR 0098): kept apart, with no import, so that the exports
 * the command line runs in Node name it without loading the canvas.
 */

/**
 * A media file's bytes by its hash, as the program serves them (`media/get`) or the read-only page
 * holds them; `undefined` for a file that is missing or no longer what cleaning writes, which is
 * drawn as a gray box.
 */
export type MediaFiles = (hash: string) => Promise<Uint8Array | undefined>;
