/** Parts the inspector's appearance sections share: where a change goes, and the contrast hints. */
import { useId } from 'react';
import { useT } from '../../i18n';

interface ScopeChoiceProps<T extends string> {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

/**
 * Where the appearance controls below it make their changes: "Only this element" or "Every Service".
 * Choosing changes nothing in the project, so it stays usable while the project cannot be changed.
 */
export function ScopeChoice<T extends string>({ value, options, onChange }: ScopeChoiceProps<T>) {
  const t = useT();
  const name = useId();
  return (
    <fieldset className="inspector-scope">
      <legend>{t('Change')}</legend>
      {options.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Says that colors are hard to see on a canvas, in words, under the controls they describe: never a
 * refusal and never a notice (ADR-0033).
 */
export function ColorHints({ id, hints }: { id: string; hints: readonly string[] }) {
  if (hints.length === 0) return null;
  return (
    <div id={id} className="inspector-hint">
      {hints.map((hint) => (
        <p key={hint}>{hint}</p>
      ))}
    </div>
  );
}
