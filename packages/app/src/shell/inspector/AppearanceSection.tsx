import {
  appearanceOf,
  appearanceOriginsOf,
  componentOrEssence,
  detailText,
  drawnColorsOf,
  type AppearanceChanges,
  type Command,
  type Definitions,
  type ModelIndex,
  type UpdateElementCommand,
} from '@visual-anything/core';
import { ESSENCE_ID, type Element, type Id } from '@visual-anything/schema';
import { useId, useState } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { ElementImageTrait } from '../definitions/ElementImageTrait';
import { TraitRow } from '../definitions/TraitRow';
import { ColorHints, ScopeChoice } from './colorParts';
import { idsOf, originText, savedIn, shapeHints, wayBack, type ColorTrait } from './colors';
import { ColorControl, SelectControl } from './controls';
import { detailOf } from './detail';
import { Detail } from './parts';
import {
  definitionColorCommand,
  definitionShapeCommand,
  elementColorCommand,
  storedAtLevel,
} from './recolor';
import { SHAPES, isShape } from './shapes';

interface AppearanceSectionProps {
  element: Element;
  index: ModelIndex;
  definitions: Definitions;
  disabled: boolean;
  /** Changes the element with one command; resolves to whether it was done. */
  update: (changes: UpdateElementCommand['changes']) => Promise<boolean>;
}

/** Where the appearance section makes its changes: the element's own appearance, or its component's. */
type Scope = 'element' | 'component';

/**
 * How the element is drawn, and where a change goes: only this element, as a particularity, or every
 * element of its component, at the level the project can change it (ADR-0034). Each trait says where
 * its value comes from, each change is one undoable action, and each sends only the trait it changes,
 * so it never undoes a change to another trait made meanwhile, here or by Claude.
 */
export function AppearanceSection({
  element,
  index,
  definitions,
  disabled,
  update,
}: AppearanceSectionProps) {
  const headingId = useId();
  const [scope, setScope] = useState<Scope>('element');
  const component = componentOrEssence(definitions, element.component);
  // A component no package defines cannot be given an appearance.
  const known =
    element.component === ESSENCE_ID || definitions.component(element.component) !== undefined;
  const parts = detailOf(element, index, definitions);
  const written = detailText(parts.filter((part) => part.kind !== 'badge'));
  const badges = parts.filter((part) => part.kind === 'badge').map((part) => part.text);

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>Appearance</h4>
      {known && (
        <ScopeChoice
          value={scope}
          options={[
            { value: 'element', label: 'Only this element' },
            { value: 'component', label: `Every ${component.name}` },
          ]}
          onChange={setScope}
        />
      )}
      {scope === 'component' && known ? (
        <ComponentTraits element={element} definitions={definitions} disabled={disabled} />
      ) : (
        <OwnTraits
          element={element}
          definitions={definitions}
          disabled={disabled}
          update={update}
        />
      )}
      <dl className="details inspector-detail">
        <Detail term="Detail">{written === '' ? 'Nothing under its name' : written}</Detail>
        {badges.length > 0 && <Detail term="Badges">{badges.join(', ')}</Detail>}
      </dl>
    </section>
  );
}

interface TraitsProps {
  element: Element;
  definitions: Definitions;
  disabled: boolean;
}

/** The element's own appearance: shape, fill and stroke, each with where it comes from. */
function OwnTraits({
  element,
  definitions,
  disabled,
  update,
}: TraitsProps & { update: AppearanceSectionProps['update'] }) {
  const hintId = useId();
  const [focusShape, setFocusShape] = useState(0);
  const own = element.appearance ?? {};
  const shown = appearanceOf(element, definitions);
  const origins = appearanceOriginsOf(element, definitions);
  const nameOf = (id: Id) => componentOrEssence(definitions, id).name;
  const ownTraits = Object.entries(own).filter(([, value]) => value !== undefined);
  const hints = shapeHints({
    light: drawnColorsOf(element, definitions, 'light'),
    dark: drawnColorsOf(element, definitions, 'dark'),
  });
  const changing = (traits: AppearanceChanges): Command => ({
    type: 'update-element',
    id: element.id,
    changes: { appearanceTraits: traits },
  });

  const reset = async () => {
    // The button goes with the element's own appearance: the focus moves to the first trait.
    if (await update({ appearance: null })) setFocusShape((request) => request + 1);
  };

  const colorRow = (trait: ColorTrait, label: string) => (
    <TraitRow
      label={label}
      source={originText(origins[trait], nameOf)}
      own={origins[trait].kind === 'own'}
      readOnly={disabled}
      inherit={() => changing({ [trait]: null })}
      inheritLabel="Use the inherited color"
    >
      {({ id, describedBy, send }) => (
        <ColorControl
          id={id}
          label={label}
          value={shown[trait]}
          disabled={disabled}
          describedBy={idsOf(describedBy, hints.length > 0 ? hintId : undefined)}
          onCommit={(color, { waiting }) => {
            const command = elementColorCommand(element, trait, color, definitions, {
              always: waiting,
            });
            return command ? send(command) : Promise.resolve(true);
          }}
        />
      )}
    </TraitRow>
  );

  return (
    <>
      <ul className="definition-traits">
        <TraitRow
          label="Shape"
          source={originText(origins.shape, nameOf)}
          own={origins.shape.kind === 'own'}
          readOnly={disabled}
          inherit={() => changing({ shape: null })}
          inheritLabel="Use the inherited shape"
        >
          {({ id, describedBy, send }) => (
            <SelectControl
              id={id}
              value={shown.shape}
              disabled={disabled}
              describedBy={describedBy}
              focusRequest={focusShape}
              onCommit={async (shape) => {
                if (isShape(shape)) await send(changing({ shape }));
              }}
            >
              {SHAPES.map(({ shape, name }) => (
                <option key={shape} value={shape}>
                  {name}
                </option>
              ))}
            </SelectControl>
          )}
        </TraitRow>
        {colorRow('fill', 'Fill')}
        {colorRow('stroke', 'Stroke')}
        <ElementImageTrait element={element} disabled={disabled} />
      </ul>
      <ColorHints id={hintId} hints={hints} />
      {(own.width !== undefined || own.height !== undefined) && (
        <p className="inspector-notes">
          It also sets its own size: {own.width ?? shown.width} by {own.height ?? shown.height}.
        </p>
      )}
      {ownTraits.length > 0 && (
        <button
          type="button"
          className="inspector-action"
          disabled={disabled}
          onClick={() => void reset()}
        >
          Use the component’s appearance
        </button>
      )}
    </>
  );
}

/**
 * The appearance of every element of the element's component, at the level the project can change
 * it: the project appearance of a built-in component, kept in the project file, or the component
 * itself, in its package. A change also takes back the element's own value of that trait, so that it
 * follows; other elements with values of their own keep them.
 */
function ComponentTraits({ element, definitions, disabled }: TraitsProps) {
  const { project } = useEditor();
  const hintId = useId();
  const id = element.component;
  const component = componentOrEssence(definitions, id);
  const shown = component.appearance;
  const stored = (trait: 'shape' | ColorTrait) => storedAtLevel(project, 'component', id, trait);
  const nameOf = (each: Id) => componentOrEssence(definitions, each).name;
  const own = element.appearance ?? {};
  const hints = shapeHints({
    light: drawnColorsOf({ component: id }, definitions, 'light'),
    dark: drawnColorsOf({ component: id }, definitions, 'dark'),
  });
  const keeps = (trait: 'shape' | ColorTrait, what: string) =>
    own[trait] === undefined
      ? undefined
      : `This element has a ${what} of its own: a change here takes it back, so that it follows.`;
  const color = (trait: ColorTrait, value: string | null, always = false) =>
    definitionColorCommand(project, 'component', id, trait, value, element, { always });

  const colorRow = (trait: ColorTrait, label: string) => (
    <TraitRow
      label={label}
      source={originText(component.origins[trait], nameOf, id)}
      own={stored(trait) !== undefined}
      readOnly={disabled}
      inherit={() => wayBack(color(trait, null))}
      inheritLabel="Use the inherited color"
      note={keeps(trait, label.toLowerCase())}
    >
      {({ id: controlId, describedBy, send }) => (
        <ColorControl
          id={controlId}
          label={label}
          value={shown[trait]}
          disabled={disabled}
          describedBy={idsOf(describedBy, hints.length > 0 ? hintId : undefined)}
          onCommit={(picked, { waiting }) => {
            const command = color(trait, picked, waiting);
            return command ? send(command) : Promise.resolve(true);
          }}
        />
      )}
    </TraitRow>
  );

  return (
    <>
      <p className="inspector-notes">{savedIn(project.packages, component.package)}</p>
      <ul className="definition-traits">
        <TraitRow
          label="Shape"
          source={originText(component.origins.shape, nameOf, id)}
          own={stored('shape') !== undefined}
          readOnly={disabled}
          inherit={() => wayBack(definitionShapeCommand(project, id, null, element))}
          inheritLabel="Use the inherited shape"
          note={keeps('shape', 'shape')}
        >
          {({ id: controlId, describedBy, send }) => (
            <SelectControl
              id={controlId}
              value={shown.shape}
              disabled={disabled}
              describedBy={describedBy}
              onCommit={async (shape) => {
                if (!isShape(shape)) return;
                // The select sends only a shape it does not show, and may show one on its way.
                const command = definitionShapeCommand(project, id, shape, element, {
                  always: true,
                });
                if (command) await send(command);
              }}
            >
              {SHAPES.map(({ shape, name }) => (
                <option key={shape} value={shape}>
                  {name}
                </option>
              ))}
            </SelectControl>
          )}
        </TraitRow>
        {colorRow('fill', 'Fill')}
        {colorRow('stroke', 'Stroke')}
      </ul>
      <ColorHints id={hintId} hints={hints} />
    </>
  );
}
