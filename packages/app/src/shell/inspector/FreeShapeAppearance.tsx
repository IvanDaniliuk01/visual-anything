import { arrowColorOf, noteColorsOf, type ThemeName } from '@visual-anything/core';
import type { Arrow, Color, Note } from '@visual-anything/schema';
import { useId, type ReactNode } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { THEMES } from '../../theme/themes';
import { TraitRow } from '../definitions/TraitRow';
import { ColorHints } from './colorParts';
import { idsOf, lineHints, shapeHints, wayBack, type ColorTrait } from './colors';
import { ColorControl } from './controls';
import { FormatPanel } from './FormatPanel';
import { freeShapeColorCommand } from './recolor';
import { useShownTheme, useStoredColorsInDark, useStoredColorsShown } from './useShownTheme';

/** The colors a note is drawn in, in each theme; its own adapted when asked (ADR 0087). */
function noteColors(note: Note, theme: ThemeName, adapted = false) {
  const { fill, stroke } = noteColorsOf(note, THEMES[theme].canvas, adapted);
  return { fill: fill.color, stroke: stroke.color };
}

/**
 * The colors of a note or a free arrow in the open view: a note's fill and stroke, an arrow's stroke.
 * Without colors of its own, a free shape takes the theme's, in each theme; a color of its own is drawn
 * as stored in both (ADR-0035). Each pick is one `update-free-shape`, and so one undoable action.
 * They are the Style tab of its format panel (ADR 0088); a note's text is its Text tab.
 */
export function FreeShapeAppearance({ shape, text }: { shape: Note | Arrow; text?: ReactNode }) {
  const t = useT();
  const { viewId, send } = useEditor();
  const hintId = useId();
  const SHOWN = THEMES[useShownTheme()].canvas;
  // Its own colors adapted on the dark canvas, where the view asks for it (ADR 0087): the inspector
  // shows the stored color, which a pick changes, with the color drawn beside it.
  const inDark = useStoredColorsInDark() === 'adapted';
  const shownAdapted = useStoredColorsShown() === 'adapted';
  const disabled = send === undefined || viewId === undefined;
  const hints =
    shape.kind === 'note'
      ? shapeHints({ light: noteColors(shape, 'light'), dark: noteColors(shape, 'dark', inDark) })
      : lineHints({
          light: arrowColorOf(shape, THEMES.light.canvas).color,
          dark: arrowColorOf(shape, THEMES.dark.canvas, inDark).color,
        });
  const traits: {
    trait: ColorTrait;
    label: string;
    own: Color | undefined;
    shown: Color;
    drawn: Color;
  }[] =
    shape.kind === 'note'
      ? [
          {
            trait: 'fill',
            label: 'Fill',
            own: shape.fill,
            shown: noteColorsOf(shape, SHOWN).fill.color,
            drawn: noteColorsOf(shape, SHOWN, shownAdapted).fill.color,
          },
          {
            trait: 'stroke',
            label: 'Stroke',
            own: shape.stroke,
            shown: noteColorsOf(shape, SHOWN).stroke.color,
            drawn: noteColorsOf(shape, SHOWN, shownAdapted).stroke.color,
          },
        ]
      : [
          {
            trait: 'stroke',
            label: 'Stroke',
            own: shape.stroke,
            shown: arrowColorOf(shape, SHOWN).color,
            drawn: arrowColorOf(shape, SHOWN, shownAdapted).color,
          },
        ];

  const style = (
    <>
      <ul className="definition-traits">
        {traits.map(({ trait, label, own, shown, drawn }) => (
          <TraitRow
            key={trait}
            label={t(label)}
            source={own === undefined ? t('the theme’s') : t('its own')}
            own={own !== undefined}
            readOnly={disabled}
            inherit={() =>
              wayBack(
                viewId === undefined
                  ? undefined
                  : freeShapeColorCommand(viewId, shape, trait, null, SHOWN),
              )
            }
            inheritLabel={t('Use the theme’s color')}
          >
            {({ id, describedBy, send: sendCommand }) => (
              <ColorControl
                id={id}
                label={t(label)}
                value={shown}
                drawn={drawn}
                disabled={disabled}
                describedBy={idsOf(describedBy, hints.length > 0 ? hintId : undefined)}
                onCommit={(color, { waiting }) => {
                  if (viewId === undefined) return Promise.resolve(false);
                  const command = freeShapeColorCommand(viewId, shape, trait, color, SHOWN, {
                    always: waiting,
                  });
                  return command ? sendCommand(command) : Promise.resolve(true);
                }}
              />
            )}
          </TraitRow>
        ))}
      </ul>
      <ColorHints id={hintId} hints={hints} />
    </>
  );
  return <FormatPanel heading={t('Appearance')} style={style} text={text} />;
}
