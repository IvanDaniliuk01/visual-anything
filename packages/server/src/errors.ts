/** The code of a Node.js system error, such as `ENOENT` or `EADDRINUSE`. */
export function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

/** A short reason for an error: its code when it has one, otherwise its message. */
export function errorReason(error: unknown): string {
  return errorCode(error) ?? (error instanceof Error ? error.message : String(error));
}
