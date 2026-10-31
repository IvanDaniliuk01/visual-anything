/**
 * An element's solid in the inspector (ADR 0075): which solid its shapes show, how, and its
 * description, which is its text alternative, or that it has none; that its image is not drawn when it
 * shows one too; Use this view while the canvas turns it, which is the canvas's own; and, for a
 * drawing with parts, the solid's named parts with the content drawn as each, and Anchor parts….
 */
import {
  definitionsIn,
  imageShownBy,
  solidDrawingPartsOf,
  solidShownBy,
  solidsIn,
  type SolidDrawingParts,
} from '@visual-anything/core';
import type { Element } from '@visual-anything/schema';
import { useId, useState } from 'react';
import { useCanvasTurning } from '../../canvas/solids/turningContext';
import { useEditor } from '../../editor/EditorContext';
import type { Selectable } from '../../editor/selection';
import { useT, type PluralText } from '../../i18n';
import { AnchorPartsDialog } from './AnchorPartsDialog';
import { FirstOnes, SelectButton } from './parts';
import './named-parts.css';

const PART_COUNT: PluralText = {
  one: 'Its solid, “{solid}”, has {count} named part.',
  other: 'Its solid, “{solid}”, has {count} named parts.',
};
const DRAWN_COUNT: PluralText = {
  one: '{count} of them is drawn as a content.',
  other: '{count} of them are drawn as contents.',
};

export function SolidSection({
  element,
  onSelect,
}: {
  element: Element;
  onSelect: (item: Selectable) => void;
}) {
  const t = useT();
  const { project, viewId, send } = useEditor();
  const turning = useCanvasTurning();
  const headingId = useId();
  const [anchoring, setAnchoring] = useState(false);
  const [kept, setKept] = useState<string>();
  const view = project.views.find((each) => each.id === viewId);
  const definitions = definitionsIn(project);
  const shown = solidShownBy(element, definitions);
  const drawn: SolidDrawingParts | undefined =
    shown?.placement === 'parts' ? solidDrawingPartsOf(project, element.id, view) : undefined;
  if (!shown) return null;
  const defined = solidsIn(project).solid(shown.solid)?.definition;
  const showsImage = imageShownBy(element, definitions) !== undefined;
  const turned = turning?.element === element.id;
  const placement =
    shown.placement === 'parts'
      ? t('drawn with its parts')
      : shown.placement === 'icon'
        ? t('as an icon')
        : t('as its drawing');
  const described = defined?.description?.trim() ?? '';
  const drawnCount = drawn?.parts.filter((each) => each.anchor.kind === 'kept').length ?? 0;

  return (
    <section className="inspector-section inspector-solid" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Its solid')}</h4>
      {defined ? (
        <>
          <p className="inspector-notes">
            {t('“{name}”, {placement}.', { name: defined.name, placement })}
          </p>
          {described === '' ? (
            <p className="inspector-notes inspector-warning">
              {t(
                'The solid has no description, so its shapes have no text alternative: add one in the Components tab.',
              )}
            </p>
          ) : (
            <p className="inspector-notes">
              {t('{name}, with a solid: {description}', {
                name: element.name,
                description: described,
              })}
            </p>
          )}
        </>
      ) : (
        <p className="inspector-notes inspector-warning">
          {t(
            'It shows the solid “{id}”, which no package defines, so its image is drawn if it has one.',
            {
              id: shown.solid,
            },
          )}
        </p>
      )}
      {defined && showsImage && (
        <p className="inspector-notes">
          {t('Its image is not drawn: a shape that shows a solid draws the solid instead.')}
        </p>
      )}
      {turned && defined && (
        <>
          <p className="inspector-notes">{t('Its solid turns on the canvas now.')}</p>
          <button
            type="button"
            className="inspector-action"
            disabled={send === undefined}
            onClick={() => {
              setKept(undefined);
              void turning.useThisView().then((done) => {
                setKept(
                  done
                    ? t('Kept this view of {name}.', { name: element.name })
                    : t('It is seen from this view already.'),
                );
              });
            }}
          >
            {t('Use this view')}
          </button>
        </>
      )}
      <p className="visually-hidden" role="status">
        {kept}
      </p>
      {drawn && (
        <>
          <p className="inspector-notes">
            {t(PART_COUNT, { count: drawn.parts.length, solid: drawn.solid.name })}{' '}
            {drawn.parts.length > 0 && t(DRAWN_COUNT, { count: drawnCount })}
          </p>
          {drawn.parts.length > 0 && (
            <FirstOnes
              labelledBy={headingId}
              items={drawn.parts}
              keyOf={(each) => each.part.id}
              many="parts"
              render={({ part, anchor }) => (
                <div className="inspector-part">
                  <span className="inspector-part-id">{part.id}</span>
                  {anchor.kind === 'kept' ? (
                    <SelectButton
                      name={anchor.element.name}
                      detail={t('drawn as it')}
                      onSelect={() => onSelect({ kind: 'element', id: anchor.element.id })}
                    />
                  ) : (
                    <span className="inspector-part-none">{t('Nothing is drawn as it.')}</span>
                  )}
                </div>
              )}
            />
          )}
          {drawn.parts.length > 0 && (
            <button
              type="button"
              className="inspector-action"
              disabled={send === undefined}
              aria-haspopup="dialog"
              onClick={() => setAnchoring(true)}
            >
              {t('Anchor parts…')}
            </button>
          )}
          {anchoring && (
            <AnchorPartsDialog
              drawing={element}
              view={view}
              of="solid"
              onClose={() => setAnchoring(false)}
            />
          )}
        </>
      )}
    </section>
  );
}
