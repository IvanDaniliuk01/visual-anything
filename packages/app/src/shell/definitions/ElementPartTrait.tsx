import { appearanceOf, appearanceOriginsOf, componentOrEssence } from '@visual-anything/core';
import type { Element, Id } from '@visual-anything/schema';
import { useMemo } from 'react';
import { indexScene } from '../../canvas/hit';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { originText } from '../inspector/colors';
import { PartControl } from './PartControl';
import { elementPartCommand } from './shape';
import { TraitRow } from './TraitRow';

interface ElementPartTraitProps {
  element: Element;
  disabled: boolean;
}

/**
 * The named part one element's shapes are drawn as (ADR 0067), as a trait of its own appearance in
 * the inspector: its component's, or one of its own, which is a particularity. A part named without
 * a picture is found in the picture its container shows with its parts in the open view, whose parts
 * are then offered.
 */
export function ElementPartTrait({ element, disabled }: ElementPartTraitProps) {
  const t = useT();
  const { definitions, scene, send } = useEditor();
  const own = element.appearance?.part;
  const shown = appearanceOf(element, definitions).part;
  const origin = appearanceOriginsOf(element, definitions).part;
  const nameOf = (id: Id) => t.definition(id, componentOrEssence(definitions, id).name);
  const off = disabled || send === undefined;
  // The picture the element's container shows with its parts, in the open view, if any.
  const containerImage = useMemo(() => {
    if (!scene) return undefined;
    try {
      const indexed = indexScene(scene);
      const shape = indexed.byElement.get(element.id)?.[0];
      const holder =
        shape?.containerShape === undefined ? undefined : indexed.byKey.get(shape.containerShape);
      return holder?.image?.placement === 'parts' ? holder.image.id : undefined;
    } catch {
      return undefined;
    }
  }, [scene, element.id]);

  return (
    <TraitRow
      label={t('Drawn as a part')}
      group
      source={originText(origin, nameOf)}
      own={own !== undefined}
      readOnly={off}
      inherit={() => elementPartCommand(element.id, null)}
      inheritLabel={t('Use the component’s part')}
    >
      {(control) => (
        <PartControl
          shown={shown}
          stored={own}
          containerImage={containerImage}
          readOnly={off}
          control={control}
          commandFor={(part) => elementPartCommand(element.id, part)}
        />
      )}
    </TraitRow>
  );
}
