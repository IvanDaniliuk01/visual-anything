/**
 * Package code in the inspector of an element (ADR 0054): the values its packages' code computed,
 * shown as stored ones are, with a mark, and never saved; what their `check` found, as warnings; what
 * went wrong running them; and, for code that does not run, why, with the way to review it.
 */
import { codePackagesOn } from '@visual-anything/core';
import type { Element, JsonValue } from '@visual-anything/schema';
import { useId } from 'react';
import { useEditor } from '../editor/EditorContext';
import { useT } from '../i18n';
import { useCode, type PackageCodeView } from './context';
import { standingText } from './words';
import './code.css';

export function CodeSection({ element }: { element: Element }) {
  const t = useT();
  const code = useCode();
  const { project } = useEditor();
  const headingId = useId();
  if (!code) return null;
  const running = codePackagesOn(project, element.id)
    .map((id) => code.packages.get(id))
    .filter((each): each is PackageCodeView => each !== undefined);
  if (running.length === 0) return null;
  const answers = code.elements.get(element.id);
  const names = new Map(running.map((each) => [each.code.package, each.code.name]));

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Package code')}</h4>
      {running.map((view) => (
        <Standing key={view.code.package} view={view} />
      ))}
      {answers && answers.attributes.length > 0 && (
        <ul className="code-values" aria-label={t('Computed values')}>
          {answers.attributes.map((each) => (
            <li key={each.name}>
              <span className="code-value-name">{each.name}</span>
              <span className="code-value">{valueText(each.value)}</span>
              <span
                className="code-mark"
                title={t('Computed by the code of “{name}”, and never saved.', {
                  name: names.get(each.package) ?? each.package,
                })}
              >
                {t('computed')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {answers && answers.problems.length > 0 && (
        <ul className="inspector-warnings" aria-label={t('Warnings')}>
          {answers.problems.map((problem, at) => (
            <li key={`${problem.code} ${at}`} className="inspector-warning">
              {problem.code === 'code-check' ? (
                <>
                  {t('“{name}” finds:', {
                    name: names.get(problem.subjects?.[0] ?? '') ?? '',
                  })}{' '}
                  {problem.message}
                </>
              ) : (
                t.message(problem.message)
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Where one package's code stands, when that is not simply running. */
function Standing({ view }: { view: PackageCodeView }) {
  const t = useT();
  const code = useCode();
  const said = standingText(t, view);
  if (said === undefined) return null;
  return (
    <div>
      <p className="inspector-warning">{said}</p>
      {view.status.state !== 'too-large' && (
        <button
          type="button"
          className="inspector-action"
          onClick={() => code?.review(view.code.package)}
        >
          {t('Review the code of “{name}”…', { name: view.code.name })}
        </button>
      )}
    </div>
  );
}

function valueText(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
