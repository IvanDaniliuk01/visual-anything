/**
 * The platform the app runs on, for what differs between them: on Apple platforms ⌘ takes the place
 * of Ctrl in shortcuts, and keys are shown as ⌘, ⌥ and ⇧.
 */

/** Whether a browser's user agent is that of an Apple platform: macOS, an iPhone or an iPad. */
export function isAppleAgent(userAgent: string): boolean {
  return /Mac|iPhone|iPad/.test(userAgent);
}

/** Whether the app runs on an Apple platform. */
export const IS_APPLE = isAppleAgent(navigator.userAgent);
