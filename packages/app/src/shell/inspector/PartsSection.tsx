import { drawingPartsOf, partPicture, type DrawingParts } from '@visual-anything/core';
import type { Element } from '@visual-anything/schema';
import { useId, useMemo, useState } from 'react';
import { useEditor } from '../../editor/EditorContext';
import type { Selectable } from '../../editor/selection';
import { useT, type PluralText } from '../../i18n';
import { ImagePreview } from '../definitions/ImagePreview';
import { AnchorPartsDialog } from './AnchorPartsDialog';
import { FirstOnes, SelectButton } from './parts';
import './named-parts.css';

const PART_COUNT: PluralText = {
  one: 'Its picture, “{image}”, has {count} named part.',
  other: 'Its picture, “{image}”, has {count} named parts.',
};
const DRAWN_COUNT: PluralText = {
  one: '{count} of them is drawn as a content.',
  other: '{count} of them are drawn as contents.',
};

/** The side of a part's preview, in pixels. */
const PREVIEW = 24;

/**
 * The parts of a drawing with parts (ADR 0067): its picture's named parts in document order, each
 * with a preview of its own picture and the content drawn as it, which selects it, or that nothing
 * is; the contents that name a part another one is drawn as, which sit below the picture; and Anchor
 * parts…, which matches parts to contents in one action. Shown only for an element that shows an SVG
 * image with its parts, in the open view's nesting.
 */
export function PartsSection({
  element,
  onSelect,
}: {
  element: Element;
  onSelect: (item: Selectable) => void;
}) {
  const t = useT();
  const { project, viewId, send } = useEditor();
  const headingId = useId();
  const [anchoring, setAnchoring] = useState(false);
  const view = project.views.find((each) => each.id === viewId);
  const drawn: DrawingParts | undefined = useMemo(
    () => drawingPartsOf(project, element.id, view),
    [project, element.id, view],
  );
  if (!drawn) return null;
  const drawnCount = drawn.parts.filter((each) => each.anchor.kind === 'kept').length;
  const nameOf = (id: string) => drawn.contents.find((each) => each.id === id)?.name ?? id;

  return (
    <section className="inspector-section inspector-parts" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Parts')}</h4>
      <p className="inspector-notes">
        {t(PART_COUNT, { count: drawn.parts.length, image: drawn.image.name })}{' '}
        {drawn.parts.length > 0 && t(DRAWN_COUNT, { count: drawnCount })}
      </p>
      {drawn.parts.length > 0 && (
        <FirstOnes
          labelledBy={headingId}
          items={drawn.parts}
          keyOf={(each) => each.part.id}
          many="parts"
          render={({ part, anchor }) => {
            const picture = partPicture(drawn.image.cleaned, part.id);
            return (
              <div className="inspector-part">
                <span className="inspector-part-preview">
                  {picture && <ImagePreview image={picture} size={PREVIEW} />}
                </span>
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
            );
          }}
        />
      )}
      {[...drawn.twins].map(([content, part]) => {
        const holder = drawn.parts.find((each) => each.part.id === part)?.anchor;
        return (
          <p key={content} className="inspector-notes">
            {t(
              '“{name}” names the part “{part}”, which “{other}” is drawn as already, so it sits below the picture.',
              {
                name: nameOf(content),
                part,
                other: holder?.kind === 'kept' ? holder.element.name : '',
              },
            )}
          </p>
        );
      })}
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
        <AnchorPartsDialog drawing={element} view={view} onClose={() => setAnchoring(false)} />
      )}
    </section>
  );
}
