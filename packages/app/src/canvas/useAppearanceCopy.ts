import type { ProjectSnapshot } from '@visual-anything/core';
import { useSyncExternalStore } from 'react';
import { t } from '../i18n';
import type { Selection } from '../editor/selection';
import {
  appearanceToCopy,
  copiedAppearance,
  keepCopiedAppearance,
  onCopiedAppearance,
  pasteAppearanceCommand,
  type CopiedAppearance,
} from './appearanceCopy';
import type { SendCommand } from './CanvasArea';

/** What was copied last, kept up to date as copying changes it. */
export function useCopiedAppearance(): CopiedAppearance | undefined {
  return useSyncExternalStore(onCopiedAppearance, copiedAppearance, copiedAppearance);
}

/**
 * Copies the appearance of the one selected element or relation, and gives back what to say: what
 * was copied, or why nothing was.
 */
export function copyAppearanceOf(
  project: ProjectSnapshot,
  selection: Selection,
): { said: string; done: boolean } {
  const found = appearanceToCopy(project, selection);
  if ('reason' in found) return { said: t(found.reason), done: false };
  keepCopiedAppearance(found.copied);
  return {
    said:
      found.copied.name === ''
        ? t('Copied the appearance.')
        : t('Copied the appearance of "{name}".', { name: found.copied.name }),
    done: true,
  };
}

/**
 * Pastes the appearance copied last onto the selection, as one action, and resolves to what to say:
 * what was done, or why nothing was.
 */
export async function pasteAppearanceOnto(
  project: ProjectSnapshot,
  selection: Selection,
  send: SendCommand | undefined,
): Promise<{ said: string; done: boolean }> {
  if (!send) return { said: t('The project cannot be changed now.'), done: false };
  const pasted = pasteAppearanceCommand(project, selection, copiedAppearance());
  if ('reason' in pasted) return { said: t(pasted.reason), done: false };
  try {
    const result = await send(pasted.command);
    return result.ok
      ? { said: `${t.message(pasted.label)}.`, done: true }
      : { said: '', done: false };
  } catch {
    return { said: '', done: false };
  }
}
