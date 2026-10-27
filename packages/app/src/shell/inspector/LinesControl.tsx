import type { ViewFile } from '@visual-anything/schema';
import { useId } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { SelectControl } from './controls';
import { ROUTE_STYLES, ROUTE_STYLE_NAMES, isRouteStyle, viewLinesCommand } from './routeStyles';
import { perform } from './send';

/**
 * A view's Lines in its inspector (ADR 0069): Orthogonal, Straight or Curved, how the view draws the
 * automatic routes of the relations whose appearances set no style, as one action. Relation types
 * and relations that set one keep it, and routes chosen by hand keep their own.
 */
export function LinesControl({ view }: { view: ViewFile }) {
  const t = useT();
  const { send } = useEditor();
  const controlId = useId();
  const noteId = useId();

  return (
    <div className="inspector-control">
      <label htmlFor={controlId}>{t('Lines')}</label>
      <SelectControl
        id={controlId}
        value={view.routeStyle ?? 'orthogonal'}
        disabled={send === undefined}
        describedBy={noteId}
        onCommit={async (style) => {
          if (!isRouteStyle(style)) return;
          const command = viewLinesCommand(view, style);
          if (command) await perform(send, command);
        }}
      >
        {ROUTE_STYLES.map((style) => (
          <option key={style} value={style}>
            {t(ROUTE_STYLE_NAMES[style])}
          </option>
        ))}
      </SelectControl>
      <p id={noteId} className="inspector-notes">
        {t(
          'How the view draws the automatic routes of relations whose relation type or own appearance sets no style. Routes chosen by hand keep their own.',
        )}
      </p>
    </div>
  );
}
