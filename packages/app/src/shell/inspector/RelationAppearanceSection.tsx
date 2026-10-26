import {
  drawnRelationAppearanceOf,
  relationAppearanceOriginsOf,
  relationTypeOrRelatesTo,
  type Command,
  type Definitions,
} from '@visual-anything/core';
import { RELATES_TO_ID, type Id, type Relation, type RouteStyle } from '@visual-anything/schema';
import { useId, useState } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { TraitRow } from '../definitions/TraitRow';
import { ColorHints, ScopeChoice } from './colorParts';
import { idsOf, lineHints, originText, savedIn, wayBack } from './colors';
import { ColorControl, SelectControl } from './controls';
import { definitionColorCommand, relationColorCommand, storedAtLevel } from './recolor';
import {
  ROUTE_STYLES,
  ROUTE_STYLE_NAMES,
  ROUTE_STYLE_WORDS,
  inheritedRelationTypeRoute,
  isRouteStyle,
  relationRouteCommand,
  relationTypeRouteCommand,
  storedRelationTypeRoute,
} from './routeStyles';
import { useShownTheme } from './useShownTheme';

interface RelationAppearanceSectionProps {
  relation: Relation;
  definitions: Definitions;
  disabled: boolean;
}

/** Where the section makes its changes: the relation's own appearance, or its relation type's. */
type Scope = 'relation' | 'relation-type';

/**
 * How the relation's line is drawn, and where a change goes: only this relation, as a particularity
 * (ADR-0035), or every relation of its relation type, at the level the project can change it
 * (ADR-0034). Each pick is one undoable action.
 */
export function RelationAppearanceSection({
  relation,
  definitions,
  disabled,
}: RelationAppearanceSectionProps) {
  const t = useT();
  const { project } = useEditor();
  const headingId = useId();
  const hintId = useId();
  const [scope, setScope] = useState<Scope>('relation');
  const theme = useShownTheme();
  const id = relation.relationType;
  const relationType = relationTypeOrRelatesTo(definitions, id);
  const known = id === RELATES_TO_ID || definitions.relationType(id) !== undefined;
  const ofType = scope === 'relation-type' && known;
  const nameOf = (each: Id) => t.definition(each, relationTypeOrRelatesTo(definitions, each).name);
  const stored = storedAtLevel(project, 'relation-type', id, 'stroke');
  const drawn = ofType ? { relationType: id } : relation;
  const hints = lineHints({
    light: drawnRelationAppearanceOf(drawn, definitions, 'light').stroke,
    dark: drawnRelationAppearanceOf(drawn, definitions, 'dark').stroke,
  });
  const origin = ofType
    ? relationType.origins.stroke
    : relationAppearanceOriginsOf(relation, definitions).stroke;
  const own = ofType ? stored !== undefined : origin.kind === 'own';
  // What the canvas draws in the theme shown: a relation type's dark stroke in the dark theme.
  const shown = drawnRelationAppearanceOf(drawn, definitions, theme).stroke;
  const strokeOf = (color: string | null, always = false): Command | undefined =>
    ofType
      ? definitionColorCommand(project, 'relation-type', id, 'stroke', color, relation, {
          always,
          theme,
        })
      : color === null
        ? {
            type: 'update-relation',
            id: relation.id,
            changes: { appearanceTraits: { stroke: null } },
          }
        : relationColorCommand(relation, color, definitions, { always, theme });

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Appearance')}</h4>
      {known && (
        <ScopeChoice
          value={scope}
          options={[
            { value: 'relation', label: t('Only this relation') },
            { value: 'relation-type', label: t('Every {name}', { name: nameOf(id) }) },
          ]}
          onChange={setScope}
        />
      )}
      {ofType && (
        <p className="inspector-notes">{savedIn(project.packages, relationType.package)}</p>
      )}
      <ul className="definition-traits">
        <TraitRow
          // A new row for each scope, so that a pick on its way is not shown in the other.
          key={scope}
          label={t('Stroke')}
          source={originText(origin, nameOf, ofType ? id : undefined)}
          own={own}
          readOnly={disabled}
          inherit={() => wayBack(strokeOf(null))}
          inheritLabel={t('Use the inherited color')}
          note={
            ofType && relation.appearance?.stroke !== undefined
              ? t(
                  'This relation has a stroke of its own: a change here takes it back, so that it follows.',
                )
              : undefined
          }
        >
          {({ id: controlId, describedBy, send }) => (
            <ColorControl
              id={controlId}
              label={t('Stroke')}
              value={shown}
              disabled={disabled}
              describedBy={idsOf(describedBy, hints.length > 0 ? hintId : undefined)}
              onCommit={(color, { waiting }) => {
                const command = strokeOf(color, waiting);
                return command ? send(command) : Promise.resolve(true);
              }}
            />
          )}
        </TraitRow>
        <RouteStyleRow
          // A new row for each scope, so that a choice on its way is not shown in the other.
          key={`route-${scope}`}
          relation={relation}
          definitions={definitions}
          ofType={ofType}
          disabled={disabled}
        />
      </ul>
      <ColorHints id={hintId} hints={hints} />
    </section>
  );
}

interface RouteStyleRowProps {
  relation: Relation;
  definitions: Definitions;
  /** Whether the row changes every relation of the relation type, or only this one. */
  ofType: boolean;
  disabled: boolean;
}

/**
 * The style of the relation's automatic route (ADR 0069): its own, as a particularity, or its
 * relation type's at the level the project can change it, which every view draws it in. Inherited
 * leaves it to the relation type, or to each view's Lines. A choice for the relation type also takes
 * back a style of the relation's own, in the same action, so that it follows.
 */
function RouteStyleRow({ relation, definitions, ofType, disabled }: RouteStyleRowProps) {
  const t = useT();
  const { project } = useEditor();
  const id = relation.relationType;
  const relationType = relationTypeOrRelatesTo(definitions, id);
  const nameOf = (each: Id) => t.definition(each, relationTypeOrRelatesTo(definitions, each).name);
  const ownRoute = relation.appearance?.route;
  const typeRoute = storedRelationTypeRoute(project, id);
  const value = (ofType ? typeRoute : ownRoute) ?? 'inherit';
  const inherited = ofType
    ? inheritedRelationTypeRoute(project, id)
    : relationType.appearance.route;
  const origin = ofType
    ? relationType.origins.route
    : relationAppearanceOriginsOf(relation, definitions).route;
  const commandFor = (route: RouteStyle | null): Command => {
    if (!ofType) return relationRouteCommand(relation.id, route);
    const command = relationTypeRouteCommand(id, route);
    if (ownRoute === undefined) return command;
    return {
      type: 'batch',
      label: `Change the appearance of the relation type "${relationType.name}"`,
      commands: [command, relationRouteCommand(relation.id, null)],
    };
  };

  return (
    <TraitRow
      label={t('Automatic route')}
      source={originText(origin, nameOf, ofType ? id : undefined)}
      own={ofType ? typeRoute !== undefined : ownRoute !== undefined}
      readOnly={disabled}
      note={
        ofType && ownRoute !== undefined
          ? t(
              'This relation has an automatic route of its own: a change here takes it back, so that it follows.',
            )
          : t('Routes chosen by hand in a view keep their own style.')
      }
    >
      {({ id: controlId, describedBy, send }) => (
        <SelectControl
          id={controlId}
          value={value}
          disabled={disabled}
          describedBy={describedBy}
          onCommit={async (next) => {
            if (next === 'inherit') {
              if (value !== 'inherit') await send(commandFor(null));
            } else if (isRouteStyle(next)) {
              await send(commandFor(next));
            }
          }}
        >
          <option value="inherit">
            {inherited === undefined
              ? t('Inherited: as each view draws its lines')
              : t('Inherited ({value})', { value: t(ROUTE_STYLE_WORDS[inherited]) })}
          </option>
          {ROUTE_STYLES.map((style) => (
            <option key={style} value={style}>
              {t(ROUTE_STYLE_NAMES[style])}
            </option>
          ))}
        </SelectControl>
      )}
    </TraitRow>
  );
}
