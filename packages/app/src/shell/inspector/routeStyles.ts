/**
 * The styles of automatic routes (ADR 0069): what the controls call them, and the commands that
 * choose one for a relation type, at the level the project can change, for one relation, as a
 * particularity, and for a view's Lines. Pure, so that what each choice sends can be tested without
 * the panels; each choice is one command, and so one undoable action.
 */
import {
  definitionsIn,
  editableAppearanceOf,
  isBuiltInDefinition,
  relationTypeOrRelatesTo,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { RELATES_TO_ID, type Id, type RouteStyle, type ViewFile } from '@visual-anything/schema';

/** The styles, in the order the controls offer them. */
export const ROUTE_STYLES: readonly RouteStyle[] = ['orthogonal', 'straight', 'curved'];

/** What each style is called as a choice. */
export const ROUTE_STYLE_NAMES: Readonly<Record<RouteStyle, string>> = {
  orthogonal: 'Orthogonal',
  straight: 'Straight',
  curved: 'Curved',
};

/** What each style is called inside a sentence, as in "Inherited (curved)". */
export const ROUTE_STYLE_WORDS: Readonly<Record<RouteStyle, string>> = {
  orthogonal: 'orthogonal',
  straight: 'straight',
  curved: 'curved',
};

/** Whether a choice of a control is a style. */
export function isRouteStyle(value: string): value is RouteStyle {
  return (ROUTE_STYLES as readonly string[]).includes(value);
}

/** The route style a relation type's appearance stores where the project can change it, if any. */
export function storedRelationTypeRoute(project: ProjectSnapshot, id: Id): RouteStyle | undefined {
  const stored = editableAppearanceOf(project, 'relation-type', id)?.appearance;
  return stored !== undefined && 'route' in stored ? stored.route : undefined;
}

/**
 * The style a relation type's relations take without the one stored where the project changes it:
 * a built-in relation type's own, or else what the relation type it derives from gives; `undefined`
 * when nothing sets one, so that each view draws them as its Lines say.
 */
export function inheritedRelationTypeRoute(
  project: ProjectSnapshot,
  id: Id,
): RouteStyle | undefined {
  const definitions = definitionsIn(project);
  const defined = definitions.relationTypes.get(id)?.definition;
  const own =
    id === RELATES_TO_ID || isBuiltInDefinition(definitions, 'relation-type', id)
      ? defined?.appearance?.route
      : undefined;
  if (own !== undefined || id === RELATES_TO_ID) return own;
  const parent = defined?.derivesFrom ?? RELATES_TO_ID;
  return relationTypeOrRelatesTo(definitions, parent).appearance.route;
}

/**
 * The command that sets the style of a relation type's automatic routes at the level the project
 * can change it; `null` takes it back, so that it is inherited.
 */
export function relationTypeRouteCommand(relationType: Id, route: RouteStyle | null): Command {
  return { type: 'set-relation-type-appearance', relationType, appearanceTraits: { route } };
}

/** The command that sets the style of one relation's automatic route; `null` takes it back. */
export function relationRouteCommand(relation: Id, route: RouteStyle | null): Command {
  return { type: 'update-relation', id: relation, changes: { appearanceTraits: { route } } };
}

/**
 * The command that sets how a view draws the automatic routes its relations' appearances leave to it,
 * as one action labelled by what it does; `undefined` when the view draws them so already.
 */
export function viewLinesCommand(view: ViewFile, style: RouteStyle): Command | undefined {
  if ((view.routeStyle ?? 'orthogonal') === style) return undefined;
  return {
    type: 'batch',
    label: `Draw the lines of "${view.name}" ${style}`,
    commands: [
      {
        type: 'update-view',
        id: view.id,
        changes: { routeStyle: style === 'orthogonal' ? null : style },
      },
    ],
  };
}
