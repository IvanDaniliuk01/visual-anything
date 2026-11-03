import {
  appearanceOf,
  appearanceOriginsOf,
  componentOrEssence,
  detailText,
  drawingOf,
  drawnColorsOf,
  type AppearanceChanges,
  type Command,
  type Definitions,
  type ModelIndex,
  type ResolvedAppearance,
  type StoredColorsInDark,
  type TraitOrigin,
  type UpdateElementCommand,
} from '@visual-anything/core';
import { ESSENCE_ID, type Element, type Id } from '@visual-anything/schema';
import { useId, useState, type ReactNode } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { t as translate, useT } from '../../i18n';
import { isTextPlacement, TEXT_PLACEMENTS } from '../definitions/textPlacements';
import { ElementImageTrait } from '../definitions/ElementImageTrait';
import { ElementPartTrait } from '../definitions/ElementPartTrait';
import { ElementFaceTrait } from '../definitions/FaceSection';
import { TraitRow } from '../definitions/TraitRow';
import { useSender } from '../definitions/useSender';
import { drawnOnlyAsRows } from './asRow';
import { ColorHints, ScopeChoice } from './colorParts';
import { idsOf, originText, savedIn, shapeHints, wayBack, type ColorTrait } from './colors';
import { ColorControl, InlineProblem, SelectControl } from './controls';
import { detailOf } from './detail';
import { FormatPanel } from './FormatPanel';
import { Detail } from './parts';
import {
  definitionColorCommand,
  definitionShapeCommand,
  elementColorCommand,
  storedAtLevel,
} from './recolor';
import { SHAPES, isShape } from './shapes';
import { StyleTraitInput } from './StyleTraitInput';
import { ElementTextTraits } from './TextSection';
import {
  SHAPE_STYLE_ROWS,
  borderHints,
  borderlessHints,
  componentStyleCommand,
  gradientColorsOf,
  projectDefaultCommand,
  shapeStyleValues,
  storedStyleAt,
  type ShapeStyleTrait,
  type ShapeStyleValues,
} from './styleTraits';
import { useShownTheme, useStoredColorsInDark, useStoredColorsShown } from './useShownTheme';

interface AppearanceSectionProps {
  element: Element;
  index: ModelIndex;
  definitions: Definitions;
  disabled: boolean;
  /** Changes the element with one command; resolves to whether it was done. */
  update: (changes: UpdateElementCommand['changes']) => Promise<boolean>;
  /** What the Arrange tab holds: where the element sits in the open view; none when it draws none. */
  arrange?: ReactNode;
}

/** Where the format panel makes its changes: the element's own appearance, or its component's. */
type Scope = 'element' | 'component';

/**
 * The element's format panel (ADR 0088): how it is drawn, in the tabs Style, Text and Arrange, and
 * where a change of style or text goes: only this element, as a particularity, or every element of
 * its component, at the level the project can change it (ADR-0034). Each trait says where its value
 * comes from, each change is one undoable action, and each sends only the trait it changes, so it
 * never undoes a change to another trait made meanwhile, here or by Claude.
 */
export function AppearanceSection({
  element,
  index,
  definitions,
  disabled,
  update,
  arrange,
}: AppearanceSectionProps) {
  const t = useT();
  const [scope, setScope] = useState<Scope>('element');
  const component = componentOrEssence(definitions, element.component);
  // A component no package defines cannot be given an appearance.
  const known =
    element.component === ESSENCE_ID || definitions.component(element.component) !== undefined;
  const ofComponent = scope === 'component' && known;
  const parts = detailOf(element, index, definitions);
  const written = detailText(parts.filter((part) => part.kind !== 'badge'));
  const badges = parts.filter((part) => part.kind === 'badge').map((part) => part.text);

  return (
    <FormatPanel
      heading={t('Appearance')}
      lead={
        known && (
          <ScopeChoice
            value={scope}
            options={[
              { value: 'element', label: t('Only this element') },
              {
                value: 'component',
                label: t('Every {name}', { name: t.definition(component.id, component.name) }),
              },
            ]}
            onChange={setScope}
          />
        )
      }
      style={
        ofComponent ? (
          <ComponentTraits element={element} definitions={definitions} disabled={disabled} />
        ) : (
          <OwnTraits
            element={element}
            definitions={definitions}
            disabled={disabled}
            update={update}
          />
        )
      }
      text={
        <>
          <ElementTextTraits
            // A new set of rows for each scope, so that a choice on its way is not shown in the other.
            key={`text-${scope}`}
            element={element}
            definitions={definitions}
            disabled={disabled}
            ofComponent={ofComponent}
          />
          <TextPlacementRow
            // A new row for each scope, so that a choice on its way is not shown in the other.
            key={scope}
            element={element}
            definitions={definitions}
            disabled={disabled}
            ofComponent={ofComponent}
          />
          <dl className="details inspector-detail">
            <Detail term={t('Detail')}>
              {written === '' ? t('Nothing under its name') : written}
            </Detail>
            {badges.length > 0 && <Detail term={t('Badges')}>{badges.join(', ')}</Detail>}
          </dl>
        </>
      }
      arrange={arrange}
    />
  );
}

interface TraitsProps {
  element: Element;
  definitions: Definitions;
  disabled: boolean;
}

/** Where a Style trait's value comes from: an appearance, or, where none sets it, drawing defaults. */
function styleSource(
  trait: ShapeStyleTrait,
  appearance: ResolvedAppearance,
  origin: TraitOrigin,
  nameOf: (id: Id) => string,
  self?: Id,
): string {
  const fromDefaults =
    (trait === 'borderWidth' || trait === 'cornerRadius' || trait === 'shadow') &&
    appearance[trait] === undefined;
  return fromDefaults ? translate('from the drawing defaults') : originText(origin, nameOf, self);
}

/** The contrast hints of a shape's colors and style: blending in, and a border no one sees. */
function styleHints(
  colors: Parameters<typeof shapeHints>[0],
  values: ShapeStyleValues,
  storedInDark: StoredColorsInDark,
): string[] {
  const gradientTo = gradientColorsOf(
    values.gradient === 'none' ? undefined : values.gradient.to,
    storedInDark,
  );
  const blending =
    values.borderWidth <= 0 ? borderlessHints(colors, gradientTo) : shapeHints(colors);
  return [...blending, ...borderHints(colors, values.borderWidth)];
}

/** The element's own appearance: shape, fill, stroke and style, each with where it comes from. */
function OwnTraits({
  element,
  definitions,
  disabled,
  update,
}: TraitsProps & { update: AppearanceSectionProps['update'] }) {
  const t = useT();
  const hintId = useId();
  const rowId = useId();
  const [focusShape, setFocusShape] = useState(0);
  const theme = useShownTheme();
  const { project, viewId, scene } = useEditor();
  // A row is a band of its container, in its fill: its shape, stroke, style and size do not show here.
  const asRow = drawnOnlyAsRows(scene, element.id);
  const own = element.appearance ?? {};
  const shown = appearanceOf(element, definitions);
  const values = shapeStyleValues(shown, drawingOf(project, viewId));
  // The colors the canvas draws in the theme shown, stored colors as stored: what a pick changes.
  const drawn = drawnColorsOf(element, definitions, theme);
  // Stored colors adapted on the dark canvas, where the view asks for it (ADR 0087).
  const storedInDark = useStoredColorsInDark();
  const adapted = drawnColorsOf(element, definitions, theme, useStoredColorsShown());
  const origins = appearanceOriginsOf(element, definitions);
  const nameOf = (id: Id) => t.definition(id, componentOrEssence(definitions, id).name);
  const ownTraits = Object.entries(own).filter(([, value]) => value !== undefined);
  const hints = styleHints(
    {
      light: drawnColorsOf(element, definitions, 'light'),
      dark: drawnColorsOf(element, definitions, 'dark', storedInDark),
    },
    values,
    storedInDark,
  );
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
      inheritLabel={t('Use the inherited color')}
    >
      {({ id, describedBy, send }) => (
        <ColorControl
          id={id}
          label={label}
          value={drawn[trait]}
          drawn={adapted[trait]}
          disabled={disabled || (asRow && trait === 'stroke')}
          describedBy={idsOf(
            describedBy,
            asRow && trait === 'stroke' ? rowId : undefined,
            hints.length > 0 ? hintId : undefined,
          )}
          onCommit={(color, { waiting }) => {
            const command = elementColorCommand(element, trait, color, definitions, {
              always: waiting,
              theme,
            });
            return command ? send(command) : Promise.resolve(true);
          }}
        />
      )}
    </TraitRow>
  );

  return (
    <>
      {asRow && (
        <p id={rowId} className="inspector-notes">
          {t(
            'Drawn as a row here: a band as wide as its container, with no border of its own, so its shape, stroke and size apply only where a view draws it as a shape.',
          )}
        </p>
      )}
      <ul className="definition-traits">
        <TraitRow
          label={t('Shape')}
          source={originText(origins.shape, nameOf)}
          own={origins.shape.kind === 'own'}
          readOnly={disabled}
          inherit={() => changing({ shape: null })}
          inheritLabel={t('Use the inherited shape')}
        >
          {({ id, describedBy, send }) => (
            <SelectControl
              id={id}
              value={shown.shape}
              disabled={disabled || asRow}
              describedBy={idsOf(describedBy, asRow ? rowId : undefined)}
              focusRequest={focusShape}
              onCommit={async (shape) => {
                if (isShape(shape)) await send(changing({ shape }));
              }}
            >
              {SHAPES.map(({ shape, name }) => (
                <option key={shape} value={shape}>
                  {t(name)}
                </option>
              ))}
            </SelectControl>
          )}
        </TraitRow>
        {colorRow('fill', t('Fill'))}
        {colorRow('stroke', t('Stroke'))}
        {SHAPE_STYLE_ROWS.map((row) => (
          <TraitRow
            key={row.trait}
            label={t(row.label)}
            source={styleSource(row.trait, shown, origins[row.trait], nameOf)}
            own={origins[row.trait].kind === 'own'}
            readOnly={disabled}
            inherit={() => changing({ [row.trait]: null })}
            group={row.kind === 'gradient'}
          >
            {({ id, describedBy, send }) => (
              <StyleTraitInput
                kind={row.kind}
                id={id}
                label={t(row.label)}
                value={values[row.trait]}
                fill={drawn.fill}
                {...(row.range ? { range: row.range } : {})}
                disabled={disabled || asRow}
                describedBy={idsOf(
                  describedBy,
                  asRow ? rowId : undefined,
                  hints.length > 0 ? hintId : undefined,
                )}
                onCommit={(value) => send(changing({ [row.trait]: value }))}
              />
            )}
          </TraitRow>
        ))}
        <ElementImageTrait element={element} disabled={disabled} />
        <ElementPartTrait element={element} disabled={disabled} />
        <ElementFaceTrait element={element} disabled={disabled} />
      </ul>
      <ColorHints id={hintId} hints={hints} />
      {(own.width !== undefined || own.height !== undefined) && (
        <p className="inspector-notes">
          {t('It also sets its own size: {width} by {height}.', {
            width: own.width ?? shown.width,
            height: own.height ?? shown.height,
          })}
        </p>
      )}
      <ProjectDefault element={element} disabled={disabled} />
      {ownTraits.length > 0 && (
        <button
          type="button"
          className="inspector-action"
          disabled={disabled}
          onClick={() => void reset()}
        >
          {t('Use the component’s appearance')}
        </button>
      )}
    </>
  );
}

/**
 * "Set as the project's default" (ADR 0088): the element's own style and the parts of its text become
 * a project appearance of Essence, so that every shape whose component sets none of them draws them,
 * in one action.
 */
function ProjectDefault({ element, disabled }: { element: Element; disabled: boolean }) {
  const t = useT();
  const noteId = useId();
  const problemId = useId();
  const sender = useSender();
  const command = projectDefaultCommand(element);
  return (
    <div className="inspector-control">
      <button
        type="button"
        className="inspector-action"
        disabled={disabled || command === undefined}
        aria-describedby={idsOf(noteId, sender.problem === undefined ? undefined : problemId)}
        onClick={() => {
          if (command) void sender.send(command);
        }}
      >
        {t('Set as the project’s default')}
      </button>
      <p id={noteId} className="inspector-notes">
        {command === undefined
          ? t(
              'Its gradient, border, corner radius, opacity, shadow and text become the project’s default once it sets one of them itself.',
            )
          : t(
              'Gives every shape the gradient, border, corner radius, opacity, shadow and parts of its text this one sets itself, wherever its component sets none.',
            )}
      </p>
      {sender.problem !== undefined && <InlineProblem id={problemId} text={sender.problem} />}
    </div>
  );
}

/**
 * The appearance of every element of the element's component, at the level the project can change
 * it: the project appearance of a built-in component, kept in the project file, or the component
 * itself, in its package. A change also takes back the element's own value of that trait, so that it
 * follows; other elements with values of their own keep them.
 */
function ComponentTraits({ element, definitions, disabled }: TraitsProps) {
  const t = useT();
  const { project, viewId } = useEditor();
  const hintId = useId();
  const theme = useShownTheme();
  const id = element.component;
  const component = componentOrEssence(definitions, id);
  const shown = component.appearance;
  const values = shapeStyleValues(shown, drawingOf(project, viewId));
  // The component's colors as the canvas draws them in the theme shown: its dark colors in the dark,
  // stored colors as stored; and as drawn there, where the view adapts them (ADR 0087).
  const drawn = drawnColorsOf({ component: id }, definitions, theme);
  const storedInDark = useStoredColorsInDark();
  const adapted = drawnColorsOf({ component: id }, definitions, theme, useStoredColorsShown());
  const stored = (trait: 'shape' | ColorTrait) => storedAtLevel(project, 'component', id, trait);
  const nameOf = (each: Id) => t.definition(each, componentOrEssence(definitions, each).name);
  const own = element.appearance ?? {};
  const hints = styleHints(
    {
      light: drawnColorsOf({ component: id }, definitions, 'light'),
      dark: drawnColorsOf({ component: id }, definitions, 'dark', storedInDark),
    },
    values,
    storedInDark,
  );
  const keeps = (trait: 'shape' | ColorTrait | ShapeStyleTrait, what: string) =>
    own[trait] === undefined
      ? undefined
      : t(
          'This element has a {what} of its own: a change here takes it back, so that it follows.',
          {
            what,
          },
        );
  const color = (trait: ColorTrait, value: string | null, always = false) =>
    definitionColorCommand(project, 'component', id, trait, value, element, { always, theme });

  const colorRow = (trait: ColorTrait, label: string) => (
    <TraitRow
      label={label}
      source={originText(component.origins[trait], nameOf, id)}
      own={stored(trait) !== undefined}
      readOnly={disabled}
      inherit={() => wayBack(color(trait, null))}
      inheritLabel={t('Use the inherited color')}
      note={keeps(trait, label.toLowerCase())}
    >
      {({ id: controlId, describedBy, send }) => (
        <ColorControl
          id={controlId}
          label={label}
          value={drawn[trait]}
          drawn={adapted[trait]}
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
          label={t('Shape')}
          source={originText(component.origins.shape, nameOf, id)}
          own={stored('shape') !== undefined}
          readOnly={disabled}
          inherit={() => wayBack(definitionShapeCommand(project, id, null, element))}
          inheritLabel={t('Use the inherited shape')}
          note={keeps('shape', t('shape'))}
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
                  {t(name)}
                </option>
              ))}
            </SelectControl>
          )}
        </TraitRow>
        {colorRow('fill', t('Fill'))}
        {colorRow('stroke', t('Stroke'))}
        {SHAPE_STYLE_ROWS.map((row) => (
          <TraitRow
            key={row.trait}
            label={t(row.label)}
            source={styleSource(row.trait, shown, component.origins[row.trait], nameOf, id)}
            own={storedStyleAt(project, 'component', id, row.trait) !== undefined}
            readOnly={disabled}
            inherit={() => componentStyleCommand(project, id, { [row.trait]: null }, element)}
            note={keeps(row.trait, t(row.label).toLowerCase())}
            group={row.kind === 'gradient'}
          >
            {({ id: controlId, describedBy, send }) => (
              <StyleTraitInput
                kind={row.kind}
                id={controlId}
                label={t(row.label)}
                value={values[row.trait]}
                fill={drawn.fill}
                {...(row.range ? { range: row.range } : {})}
                disabled={disabled}
                describedBy={idsOf(describedBy, hints.length > 0 ? hintId : undefined)}
                onCommit={(value) =>
                  send(componentStyleCommand(project, id, { [row.trait]: value }, element))
                }
              />
            )}
          </TraitRow>
        ))}
      </ul>
      <ColorHints id={hintId} hints={hints} />
    </>
  );
}

interface TextPlacementRowProps extends TraitsProps {
  /** Whether a change goes to every element of the component. */
  ofComponent: boolean;
}

/**
 * Where the element's shapes place their name and detail (ADR 0082): its own, or its component's at
 * the level the project can change it, which takes back the element's own in the same action.
 */
function TextPlacementRow({ element, definitions, disabled, ofComponent }: TextPlacementRowProps) {
  const t = useT();
  const { project } = useEditor();
  const id = element.component;
  const component = componentOrEssence(definitions, id);
  const nameOf = (each: Id) => t.definition(each, componentOrEssence(definitions, each).name);
  const origins = appearanceOriginsOf(element, definitions);
  const shown = ofComponent
    ? component.appearance.textPlacement
    : appearanceOf(element, definitions).textPlacement;
  const commandFor = (placement: string | null): Command =>
    ofComponent
      ? componentStyleCommand(project, id, { textPlacement: placement as never }, element)
      : {
          type: 'update-element',
          id: element.id,
          changes: { appearanceTraits: { textPlacement: placement as never } },
        };
  return (
    <ul className="definition-traits">
      <TraitRow
        label={t('Where its text sits')}
        source={
          ofComponent
            ? originText(component.origins.textPlacement, nameOf, id)
            : originText(origins.textPlacement, nameOf)
        }
        own={
          ofComponent
            ? storedStyleAt(project, 'component', id, 'textPlacement') !== undefined
            : origins.textPlacement.kind === 'own'
        }
        readOnly={disabled}
        inherit={() => commandFor(null)}
        note={
          ofComponent && element.appearance?.textPlacement !== undefined
            ? t(
                'This element has a {what} of its own: a change here takes it back, so that it follows.',
                { what: t('Where its text sits').toLowerCase() },
              )
            : undefined
        }
      >
        {({ id: controlId, describedBy, send }) => (
          <SelectControl
            id={controlId}
            value={shown}
            disabled={disabled}
            describedBy={describedBy}
            onCommit={async (placement) => {
              if (isTextPlacement(placement)) await send(commandFor(placement));
            }}
          >
            {TEXT_PLACEMENTS.map(({ placement, words }) => (
              <option key={placement} value={placement}>
                {t(words)}
              </option>
            ))}
          </SelectControl>
        )}
      </TraitRow>
    </ul>
  );
}
