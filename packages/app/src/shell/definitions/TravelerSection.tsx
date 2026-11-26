import { relationTypeOrRelatesTo } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { originText, savedIn } from '../inspector/colors';
import { isBuiltInDefinition } from './commands';
import { TraitRow } from './TraitRow';
import { TravelerControl } from './TravelerControl';
import { relationTypeTravelerCommand, storedRelationTypeTraveler } from './travelerCommands';
import { nameOf } from './traits';

/**
 * A relation type's Traveler section in the component editor (ADR 0110): the package picture its
 * relations' lines send from their from end to their to end while a view shows them. It changes at
 * the level the project can change, as colors and route styles do, so a built-in relation type's goes
 * into the project file; each change is one action.
 */
export function TravelerSection({ id }: { id: Id }) {
  const t = useT();
  const { project, definitions, send } = useEditor();
  const headingId = useId();
  const readOnly = send === undefined;
  const relationType = relationTypeOrRelatesTo(definitions, id);
  const stored = storedRelationTypeTraveler(project, id);
  // The history's label of a new picture defined and sent in one action.
  const pictureLabel = `Change the appearance of the relation type "${relationType.name}"`;

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Traveler')}</h4>
      <p className="inspector-notes">
        {t(
          'A picture its relations’ lines send from their from end to their to end while a view shows them, drawn in its own colors.',
        )}
      </p>
      <ul className="definition-traits">
        <TraitRow
          label={t('Traveler')}
          group
          source={originText(
            relationType.origins.traveler,
            (each) => nameOf(definitions, 'relation-type', each),
            id,
          )}
          own={stored !== undefined}
          readOnly={readOnly}
          inherit={() => relationTypeTravelerCommand(id, null)}
          note={
            isBuiltInDefinition(definitions, 'relation-type', id)
              ? savedIn(project.packages, relationType.package)
              : undefined
          }
        >
          {({ describedBy, send: sendCommand }) => (
            <TravelerControl
              project={project}
              relationType={id}
              traveler={relationType.appearance.traveler}
              disabled={readOnly}
              describedBy={describedBy}
              set={(change) => relationTypeTravelerCommand(id, change)}
              label={pictureLabel}
              send={sendCommand}
            />
          )}
        </TraitRow>
      </ul>
    </section>
  );
}
