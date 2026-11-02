/**
 * The physical-space panel's tools (ADR 0076), under its bar: what reads, Fit, Frame the selection
 * and Show on the canvas, and what poses, the handles' Move and Rotate, Place in physical space and
 * Take out of physical space, each of these last two one `set-poses` and so one undoable action. The
 * panel edits poses and nothing else. While the project cannot be changed, what poses is disabled;
 * where nothing can ever be changed, as in the read-only page, it is not there at all.
 */
import { modelIndexOf, type ProjectSnapshot, type Space } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEditor } from '../editor/EditorContext';
import { useT } from '../i18n';
import type { SpaceControl } from './control';
import { handleTargetOf } from './drag';
import { placeable, placeCommand, removable, takeOutCommand } from './place';
import { posingHint } from './posingHint';
import type { HandleMode } from './useSpaceInteraction';

interface SpaceToolsProps {
  project: ProjectSnapshot;
  space: Space;
  control: SpaceControl;
  mode: HandleMode;
  setMode: (mode: HandleMode) => void;
  say: (text: string) => void;
  /** Whether nothing can ever be changed here, as in the read-only page: then only what reads shows. */
  readOnly?: boolean | undefined;
}

export function SpaceTools({
  project,
  space,
  control,
  mode,
  setMode,
  say,
  readOnly = false,
}: SpaceToolsProps) {
  const t = useT();
  const editor = useEditor();
  const { selection, send, scene } = editor;
  const index = modelIndexOf(project);
  const nameOf = (id: Id) => index.element(id)?.name ?? id;
  const editable = send !== undefined;
  const inSpace = [...selection.elements].filter(
    (element) => space.entries.has(element) || space.faint.has(element),
  );
  const toPlace = placeable(project, space, selection.elements);
  const toTakeOut = removable(space, selection.elements);
  const moves = editable && handleTargetOf(space, selection.elements) !== undefined;
  const hintKey = editable
    ? posingHint(space, selection.elements, moves || toPlace.length > 0 || toTakeOut.length > 0)
    : undefined;
  const hint = hintKey === undefined ? undefined : t(hintKey);
  const onCanvas = [...selection.elements]
    .map((element) => scene?.shapes.find((shape) => shape.element === element)?.key)
    .find((key) => key !== undefined);

  const place = async () => {
    const target = control.camera()?.target ?? { x: 0, y: 0, z: 0 };
    const placed = placeCommand(project, space, toPlace, target);
    if (!placed || !send) return;
    const result = await send(placed.command).catch(() => ({ ok: false }));
    if (!result.ok) return;
    const [first] = placed.placed;
    if (placed.placed.length > 1 || !first) {
      say(t('Placed {count} elements in physical space.', { count: placed.placed.length }));
    } else if (first.shown) {
      say(
        t('Placed “{name}” in physical space, in {container}.', {
          name: nameOf(first.element),
          container: nameOf(first.in),
        }),
      );
    } else {
      say(
        t('Placed “{name}” in World, which this panel does not show.', {
          name: nameOf(first.element),
        }),
      );
    }
  };

  const takeOut = async () => {
    const command = takeOutCommand(toTakeOut);
    if (!command || !send) return;
    const result = await send(command).catch(() => ({ ok: false }));
    if (!result.ok) return;
    const [first] = toTakeOut;
    say(
      toTakeOut.length === 1 && first !== undefined
        ? t('Took “{name}” out of physical space.', { name: nameOf(first) })
        : t('Took {count} elements out of physical space.', { count: toTakeOut.length }),
    );
  };

  return (
    <div className="space-panel-tools" role="toolbar" aria-label={t('Physical space tools')}>
      <button
        type="button"
        className="space-panel-tool"
        title={t('Fit everything (0)')}
        onClick={() => void control.fit()}
      >
        {t('Fit')}
      </button>
      <button
        type="button"
        className="space-panel-tool"
        title={t('Frame the selection (Enter)')}
        disabled={inSpace.length === 0}
        onClick={() => void control.fit(inSpace)}
      >
        {t('Frame')}
      </button>
      <button
        type="button"
        className="space-panel-tool"
        disabled={onCanvas === undefined}
        onClick={() => onCanvas !== undefined && editor.reveal(onCanvas)}
      >
        {t('Show on the canvas')}
      </button>
      {!readOnly && (
        <>
          <span className="space-panel-tools-gap" />
          <button
            type="button"
            className="space-panel-tool"
            aria-pressed={mode === 'move'}
            title={hint ?? t('Move with the handles (M)')}
            disabled={!moves}
            onClick={() => setMode('move')}
          >
            {t('Move')}
          </button>
          <button
            type="button"
            className="space-panel-tool"
            aria-pressed={mode === 'rotate'}
            title={hint ?? t('Rotate with the handles (R)')}
            disabled={!moves}
            onClick={() => setMode('rotate')}
          >
            {t('Rotate')}
          </button>
          <button
            type="button"
            className="space-panel-tool"
            title={hint}
            disabled={!editable || toPlace.length === 0}
            onClick={() => void place()}
          >
            {t('Place in physical space')}
          </button>
          <button
            type="button"
            className="space-panel-tool"
            title={hint}
            disabled={!editable || toTakeOut.length === 0}
            onClick={() => void takeOut()}
          >
            {t('Take out of physical space')}
          </button>
          {hint !== undefined && (
            <p className="space-panel-tools-hint" aria-live="polite">
              {hint}
            </p>
          )}
        </>
      )}
    </div>
  );
}
