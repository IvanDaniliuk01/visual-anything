/**
 * The commands of a view's Rows and of the fading of lines in its inspector (ADR 0080, section 5),
 * each one action with a label of its own.
 */
import type { Command } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';

/** Which rows a view's tables draw (ADR 0080, section 5). */
export type RowsShown = 'all' | 'keys';

/** The command that makes a view's tables draw every row or only key rows; none when they do. */
export function viewRowsCommand(view: ViewFile, rows: RowsShown): Command | undefined {
  if ((view.rows ?? 'all') === rows) return undefined;
  return {
    type: 'batch',
    label:
      rows === 'keys'
        ? `Draw only the key rows in "${view.name}"`
        : `Draw every row in "${view.name}"`,
    commands: [
      { type: 'update-view', id: view.id, changes: { rows: rows === 'keys' ? 'keys' : null } },
    ],
  };
}

/** The command that turns on or off the fading of the lines a selection does not touch in a view. */
export function viewFadesCommand(view: ViewFile, fades: boolean): Command | undefined {
  if ((view.selectionFadesLines ?? true) === fades) return undefined;
  return {
    type: 'batch',
    label: fades
      ? `Fade the other lines when selecting in "${view.name}"`
      : `Keep every line when selecting in "${view.name}"`,
    commands: [
      {
        type: 'update-view',
        id: view.id,
        changes: { selectionFadesLines: fades ? null : false },
      },
    ],
  };
}
