import type { ViewFile } from '@visual-anything/schema';
import { useId } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { CheckboxControl, SelectControl } from './controls';
import { perform } from './send';
import {
  isTravelersShown,
  viewFadesCommand,
  viewRowsCommand,
  viewTravelersCommand,
} from './viewReading';

/**
 * How a view reads many lines, in its inspector (ADR 0080, section 5): whether its tables draw every
 * row or only their key rows, and whether selecting fades the lines the selection does not touch;
 * and whether the pictures its lines send move, stand still or are hidden (ADR 0110). Each change is
 * one action.
 */
export function ReadingControls({ view }: { view: ViewFile }) {
  const t = useT();
  const { send } = useEditor();
  const rowsId = useId();
  const rowsNote = useId();
  const fadesId = useId();
  const fadesNote = useId();
  const travelersId = useId();
  const travelersNote = useId();

  return (
    <>
      <div className="inspector-control">
        <label htmlFor={rowsId}>{t('Rows')}</label>
        <SelectControl
          id={rowsId}
          value={view.rows ?? 'all'}
          disabled={send === undefined}
          describedBy={rowsNote}
          onCommit={async (value) => {
            if (value !== 'all' && value !== 'keys') return;
            const command = viewRowsCommand(view, value);
            if (command) await perform(send, command);
          }}
        >
          <option value="all">{t('Every row')}</option>
          <option value="keys">{t('Key rows only')}</option>
        </SelectControl>
        <p id={rowsNote} className="inspector-notes">
          {t(
            'Key rows are those part of a primary key and those a relation ends on; a table’s header counts the rest.',
          )}
        </p>
      </div>
      <div className="inspector-control">
        <CheckboxControl
          id={fadesId}
          checked={view.selectionFadesLines !== false}
          disabled={send === undefined}
          describedBy={fadesNote}
          onCommit={async (checked) => {
            const command = viewFadesCommand(view, checked);
            if (command) await perform(send, command);
          }}
        />
        <label htmlFor={fadesId}>{t('Fade the other lines when selecting')}</label>
        <p id={fadesNote} className="inspector-notes">
          {t(
            'In a view of more than 40 lines, selecting keeps the lines that touch the selection and draws the others faintly.',
          )}
        </p>
      </div>
      <div className="inspector-control">
        <label htmlFor={travelersId}>{t('Travelers')}</label>
        <SelectControl
          id={travelersId}
          value={view.travelers ?? 'moving'}
          disabled={send === undefined}
          describedBy={travelersNote}
          onCommit={async (value) => {
            if (!isTravelersShown(value)) return;
            const command = viewTravelersCommand(view, value);
            if (command) await perform(send, command);
          }}
        >
          <option value="moving">{t('Moving')}</option>
          <option value="still">{t('Still')}</option>
          <option value="hidden">{t('Hidden')}</option>
        </SelectControl>
        <p id={travelersNote} className="inspector-notes">
          {t(
            'The pictures relations send along their lines. Still, they stand at their spacing; they also stand still when motion is reduced.',
          )}
        </p>
      </div>
    </>
  );
}
