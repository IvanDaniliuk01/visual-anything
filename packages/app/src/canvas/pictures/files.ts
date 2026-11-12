/**
 * Where pictures' media files come from (ADR 0098): kept apart, with no import, so that the exports
 * the command line runs in Node name it without loading the canvas.
 */

/**
 * A media file's bytes by its hash, as the program serves them (`media/get`) or the read-only page
 * holds them; `undefined` for a file that is missing or no longer what cleaning writes, which is
 * drawn as a gray box.
 */
export type MediaFiles = ((hash: string) => Promise<Uint8Array | undefined>) & {
  /**
   * Whether a file is held at all, where that is known before asking, as in a read-only page, which
   * leaves out a video past 32 MiB (ADR 0098, stage 2): such a video shows no play mark.
   */
  holds?: (hash: string) => boolean;
};
