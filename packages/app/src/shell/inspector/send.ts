import type { Command } from '@visual-anything/core';
import type { SendCommand } from '../../canvas/CanvasArea';

/**
 * Sends one command, and resolves to whether the local program did it. Without `send`, while the
 * project cannot be changed, nothing is sent. A refusal is already shown to the user as a notice.
 */
export async function perform(send: SendCommand | undefined, command: Command): Promise<boolean> {
  if (!send) return false;
  try {
    return (await send(command)).ok;
  } catch {
    return false;
  }
}
