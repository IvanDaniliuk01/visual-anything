import { arrowColorOf, noteColorsOf, type ThemeName } from '@visual-anything/core';
import type { Arrow, Color, Note } from '@visual-anything/schema';
import { useId } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { THEMES } from '../../theme/themes';
import { TraitRow } from '../definitions/TraitRow';
import { ColorHints } from './colorParts';
import { SHOWN_THEME, idsOf, lineHints, shapeHints, wayBack, type ColorTrait } from './colors';
import { ColorControl } from './controls';
import { freeShapeColorCommand } from './recolor';

const SHOWN = THEMES[SHOWN_THEME].canvas;

/** The colors a note is drawn in, in each theme. */
function noteColors(note: Note, theme: ThemeName) {
  const { fill, stroke } = noteColorsOf(note, THEMES[theme].canvas);
  return { fill: fill.color, stroke: stroke.color };
}

/**
 * The colors of a note or a free arrow in the open view: a note's fill and stroke, an arrow's stroke.
 * Without colors of its own, a free shape takes the theme's, in each theme; a color of its own is drawn
 * as stored in both (ADR-0035). Each pick is one `update-free-shape`, and so one undoable action.
 */
export function FreeShapeAppearance({ shape }: { shape: Note | Arrow }) {
  const t = useT();
  const { viewId, send } = useEditor();
  const headingId = useId();
  const hintId = useId();
  const disabled = send === undefined || viewId === undefined;
  const hints =
    shape.kind === 'note'
      ? shapeHints({ light: noteColors(shape, 'light'), dark: noteColors(shape, 'dark') })
      : lineHints({
          light: arrowColorOf(shape, THEMES.light.canvas).color,
          dark: arrowColorOf(shape, THEMES.dark.canvas).color,
        });
  const traits: { trait: ColorTrait; label: string; own: Color | undefined; shown: Color }[] =
    shape.kind === 'note'
      ? [
          {
            trait: 'fill',
            label: 'Fill',
            own: shape.fill,
            shown: noteColorsOf(shape, SHOWN).fill.color,
          },
          {
            trait: 'stroke',
            label: 'Stroke',
            own: shape.stroke,
            shown: noteColorsOf(shape, SHOWN).stroke.color,
          },
        ]
      : [
          {
            trait: 'stroke',
            label: 'Stroke',
            own: shape.stroke,
            shown: arrowColorOf(shape, SHOWN).color,
          },
        ];

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Appearance')}</h4>
      <ul className="definition-traits">
        {traits.map(({ trait, label, own, shown }) => (
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
    </section>
  );
}
