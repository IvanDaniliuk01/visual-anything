import {
  componentImage,
  componentSolid,
  imagesIn,
  solidsIn,
  traitSources,
  type AppearanceChanges,
  type Command,
  type TraitPath,
  type UpdateComponentCommand,
} from '@visual-anything/core';
import { ESSENCE_ID, type AppearanceImage, type Id } from '@visual-anything/schema';
import { useId, type Ref } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { readNumber } from '../inspector/attributes';
import { CheckboxControl, SelectControl, TextControl } from '../inspector/controls';
import { Title } from '../inspector/parts';
import { SHAPES, holdsRows, isShape } from '../inspector/shapes';
import { AttributeDefinitionsSection } from './AttributeDefinitionsSection';
import { ColorRow } from './ColorRow';
import { isBuiltInDefinition } from './commands';
import { ConnectionPointsSection } from './ConnectionPointsSection';
import { DetailSection } from './DetailSection';
import { IdentitySection } from './IdentitySection';
import { ExternalIdsSection } from '../../destinations/ExternalIdsSection';
import { perform } from '../inspector/send';
import { componentImageAction } from './imageCommands';
import { ImageControl } from './ImageControl';
import { SolidControl } from './SolidControl';
import { FaceSection } from './FaceSection';
import { LevelsSection } from './LevelsSection';
import { BuiltInNote, Gone, RemoveDefinition } from './parts';
import { ShapeSection } from './ShapeSection';
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
 * The component editor for one component: what it is and derives from, its appearance, detail,
 * connection points and levels of detail, its attributes, and what uses it. Every trait shows where
 * it comes from, and the project's own components change trait by trait, one command for each
 * committed control. Built-in components are read-only and offer to derive one instead, but for
 * their colors and levels of detail, which the project file holds for them.
 */
export function ComponentEditor({ id, titleRef }: ComponentEditorProps) {
  const t = useT();
  const { project, definitions, send } = useEditor();
  const component = definitions.component(id);
  if (!component) {
    return (
      <>
        <Title titleRef={titleRef} name={id} detail={t('Component')} />
        <Gone what={t('the component “{id}”', { id })} />
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
      : t.definition(
          packageId,
          project.packages.find((file) => file.id === packageId)?.name ?? packageId,
        );

  return (
    <>
      <Title
        titleRef={titleRef}
        name={t.definition(id, component.name)}
        detail={builtIn ? t('Built-in component') : t('Component')}
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
      <ExternalIdsSection
        ids={definitions.components.get(id)?.definition.ids}
        disabled={readOnly}
        change={(changes) => perform(send, update({ ids: changes }))}
      />
      <AppearanceTraits id={id} readOnly={readOnly} update={appearance} />
      {/* Free geometry and parts change at the level the project can change, as colors do. */}
      <ShapeSection id={id} />
      <DetailSection id={id} readOnly={readOnly} update={appearance} />
      <ConnectionPointsSection id={id} readOnly={readOnly} update={appearance} />
      {/* Levels change at the level the project can change, so a built-in component's too. */}
      <LevelsSection id={id} />
      {/* A face changes at the level the project can change too (ADR 0083). */}
      <FaceSection id={id} />
      <AttributeDefinitionsSection
        kind="component"
        id={id}
        readOnly={readOnly}
        update={(attributes) => update({ attributes })}
      >
        <OpenAttributesRow id={id} readOnly={readOnly} update={update} />
      </AttributeDefinitionsSection>
      <UsedBySection kind="component" id={id} />
      {!builtIn && <RemoveDefinition kind="component" id={id} />}
    </>
  );
}

interface OpenAttributesRowProps {
  id: Id;
  readOnly: boolean;
  update: (changes: UpdateComponentCommand['changes']) => Command;
}

/**
 * Whether the component has open attributes (ADR 0105): its elements may carry attributes it does not
 * define, on purpose, and the inspector does not mark them as particularities. Inherited from the
 * nearest component of its chain that sets it, until it sets it itself.
 */
function OpenAttributesRow({ id, readOnly, update }: OpenAttributesRowProps) {
  const t = useT();
  const { definitions } = useEditor();
  const lineage = definitions.component(id)?.lineage ?? [id];
  const source =
    lineage.find(
      (each) => definitions.components.get(each)?.definition.openAttributes !== undefined,
    ) ?? ESSENCE_ID;
  return (
    <ul className="definition-traits">
      <TraitRow
        label={t('Its elements may carry attributes it does not define')}
        source={sourceText(definitions, 'component', id, source)}
        own={source === id}
        readOnly={readOnly}
        inherit={() => update({ openAttributes: null })}
      >
        {({ id: controlId, describedBy, send }) => (
          <CheckboxControl
            id={controlId}
            checked={definitions.component(id)?.openAttributes === true}
            disabled={readOnly}
            describedBy={describedBy}
            onCommit={(openAttributes) => send(update({ openAttributes }))}
          />
        )}
      </TraitRow>
    </ul>
  );
}

interface AppearanceTraitsProps {
  id: Id;
  readOnly: boolean;
  update: (changes: ImageChanges) => Command;
}

/** A component's shape, colors, size, image, solid and rows, each with where it comes from. */
function AppearanceTraits({ id, readOnly, update }: AppearanceTraitsProps) {
  const t = useT();
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
  const pictureName =
    image && (imagesIn(project).image(image.image)?.definition.name ?? image.image);
  const imageName =
    image === undefined
      ? t('None')
      : image.placement === 'drawing'
        ? t('{name}, as its drawing', { name: pictureName ?? '' })
        : image.placement === 'parts'
          ? t('{name}, with its parts', { name: pictureName ?? '' })
          : t('{name}, as an icon', { name: pictureName ?? '' });
  const solid = componentSolid(definitions, id);
  const ownSolid = definitions.components.get(id)?.definition.appearance?.solid;
  const solidShownName =
    solid && (solidsIn(project).solid(solid.solid)?.definition.name ?? solid.solid);
  const solidName =
    solid === undefined
      ? t('None')
      : solid.placement === 'parts'
        ? t('{name}, with its parts', { name: solidShownName ?? '' })
        : solid.placement === 'icon'
          ? t('{name}, as an icon', { name: solidShownName ?? '' })
          : t('{name}, as its drawing', { name: solidShownName ?? '' });

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Appearance')}</h4>
      <ul className="definition-traits">
        <TraitRow
          label={t('Shape')}
          {...row('shape')}
          inherit={() => update({ shape: null })}
          note={
            rows
              ? t('While it draws rows, its shapes are a rectangle or a rounded rectangle.')
              : shown.geometry !== undefined || shown.part !== undefined
                ? t('Its free geometry or the part it is drawn as takes the place of this kind.')
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
                  {t(name)}
                </option>
              ))}
            </SelectControl>
          )}
        </TraitRow>
        {/* Colors change at the level the project can change, so a built-in component's too. */}
        <ColorRow kind="component" id={id} trait="fill" label={t('Fill')} hints />
        <ColorRow kind="component" id={id} trait="stroke" label={t('Stroke')} />
        <TraitRow label={t('Width')} {...row('width')} inherit={() => update({ width: null })}>
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
          label={t('Height')}
          {...row('height')}
          inherit={() => update({ height: null })}
          note={rows ? t('Its height follows its rows.') : undefined}
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
        <TraitRow
          label={t('Image')}
          group
          {...row('image')}
          inherit={() => update({ image: null })}
        >
          {({ send, describedBy }) => (
            <>
              <p className="definition-value">{imageName}</p>
              {!readOnly && (
                <ImageControl
                  project={project}
                  shown={image}
                  disabled={readOnly}
                  describedBy={describedBy}
                  send={send}
                  actionFor={(choice, options) =>
                    componentImageAction(project, id, choice, options)
                  }
                />
              )}
              {!readOnly && ownImage !== 'none' && (
                <button
                  type="button"
                  className="inspector-action"
                  onClick={() => void send(update({ image: 'none' }))}
                >
                  {t('Show no image')}
                </button>
              )}
            </>
          )}
        </TraitRow>
        <TraitRow
          label={t('Its solid')}
          group
          {...row('solid')}
          inherit={() => update({ solid: null })}
        >
          {({ send, describedBy }) => (
            <>
              <p className="definition-value">{solidName}</p>
              <SolidControl
                project={project}
                component={id}
                shown={solid}
                ownNone={ownSolid === 'none'}
                showsImage={image !== undefined}
                disabled={readOnly}
                send={send}
                describedBy={describedBy}
              />
            </>
          )}
        </TraitRow>
        <TraitRow
          label={t('Draw what its elements hold as rows')}
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
