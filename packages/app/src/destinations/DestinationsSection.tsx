/**
 * The inspector's list of an element's destinations (ADR 0056): what each opens, by the attribute that
 * holds it, with the button that follows it, as double-clicking the mark on its shape does. An
 * element without destinations shows no section.
 */
import type { Element } from '@visual-anything/schema';
import { useId } from 'react';
import { useEditor } from '../editor/EditorContext';
import { useT } from '../i18n';
import { describeDestination, elementDestinations } from './follow';
import { useFollow } from './FollowProvider';
import './destinations.css';

export function DestinationsSection({ element }: { element: Element }) {
  const t = useT();
  const { project } = useEditor();
  const follower = useFollow();
  const headingId = useId();
  const found = elementDestinations(project, element);
  if (found.length === 0) return null;
  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Destinations')}</h4>
      <ul className="inspector-destinations" aria-labelledby={headingId}>
        {found.map(({ attribute, destination }) => {
          const opens = describeDestination(t, project, destination);
          return (
            <li key={attribute} className="inspector-destination">
              <span>
                <span className="inspector-destination-name">{attribute}</span>
                <br />
                <span className="inspector-destination-opens">
                  {t('Opens {what}', { what: opens })}
                </span>
              </span>
              <button
                type="button"
                className="inspector-action"
                disabled={follower === undefined}
                aria-label={t('Follow “{name}”, which opens {what}', {
                  name: attribute,
                  what: opens,
                })}
                onClick={() => follower?.follow(destination)}
              >
                {t('Follow')}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
