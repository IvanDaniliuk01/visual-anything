import {
  appearanceOf,
  definitionsIn,
  drawingOf,
  modelIndexOf,
  sameColor,
  type Command,
} from '@visual-anything/core';
import type { Element } from '@visual-anything/schema';
import { useMemo, useState, type ReactNode } from 'react';
import { ALIGN_GROUPS, ALIGN_NAMES, alignActions, alignCommand } from '../../canvas/alignActions';
import { indexScene } from '../../canvas/hit';
import {
  STACKING_MOVES,
  STACKING_NAMES,
  restackCommand,
  stackingActions,
} from '../../canvas/stacking';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { isTextPlacement, TEXT_PLACEMENTS } from '../definitions/textPlacements';
import { Field } from '../definitions/Field';
import type { ColorTrait } from './colors';
import { ColorControl, SelectControl } from './controls';
import { FormatPanel } from './FormatPanel';
import { selectionColorCommand, selectionColors } from './recolor';
import { LinesArrange } from './LinesArrange';
import { ShapeArrange } from './ShapeArrange';
import { StyleTraitInput } from './StyleTraitInput';
import { SelectionTextTraits } from './TextSection';
import {
  LINE_STYLE_ROWS,
  SHAPE_STYLE_ROWS,
  elementsStyleCommand,
  lineStyleValues,
  relationsStyleCommand,
  shapeStyleValues,
  sharedValue,
} from './styleTraits';
import { useShownTheme, useStoredColorsShown } from './useShownTheme';

/** What the line rows are called beside the shapes' (ADR 0088). */
const LINE_LABELS: Readonly<Record<string, string>> = {
  width: 'Line width',
  dash: 'Line dash',
  opacity: 'Line opacity (%)',
};

/**
 * The format panel of several selected items (ADR 0088), each change made to all of them as one
 * action. Style: a fill for the elements and notes, a stroke for every element, relation, note and
 * arrow, and the elements' and relations' style; Text: where the elements write their names; Arrange:
 * their stacking order, alignment, spacing and sizes in the open view. Each shows the value they
 * share, or "Mixed" when they differ; a color pick gives each that color of its own, or takes its own
 * back when it would show that color without one.
 */
export function SelectionAppearance() {
  const t = useT();
  const { project, viewId, selection, send, scene } = useEditor();
  const theme = useShownTheme();
  const stored = useStoredColorsShown();
  const disabled = send === undefined;
  const definitions = definitionsIn(project);
  const index = modelIndexOf(project);
  const drawing = drawingOf(project, viewId);
  const elements = [...selection.elements].flatMap((id) => {
    const element = index.element(id);
    return element ? [element] : [];
  });
  const relations = [...selection.relations].flatMap((id) => {
    const relation = index.relation(id);
    return relation ? [relation] : [];
  });
  const rows: { trait: ColorTrait; label: string }[] = [
    { trait: 'fill', label: 'Fill' },
    { trait: 'stroke', label: 'Stroke' },
  ];
  const shown = rows.flatMap(({ trait, label }) => {
    const colors = selectionColors(project, viewId, selection, trait, theme);
    const [first] = colors;
    if (first === undefined) return [];
    // The first shape's color as drawn, where the dark canvas adapts stored colors (ADR 0087).
    const drawn = selectionColors(project, viewId, selection, trait, theme, stored)[0];
    return [{ trait, label, first, colors, drawn }];
  });
  const shapes = Math.max(0, ...shown.map(({ colors }) => colors.length));
  if (shown.length === 0) return null;
  const shapeValues = elements.map((element) =>
    shapeStyleValues(appearanceOf(element, definitions), drawing),
  );
  const lineValues = relations.map((relation) => lineStyleValues(relation, definitions, drawing));

  const style = (
    <>
      {shown.map(({ trait, label, first, colors, drawn }) => (
        <Field
          key={trait}
          label={t(label)}
          note={
            trait === 'fill' && colors.length < shapes
              ? t(
                  {
                    one: 'For the {count} shape with a fill.',
                    other: 'For the {count} shapes with a fill.',
                  },
                  { count: colors.length },
                )
              : undefined
          }
        >
          {({ id, describedBy, send: sendCommand }) => (
            <ColorControl
              id={id}
              label={t(label)}
              value={first}
              mixed={colors.some((color) => !sameColor(color, first))}
              {...(drawn === undefined ? {} : { drawn })}
              disabled={disabled}
              describedBy={describedBy}
              onCommit={(color, { waiting }) => {
                const command = selectionColorCommand(project, viewId, selection, trait, color, {
                  always: waiting,
                  theme,
                });
                return command ? sendCommand(command) : Promise.resolve(true);
              }}
            />
          )}
        </Field>
      ))}
      {elements.length > 0 &&
        SHAPE_STYLE_ROWS.map((row) => {
          const shared = sharedValue(shapeValues.map((values) => values[row.trait]));
          return (
            shared && (
              <StyleField
                key={row.trait}
                label={t(row.label)}
                note={
                  elements.length < shapes
                    ? t(
                        {
                          one: 'For the {count} element selected.',
                          other: 'For the {count} elements selected.',
                        },
                        { count: elements.length },
                      )
                    : undefined
                }
                input={(id, describedBy, sendCommand) => (
                  <StyleTraitInput
                    kind={row.kind}
                    id={id}
                    label={t(row.label)}
                    value={shared.value}
                    mixed={shared.mixed}
                    {...(row.range ? { range: row.range } : {})}
                    disabled={disabled}
                    describedBy={describedBy}
                    onCommit={(value) =>
                      sendOrNothing(
                        sendCommand,
                        elementsStyleCommand(elements, { [row.trait]: value }),
                      )
                    }
                  />
                )}
              />
            )
          );
        })}
      {relations.length > 0 &&
        LINE_STYLE_ROWS.map((row) => {
          const shared = sharedValue(lineValues.map((values) => values[row.trait]));
          const label = t(LINE_LABELS[row.trait] ?? row.label);
          return (
            shared && (
              <StyleField
                key={`line-${row.trait}`}
                label={label}
                input={(id, describedBy, sendCommand) => (
                  <StyleTraitInput
                    kind={row.kind}
                    id={id}
                    label={label}
                    value={shared.value}
                    mixed={shared.mixed}
                    {...(row.range ? { range: row.range } : {})}
                    disabled={disabled}
                    describedBy={describedBy}
                    onCommit={(value) =>
                      sendOrNothing(
                        sendCommand,
                        relationsStyleCommand(relations, { [row.trait]: value }),
                      )
                    }
                  />
                )}
              />
            )
          );
        })}
    </>
  );

  return (
    <FormatPanel
      heading={t(
        { one: 'Appearance of {count} shape', other: 'Appearance of {count} shapes' },
        { count: shapes },
      )}
      style={style}
      text={
        elements.length > 0 ? <SelectionText elements={elements} disabled={disabled} /> : undefined
      }
      arrange={viewId !== undefined && scene !== undefined ? <SelectionArrange /> : undefined}
    />
  );
}

/** Sends a command, or says it was done when there is nothing to send. */
function sendOrNothing(
  send: (command: Command) => Promise<boolean>,
  command: Command | undefined,
): Promise<boolean> {
  return command ? send(command) : Promise.resolve(true);
}

interface StyleFieldProps {
  label: string;
  note?: string | undefined;
  input: (
    id: string,
    describedBy: string | undefined,
    send: (command: Command) => Promise<boolean>,
  ) => ReactNode;
}

/** A labelled Style control of the selection. */
function StyleField({ label, note, input }: StyleFieldProps) {
  return (
    <Field label={label} note={note}>
      {({ id, describedBy, send }) => input(id, describedBy, send)}
    </Field>
  );
}

/**
 * How the selected elements write their names (ADR 0088), and where their text sits, each set on all
 * of them in one action.
 */
function SelectionText({ elements, disabled }: { elements: Element[]; disabled: boolean }) {
  const t = useT();
  const { project } = useEditor();
  const definitions = definitionsIn(project);
  const shared = sharedValue(
    elements.map((element) => appearanceOf(element, definitions).textPlacement),
  );
  if (!shared) return null;
  return (
    <>
      <SelectionTextTraits elements={elements} disabled={disabled} />
      <Field label={t('Where its text sits')}>
        {({ id, describedBy, send }) => (
          <SelectControl
            id={id}
            value={shared.mixed ? '' : shared.value}
            disabled={disabled}
            describedBy={describedBy}
            onCommit={async (placement) => {
              if (!isTextPlacement(placement)) return;
              const command = elementsStyleCommand(elements, { textPlacement: placement });
              if (command) await send(command);
            }}
          >
            {shared.mixed && (
              <option value="" disabled>
                {t('Mixed')}
              </option>
            )}
            {TEXT_PLACEMENTS.map(({ placement, words }) => (
              <option key={placement} value={placement}>
                {t(words)}
              </option>
            ))}
          </SelectControl>
        )}
      </Field>
    </>
  );
}

/**
 * The selection's arrangement in the open view: its stacking order, and aligning, spacing and sizing
 * its shapes alike, as the canvas's menus offer them, each one action.
 */
function SelectionArrange() {
  const t = useT();
  const { project, viewId, scene, selection, send } = useEditor();
  const [message, setMessage] = useState({ text: '', count: 0 });
  // The same index the canvas draws from, since `indexScene` keeps one for each scene.
  const indexed = useMemo(() => {
    try {
      return scene ? indexScene(scene) : undefined;
    } catch {
      return undefined;
    }
  }, [scene]);
  if (!indexed || viewId === undefined) return null;
  const editable = send !== undefined;
  const say = (text: string) => setMessage((before) => ({ text, count: before.count + 1 }));
  const perform = (command: Command, done: string) => {
    if (!send) return;
    void send(command).then(
      (result) => {
        if (result.ok) say(done);
      },
      () => undefined,
    );
  };
  const moves = stackingActions(indexed, project, viewId, selection, editable);
  const aligns = alignActions(indexed, project, viewId, selection, editable);

  return (
    <>
      <ShapeArrange elements={[...selection.elements]} />
      <LinesArrange selection={selection} />
      <div role="group" aria-label={t('Stacking order')} className="inspector-buttons">
        {STACKING_MOVES.map((move) => (
          <button
            key={move}
            type="button"
            className="inspector-action"
            disabled={!moves[move].enabled}
            title={moves[move].description}
            onClick={() => {
              const { command, reason, done } = restackCommand(
                indexed,
                project,
                viewId,
                selection,
                move,
                editable,
              );
              if (command) perform(command, done ?? '');
              else if (reason !== undefined) say(reason);
            }}
          >
            {t(STACKING_NAMES[move])}
          </button>
        ))}
      </div>
      {ALIGN_GROUPS.map((group) => (
        <div
          key={group.join(' ')}
          role="group"
          aria-label={t('Align and size')}
          className="inspector-buttons"
        >
          {group.map((how) => (
            <button
              key={how}
              type="button"
              className="inspector-action"
              disabled={!aligns[how].enabled}
              title={aligns[how].description}
              onClick={() => {
                const aligned = alignCommand(indexed, project, viewId, selection, how);
                if ('command' in aligned) perform(aligned.command, aligned.label);
                else say(aligned.reason);
              }}
            >
              {t(ALIGN_NAMES[how])}
            </button>
          ))}
        </div>
      ))}
      <p role="status" className="visually-hidden">
        {message.text}
        {message.count % 2 === 1 ? ' ' : ''}
      </p>
    </>
  );
}
