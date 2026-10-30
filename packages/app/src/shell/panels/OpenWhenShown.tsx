/**
 * Whatever brings content forward in a collapsed side panel opens it first (ADR 0032's clarification
 * of 2026-10-30): the model panel for the Changes tab, which a list opened in it or a comparison shown
 * on the canvas brings forward, and for the comments, which a pin chosen or a thread opened brings
 * forward; the inspector for a component, relation type or package opened in it for editing. Search
 * shows what it found on the canvas, and brings nothing forward in a panel.
 */
import { useContext, useEffect } from 'react';
import type { ComparisonStore } from '../../canvas/comparison/mode';
import type { CommentsStore } from '../../comments/store';
import type { ChangesStore } from '../../versions/changes/store';
import { DefinitionContext } from '../definitions/opened';
import type { PanelLayoutStore } from './store';

interface OpenWhenShownProps {
  panels: PanelLayoutStore;
  changes: ChangesStore;
  comparisons: ComparisonStore;
  comments: CommentsStore;
}

/** Opens the panels as their content comes forward; rendered inside the shell's definitions. */
export function OpenWhenShown({ panels, changes, comparisons, comments }: OpenWhenShownProps) {
  const definitions = useContext(DefinitionContext);

  useEffect(() => {
    let forward = changes.get().forward;
    return changes.subscribe(() => {
      const now = changes.get().forward;
      if (now > forward) panels.open('model');
      forward = now;
    });
  }, [changes, panels]);

  useEffect(() => {
    let serial = comparisons.get()?.serial;
    return comparisons.subscribe(() => {
      const shown = comparisons.get();
      if (shown !== undefined && shown.serial !== serial) panels.open('model');
      serial = shown?.serial;
    });
  }, [comparisons, panels]);

  useEffect(() => {
    let { shown, open } = comments.getState();
    return comments.subscribe(() => {
      const now = comments.getState();
      if (now.shown !== shown || (now.open !== undefined && now.open !== open)) {
        panels.open('model');
      }
      ({ shown, open } = now);
    });
  }, [comments, panels]);

  useEffect(() => {
    if (definitions === undefined) return undefined;
    let serial = definitions.get()?.serial;
    return definitions.subscribe(() => {
      const opening = definitions.get();
      if (opening !== undefined && opening.serial !== serial) panels.open('inspector');
      serial = opening?.serial;
    });
  }, [definitions, panels]);

  return null;
}
