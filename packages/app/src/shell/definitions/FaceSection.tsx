import {
  appearanceOf,
  appearanceOriginsOf,
  componentOrEssence,
  drawnColorsOf,
  editableAppearanceOf,
  type ThemeName,
} from '@visual-anything/core';
import type { Element, Id } from '@visual-anything/schema';
import { useCallback, useId, useMemo } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { originText, savedIn } from '../inspector/colors';
import { useStoredColorsInDark } from '../inspector/useShownTheme';
import { isBuiltInDefinition } from './commands';
import { FaceEditor } from './FaceEditor';
import { componentFaceCommand, elementFaceCommand } from './faceDraft';
import { TraitRow } from './TraitRow';
import { nameOf } from './traits';

/**
 * The component editor's Face section (ADR 0083): what its shapes show inside their body, in a
 * subset of HTML and CSS, with its variants, its problems at their lines and a live preview on an
 * element of it, the selected one first. It changes at the level the project can change, as levels
 * do (`set-component-appearance`): a built-in component's goes into the project file. Apply is one
 * command, one undoable action; Use the inherited value takes the face this level sets out.
 */
export function FaceSection({ id }: { id: Id }) {
  const t = useT();
  const { project, definitions, selection, send } = useEditor();
  const headingId = useId();
  const readOnly = send === undefined;
  const component = componentOrEssence(definitions, id);
  // What the level the project can change stores for the component: its package, or the project file.
  const editable = editableAppearanceOf(project, 'component', id)?.appearance;
  const stored = editable !== undefined && 'face' in editable ? editable.face : undefined;
  const elements = useMemo(() => {
    const made = project.model.elements.filter((each) => each.component === id);
    const chosen = made.filter((each) => selection.elements.has(each.id));
    return [...chosen, ...made.filter((each) => !selection.elements.has(each.id))];
  }, [project, id, selection]);
  const attributes = useMemo(
    () => new Set(component.attributes.map((each) => each.name)),
    [component],
  );
  // Stored colors as the dark canvas draws them, adapted where the view asks (ADR 0087).
  const storedInDark = useStoredColorsInDark();
  const colors = useCallback(
    (theme: ThemeName) => drawnColorsOf({ component: id }, definitions, theme, storedInDark),
    [id, definitions, storedInDark],
  );
  const note = isBuiltInDefinition(definitions, 'component', id)
    ? savedIn(project.packages, component.package)
    : undefined;

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Face')}</h4>
      <p className="inspector-notes">
        {t(
          'What its shapes show inside their body, written in a subset of HTML and CSS and filled from each element’s name and attributes. Nothing in it runs or is fetched.',
        )}
      </p>
      <ul className="definition-traits">
        <TraitRow
          label={t('Its face')}
          group
          source={originText(
            component.origins['face.markup'],
            (each) => nameOf(definitions, 'component', each),
            id,
          )}
          own={stored !== undefined}
          readOnly={readOnly}
          inherit={() => componentFaceCommand(id, null)}
          note={note}
        >
          {(control) => (
            <FaceEditor
              shown={component.appearance.face}
              stored={stored}
              attributes={attributes}
              colors={colors}
              appearance={component.appearance}
              elements={elements}
              standIn={t.definition(id, component.name)}
              readOnly={readOnly}
              control={control}
              commandFor={(face) => componentFaceCommand(id, face)}
            />
          )}
        </TraitRow>
      </ul>
    </section>
  );
}

/**
 * One element's face, as a trait of its own appearance in the inspector (ADR 0083): its component's,
 * or one of its own, part by part, which is a particularity of it.
 */
export function ElementFaceTrait({ element, disabled }: { element: Element; disabled: boolean }) {
  const t = useT();
  const { definitions, send } = useEditor();
  const off = disabled || send === undefined;
  const appearance = useMemo(() => appearanceOf(element, definitions), [element, definitions]);
  const origin = appearanceOriginsOf(element, definitions)['face.markup'];
  const attributes = useMemo(() => {
    const component = componentOrEssence(definitions, element.component);
    return new Set([
      ...component.attributes.map((each) => each.name),
      ...Object.keys(element.attributes ?? {}),
    ]);
  }, [definitions, element]);
  // Stored colors as the dark canvas draws them, adapted where the view asks (ADR 0087).
  const storedInDark = useStoredColorsInDark();
  const colors = useCallback(
    (theme: ThemeName) => drawnColorsOf(element, definitions, theme, storedInDark),
    [element, definitions, storedInDark],
  );
  const elements = useMemo(() => [element], [element]);

  return (
    <TraitRow
      label={t('Face')}
      group
      source={originText(origin, (each) =>
        t.definition(each, componentOrEssence(definitions, each).name),
      )}
      own={element.appearance?.face !== undefined}
      readOnly={off}
      inherit={() => elementFaceCommand(element.id, null)}
      inheritLabel={t('Use the component’s face')}
    >
      {(control) => (
        <FaceEditor
          shown={appearance.face}
          stored={element.appearance?.face}
          attributes={attributes}
          colors={colors}
          appearance={appearance}
          elements={elements}
          standIn={element.name}
          readOnly={off}
          control={control}
          commandFor={(face) => elementFaceCommand(element.id, face)}
        />
      )}
    </TraitRow>
  );
}
