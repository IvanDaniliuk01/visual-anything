import { appearanceOriginsOf, componentOrEssence, imageShownBy } from '@visual-anything/core';
import type { Element, Id } from '@visual-anything/schema';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { originText } from '../inspector/colors';
import { elementImageAction, imageChanges } from './imageCommands';
import { ImageControl } from './ImageControl';
import { TraitRow } from './TraitRow';

interface ElementImageTraitProps {
  element: Element;
  disabled: boolean;
}

/**
 * The picture one element's shapes show, as a trait of its own appearance in the inspector: its
 * component's, or one of its own, which is a particularity, chosen with the image picker. Its own
 * picture goes in one of the project's own packages, with a new one made when there is none.
 */
export function ElementImageTrait({ element, disabled }: ElementImageTraitProps) {
  const t = useT();
  const { project, definitions, send } = useEditor();
  const own = element.appearance?.image;
  const shown = imageShownBy(element, definitions);
  const origin = appearanceOriginsOf(element, definitions).image;
  const nameOf = (id: Id) => t.definition(id, componentOrEssence(definitions, id).name);
  const off = disabled || send === undefined;
  const setOwn = (image: 'none' | null) => ({
    type: 'update-element' as const,
    id: element.id,
    changes: { appearanceTraits: imageChanges(image) },
  });

  return (
    <TraitRow
      label={t('Image')}
      group
      source={originText(origin, nameOf)}
      own={own !== undefined}
      readOnly={off}
      inherit={() => setOwn(null)}
      inheritLabel={t('Use the component’s image')}
    >
      {({ send: sendTrait, describedBy }) => (
        <>
          <ImageControl
            project={project}
            shown={shown}
            disabled={off}
            describedBy={describedBy}
            send={sendTrait}
            actionFor={(choice, options) => elementImageAction(project, element, choice, options)}
          />
          {own !== 'none' && shown !== undefined && !off && (
            <button
              type="button"
              className="inspector-action"
              onClick={() => void sendTrait(setOwn('none'))}
            >
              {t('Show no image')}
            </button>
          )}
        </>
      )}
    </TraitRow>
  );
}
