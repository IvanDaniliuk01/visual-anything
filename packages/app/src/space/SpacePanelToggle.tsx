/**
 * Physical space, in the canvas toolbar (ADR 0076): opens the panel beside the canvas for the open
 * view, or closes it, as Alt+Shift+P does. It shows pressed while the panel is open, and goes under
 * More with its group when the toolbar's row has no room. Outside the shell there is no panel, and no
 * button.
 */
import { useContext } from 'react';
import { OverflowButton } from '../canvas/ToolbarMore';
import { EditorContext } from '../editor/EditorContext';
import { useT } from '../i18n';
import { useSpacePanel, useSpacePanelState } from './context';
import { SPACE_PANEL_SHORTCUT, SPACE_PANEL_SHORTCUT_SHOWN } from './keys';

export function SpacePanelToggle() {
  const t = useT();
  const store = useSpacePanel();
  const viewId = useContext(EditorContext)?.viewId;
  const open = useSpacePanelState(store, viewId) !== undefined;
  if (!store || viewId === undefined) return null;
  return (
    <OverflowButton
      group="space"
      type="button"
      className="space-panel-toggle"
      aria-pressed={open}
      aria-keyshortcuts={SPACE_PANEL_SHORTCUT}
      title={t('{name} ({shortcut})', {
        name: t(open ? 'Close the physical-space panel' : 'Open the physical-space panel'),
        shortcut: SPACE_PANEL_SHORTCUT_SHOWN,
      })}
      onClick={() => store.toggle(viewId)}
    >
      {t('Physical space')}
    </OverflowButton>
  );
}
