import { findPart, imagesIn, partPicture, type Command } from '@visual-anything/core';
import type { Id, PartReference } from '@visual-anything/schema';
import { useId, useState } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { SelectControl, TextControl } from '../inspector/controls';
import { ImagePreview } from './ImagePreview';
import { isPartId, namedPartsOf, svgPicturesIn } from './shape';
import type { TraitControl } from './TraitRow';
import './shape.css';

/** The choice of the picture an element's container shows with its parts, which names no image. */
const CONTAINERS = '';

interface PartControlProps {
  /** The named part its shapes are drawn as, wherever it comes from; none when they are drawn as their own. */
  shown: PartReference | undefined;
  /** What the level edited stores: its own part, `none`, or nothing, so that it is inherited. */
  stored: PartReference | 'none' | undefined;
  /**
   * The picture an element's container shows with its parts, in which a part named without a
   * picture is found; none for a component, whose elements may sit in any.
   */
  containerImage?: Id | undefined;
  readOnly: boolean;
  control: TraitControl;
  /** The one command that draws its shapes as this part, or as their own shape with `none`. */
  commandFor: (part: PartReference | 'none') => Command;
}

/** Why a typed part id cannot be used; `undefined` when it can. */
const PART_ID_PROBLEM =
  'A part is named by its id in its picture: a letter or _ first, then letters, digits, _, . or -, 64 at most.';

/**
 * The named part an appearance draws its shapes as (ADR 0067): a part of a picture of the project, or
 * a part found in whichever picture an element's container shows with its parts, with the part's own
 * picture as a preview; and Draw it as its own shape, which sets none. Each choice sends one command.
 */
export function PartControl({
  shown,
  stored,
  containerImage,
  readOnly,
  control,
  commandFor,
}: PartControlProps) {
  const t = useT();
  const { project } = useEditor();
  const pictureId = useId();
  const partId = useId();
  const catalog = imagesIn(project);
  const pictures = svgPicturesIn(project);
  const [picked, setChosen] = useState<Id>(
    shown === undefined ? (pictures[0]?.id ?? CONTAINERS) : (shown.image ?? CONTAINERS),
  );
  // A picture the project no longer has leaves the choice to the container's.
  const chosen = pictures.some((each) => each.id === picked) ? picked : CONTAINERS;
  const found = shown === undefined ? undefined : findPart(shown, catalog, containerImage);
  const own = found === undefined ? undefined : partPicture(found.image, found.part.id);
  const pictureName = (id: Id) => catalog.image(id)?.definition.name ?? id;
  // The parts offered: those of the picture chosen, or of the one the element's container shows.
  const listed = chosen === CONTAINERS ? containerImage : chosen;
  const parts = namedPartsOf(listed === undefined ? undefined : catalog.shown(listed));
  const send = (part: PartReference | 'none') => control.send(commandFor(part));
  const choose = async (part: string) => {
    if (part === '') return;
    await send(chosen === CONTAINERS ? { part } : { part, image: chosen });
  };
  const named = shown !== undefined && (shown.image ?? CONTAINERS) === chosen ? shown.part : '';
  const where = shown?.image ?? containerImage;

  return (
    <div className="part-control">
      <p className="definition-value">
        {shown === undefined
          ? stored === 'none'
            ? t('None: drawn as its own shape, whatever is inherited.')
            : t('None: drawn as its own shape.')
          : shown.image === undefined
            ? t('The part “{part}” of the picture its container shows with its parts', {
                part: shown.part,
              })
            : t('The part “{part}” of “{picture}”', {
                part: shown.part,
                picture: pictureName(shown.image),
              })}
      </p>
      {own && <ImagePreview image={own} size={40} />}
      {shown !== undefined && found === undefined && where !== undefined && (
        <p className="inspector-notes">
          {t('“{picture}” has no part “{part}”, so it is drawn as an ordinary shape.', {
            picture: pictureName(where),
            part: shown.part,
          })}
        </p>
      )}
      {!readOnly && (
        <>
          <div className="inspector-control">
            <label htmlFor={pictureId}>{t('Picture')}</label>
            <select
              id={pictureId}
              value={chosen}
              aria-describedby={control.describedBy}
              onChange={(event) => setChosen(event.target.value)}
            >
              <option value={CONTAINERS}>{t('The one its container shows with its parts')}</option>
              {pictures.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.name}
                </option>
              ))}
            </select>
          </div>
          <div className="inspector-control">
            <label htmlFor={partId}>{t('Named part')}</label>
            {parts.length > 0 ? (
              <SelectControl id={partId} value={named} disabled={readOnly} onCommit={choose}>
                <option value="">{t('Choose a part…')}</option>
                {parts.map((each) => (
                  <option key={each.id} value={each.id}>
                    {each.id}
                  </option>
                ))}
              </SelectControl>
            ) : chosen === CONTAINERS ? (
              <TextControl
                id={partId}
                value={named}
                disabled={readOnly}
                problemOf={(text) => (isPartId(text.trim()) ? undefined : t(PART_ID_PROBLEM))}
                onCommit={(text) => choose(text.trim())}
              />
            ) : (
              <p id={partId} className="inspector-notes">
                {t(
                  'This picture has no named parts. Give its parts ids in the SVG, then replace the picture with it.',
                )}
              </p>
            )}
          </div>
          {shown !== undefined && (
            <button type="button" className="inspector-action" onClick={() => void send('none')}>
              {t('Draw it as its own shape')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
