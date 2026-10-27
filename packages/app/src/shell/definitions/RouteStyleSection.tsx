import { relationTypeOrRelatesTo } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { originText, savedIn } from '../inspector/colors';
import { SelectControl } from '../inspector/controls';
import {
  ROUTE_STYLES,
  ROUTE_STYLE_NAMES,
  ROUTE_STYLE_WORDS,
  inheritedRelationTypeRoute,
  isRouteStyle,
  relationTypeRouteCommand,
  storedRelationTypeRoute,
} from '../inspector/routeStyles';
import { isBuiltInDefinition } from './commands';
import { TraitRow } from './TraitRow';
import { nameOf } from './traits';

/**
 * A relation type's Route section in the component editor (ADR 0069): the style of its relations'
 * automatic routes, Inherited, Orthogonal, Straight or Curved, which every view draws them in,
 * whatever its Lines say. It changes at the level the project can change, as colors do, so a
 * built-in relation type's goes into the project file; each choice is one command.
 */
export function RouteStyleSection({ id }: { id: Id }) {
  const t = useT();
  const { project, definitions, send } = useEditor();
  const headingId = useId();
  const readOnly = send === undefined;
  const relationType = relationTypeOrRelatesTo(definitions, id);
  const stored = storedRelationTypeRoute(project, id);
  const inherited = inheritedRelationTypeRoute(project, id);

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Route')}</h4>
      <p className="inspector-notes">
        {t(
          'How its relations’ lines run wherever they are routed automatically. Routes chosen by hand in a view keep their own style.',
        )}
      </p>
      <ul className="definition-traits">
        <TraitRow
          label={t('Automatic routes')}
          source={originText(
            relationType.origins.route,
            (each) => nameOf(definitions, 'relation-type', each),
            id,
          )}
          own={stored !== undefined}
          readOnly={readOnly}
          note={
            isBuiltInDefinition(definitions, 'relation-type', id)
              ? savedIn(project.packages, relationType.package)
              : undefined
          }
        >
          {({ id: controlId, describedBy, send: sendCommand }) => (
            <SelectControl
              id={controlId}
              value={stored ?? 'inherit'}
              disabled={readOnly}
              describedBy={describedBy}
              onCommit={async (next) => {
                if (next === 'inherit') {
                  if (stored !== undefined) await sendCommand(relationTypeRouteCommand(id, null));
                } else if (isRouteStyle(next)) {
                  await sendCommand(relationTypeRouteCommand(id, next));
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
      </ul>
    </section>
  );
}
