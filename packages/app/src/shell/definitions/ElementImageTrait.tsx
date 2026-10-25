import { imageShownBy } from '@visual-anything/core';
import type { Element } from '@visual-anything/schema';
import { useId } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { Mark } from '../inspector/parts';
import { perform } from '../inspector/send';
import { elementImageAction, imageChanges } from './imageCommands';
import { ImageControl } from './ImageControl';

interface ElementImageTraitProps {
  element: Element;
  disabled: boolean;
}

/**
 * The picture one element's shapes show, as a trait of its appearance in the inspector: its
 * component's, or one of its own, which is a particularity, chosen with the image picker. Its own
 * picture goes in one of the project's own packages, with a new one made when there is none.
 */
export function ElementImageTrait({ element, disabled }: ElementImageTraitProps) {
  const t = useT();
  const { project, definitions, send } = useEditor();
  const labelId = useId();
  const markId = useId();
  const own = element.appearance?.image;
  const shown = imageShownBy(element, definitions);
  const off = disabled || send === undefined;
  const setOwn = (image: 'none' | null) =>
    perform(send, {
      type: 'update-element',
      id: element.id,
      changes: { appearanceTraits: imageChanges(image) },
    });

  return (
    <li className="inspector-trait inspector-image-trait">
      <span id={labelId} className="inspector-trait-label">
        {t('Image')}
      </span>
      <span
        className="inspector-trait-control"
        role="group"
        aria-labelledby={labelId}
        aria-describedby={own === undefined ? undefined : markId}
      >
        <ImageControl
          project={project}
          shown={shown}
          disabled={off}
          send={(command) => perform(send, command)}
          actionFor={(choice, options) => elementImageAction(project, element, choice, options)}
        />
        {own !== undefined && (
          <button
            type="button"
            className="inspector-action"
            disabled={off}
            onClick={() => void setOwn(null)}
          >
            {t('Use the component’s image')}
          </button>
        )}
        {own !== 'none' && shown !== undefined && (
          <button
            type="button"
            className="inspector-action"
            disabled={off}
            onClick={() => void setOwn('none')}
          >
            {t('Show no image')}
          </button>
        )}
      </span>
      {own !== undefined && <Mark id={markId} reason={t('its own')} />}
    </li>
  );
}
