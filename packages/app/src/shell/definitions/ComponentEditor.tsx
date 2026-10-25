import {
  componentImage,
  imagesIn,
  traitSources,
  type AppearanceChanges,
  type Command,
  type TraitPath,
  type UpdateComponentCommand,
} from '@visual-anything/core';
import type { AppearanceImage, Id } from '@visual-anything/schema';
import { useId, type Ref } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { readNumber } from '../inspector/attributes';
import { CheckboxControl, ColorControl, SelectControl, TextControl } from '../inspector/controls';
import { Title } from '../inspector/parts';
import { SHAPES, holdsRows, isShape } from '../inspector/shapes';
import { AttributeDefinitionsSection } from './AttributeDefinitionsSection';
import { isBuiltInDefinition } from './commands';
import { ConnectionPointsSection } from './ConnectionPointsSection';
import { DetailSection } from './DetailSection';
import { IdentitySection } from './IdentitySection';
import { BuiltInNote, Gone, RemoveDefinition } from './parts';
import { TraitRow } from './TraitRow';
import { sizeProblem, sourceText } from './traits';
import { UsedBySection } from './UsedBySection';

/**
 * Changes to an appearance with its image, which the core takes trait by trait like any other; the
 * core's `AppearanceChanges` does not list it yet.
 */
type ImageChanges = AppearanceChanges & { image?: AppearanceImage | 'none' | null };

interface ComponentEditorProps {
  id: Id;
  titleRef: Ref<HTMLHeadingElement>;
}

/**
 * The component editor for one component: what it is and derives from, its appearance, detail and
 * connection points, its attributes, and what uses it. Every trait shows where it comes from, and the
 * project's own components change trait by trait, one command for each committed control. Built-in
 * components are read-only and offer to derive one instead.
 */
export function ComponentEditor({ id, titleRef }: ComponentEditorProps) {
  const { project, definitions, send } = useEditor();
  const component = definitions.component(id);
  if (!component) {
    return (
      <>
        <Title titleRef={titleRef} name={id} detail="Component" />
        <Gone what={`the component “${id}”`} />
      </>
    );
  }
  const builtIn = isBuiltInDefinition(definitions, 'component', id);
  const readOnly = builtIn || send === undefined;
  const update = (changes: UpdateComponentCommand['changes']): Command => ({
    type: 'update-component',
    id,
    changes,
  });
  const appearance = (changes: AppearanceChanges) => update({ appearance: changes });
  const packageId = component.package;
  const packageName =
    packageId === undefined
      ? undefined
      : (project.packages.find((file) => file.id === packageId)?.name ?? packageId);

  return (
    <>
      <Title
        titleRef={titleRef}
        name={component.name}
        detail={builtIn ? 'Built-in component' : 'Component'}
      />
      {builtIn && <BuiltInNote kind="component" id={id} name={component.name} />}
      <IdentitySection
        kind="component"
        id={id}
        name={component.name}
        description={component.description}
        packageName={packageName}
        lineage={component.lineage}
        readOnly={readOnly}
        update={(changes) => update(changes)}
      />
      <AppearanceTraits id={id} readOnly={readOnly} update={appearance} />
      <DetailSection id={id} readOnly={readOnly} update={appearance} />
      <ConnectionPointsSection id={id} readOnly={readOnly} update={appearance} />
      <AttributeDefinitionsSection
        kind="component"
        id={id}
        readOnly={readOnly}
        update={(attributes) => update({ attributes })}
      />
      <UsedBySection kind="component" id={id} />
      {!builtIn && <RemoveDefinition kind="component" id={id} />}
    </>
  );
}

interface AppearanceTraitsProps {
  id: Id;
  readOnly: boolean;
  update: (changes: ImageChanges) => Command;
}

/** A component's shape, colors, size, image and rows, each with where it comes from. */
function AppearanceTraits({ id, readOnly, update }: AppearanceTraitsProps) {
  const { project, definitions } = useEditor();
  const headingId = useId();
  const shown = definitions.component(id)?.appearance;
  if (!shown) return null;
  const sources = traitSources(definitions, id).traits;
  const row = (path: TraitPath) => ({
    source: sourceText(definitions, 'component', id, sources[path]),
    own: sources[path] === id,
    readOnly,
  });
  const rows = shown.contentsAsRows;
  const image = componentImage(definitions, id);
  const ownImage = definitions.components.get(id)?.definition.appearance?.image;
  const imageName =
    image === undefined
      ? 'None'
      : `${imagesIn(project).image(image.image)?.definition.name ?? image.image}, ${
          image.placement === 'drawing' ? 'as its drawing' : 'as an icon'
        }`;

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>Appearance</h4>
      <ul className="definition-traits">
        <TraitRow
          label="Shape"
          {...row('shape')}
          inherit={() => update({ shape: null })}
          note={
            rows
              ? 'While it draws rows, its shapes are a rectangle or a rounded rectangle.'
              : undefined
          }
        >
          {({ id: controlId, describedBy, send }) => (
            <SelectControl
              id={controlId}
              value={shown.shape}
              disabled={readOnly}
              describedBy={describedBy}
              onCommit={async (shape) => {
                if (isShape(shape)) await send(update({ shape }));
              }}
            >
              {SHAPES.map(({ shape, name }) => (
                <option
                  key={shape}
                  value={shape}
                  disabled={rows && !holdsRows(shape) && shape !== shown.shape}
                >
                  {name}
                </option>
              ))}
            </SelectControl>
          )}
        </TraitRow>
        <TraitRow label="Fill" {...row('fill')} inherit={() => update({ fill: null })}>
          {({ id: controlId, describedBy, send }) => (
            <ColorControl
              id={controlId}
              label="Fill"
              value={shown.fill}
              disabled={readOnly}
              describedBy={describedBy}
              onCommit={(fill) => send(update({ fill }))}
            />
          )}
        </TraitRow>
        <TraitRow label="Stroke" {...row('stroke')} inherit={() => update({ stroke: null })}>
          {({ id: controlId, describedBy, send }) => (
            <ColorControl
              id={controlId}
              label="Stroke"
              value={shown.stroke}
              disabled={readOnly}
              describedBy={describedBy}
              onCommit={(stroke) => send(update({ stroke }))}
            />
          )}
        </TraitRow>
        <TraitRow label="Width" {...row('width')} inherit={() => update({ width: null })}>
          {({ id: controlId, describedBy, send }) => (
            <TextControl
              id={controlId}
              value={String(shown.width)}
              inputType="number"
              disabled={readOnly}
              describedBy={describedBy}
              problemOf={sizeProblem}
              onCommit={async (text) => {
                const reading = readNumber(text);
                if (reading.ok) await send(update({ width: reading.value }));
              }}
            />
          )}
        </TraitRow>
        <TraitRow
          label="Height"
          {...row('height')}
          inherit={() => update({ height: null })}
          note={rows ? 'Its height follows its rows.' : undefined}
        >
          {({ id: controlId, describedBy, send }) => (
            <TextControl
              id={controlId}
              value={String(shown.height)}
              inputType="number"
              disabled={readOnly || rows}
              describedBy={describedBy}
              problemOf={sizeProblem}
              onCommit={async (text) => {
                const reading = readNumber(text);
                if (reading.ok) await send(update({ height: reading.value }));
              }}
            />
          )}
        </TraitRow>
        <TraitRow label="Image" group {...row('image')} inherit={() => update({ image: null })}>
          {({ send }) => (
            <>
              <p className="definition-value">{imageName}</p>
              {/*
               * Choosing one of the images packages in use define, or adding one from a file, comes
               * with images on the canvas: it sends `define-image`, then `{ image: { image: id } }`.
               */}
              {!readOnly && ownImage !== 'none' && (
                <button
                  type="button"
                  className="inspector-action"
                  onClick={() => void send(update({ image: 'none' }))}
                >
                  Show no image
                </button>
              )}
            </>
          )}
        </TraitRow>
        <TraitRow
          label="Draw what its elements hold as rows"
          {...row('contentsAsRows')}
          inherit={() => update({ contentsAsRows: null })}
        >
          {({ id: controlId, describedBy, send }) => (
            <CheckboxControl
              id={controlId}
              checked={rows}
              disabled={readOnly}
              describedBy={describedBy}
              onCommit={(contentsAsRows) => send(update({ contentsAsRows }))}
            />
          )}
        </TraitRow>
      </ul>
    </section>
  );
}
