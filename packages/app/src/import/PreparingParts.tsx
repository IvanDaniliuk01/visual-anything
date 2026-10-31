/** The parts of the dialogs that prepare a glTF file as a solid (ADR 0075): Import… and Replace…. */
import { useId } from 'react';
import { useT } from '../i18n';
import { SOLID_UNITS } from '../shell/definitions/solidCommands';
import type { Preparing, PreparingChoices } from './preparing';

/** The unit and up axis a file is read in, each choice preparing it again. */
export function PreparingFields({
  choices,
  disabled,
  onChoose,
}: {
  choices: PreparingChoices;
  disabled: boolean;
  onChoose: (choices: PreparingChoices) => void;
}) {
  const t = useT();
  const unitId = useId();
  const upId = useId();
  return (
    <>
      <label className="import-field" htmlFor={unitId}>
        <span>{t('The file’s unit')}</span>
        <select
          id={unitId}
          value={choices.units}
          disabled={disabled}
          onChange={(event) => {
            const unit = SOLID_UNITS.find((each) => each.unit === event.target.value);
            if (unit) onChoose({ ...choices, units: unit.unit });
          }}
        >
          <option value="m">{t('Meters')}</option>
          <option value="cm">{t('Centimeters')}</option>
          <option value="mm">{t('Millimeters')}</option>
          <option value="in">{t('Inches')}</option>
        </select>
      </label>
      <label className="import-field" htmlFor={upId}>
        <span>{t('Up axis')}</span>
        <select
          id={upId}
          value={choices.up}
          disabled={disabled}
          onChange={(event) => onChoose({ ...choices, up: event.target.value === 'z' ? 'z' : 'y' })}
        >
          <option value="y">{t('Y, as glTF has it')}</option>
          <option value="z">{t('Z, as robotics and CAD tools often have it')}</option>
        </select>
      </label>
    </>
  );
}

/** Why a file was not prepared, and the offer to simplify it when that would take it within the caps. */
export function PreparingProblems({
  preparing,
  onSimplify,
}: {
  preparing: Preparing;
  onSimplify: () => void;
}) {
  const t = useT();
  if (preparing.state !== 'refused') return null;
  return (
    <>
      <ul className="import-problem" role="alert">
        {preparing.problems.map((problem, at) => (
          <li key={at}>{t.message(problem)}</li>
        ))}
      </ul>
      {preparing.simplifiable && (
        <div className="import-check">
          <button type="button" className="dialog-confirm" onClick={onSimplify}>
            {t('Simplify it to fit')}
          </button>
          <span className="dialog-note">
            {t('Simplifying keeps each node’s own geometry, with fewer triangles.')}
          </span>
        </div>
      )}
    </>
  );
}

/** What cleaning dropped or changed, line by line, in the core's words. */
export function CleaningReport({ report }: { report: readonly string[] }) {
  const t = useT();
  return (
    <details className="import-unmatched" open={report.length > 0}>
      <summary>{t('What cleaning dropped or changed')}</summary>
      {report.length === 0 ? (
        <p>{t('Nothing: the file held only what a solid keeps.')}</p>
      ) : (
        <ul>
          {report.map((line, at) => (
            <li key={at}>{t.message(line)}</li>
          ))}
        </ul>
      )}
    </details>
  );
}
