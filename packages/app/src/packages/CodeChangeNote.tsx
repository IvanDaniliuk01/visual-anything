/**
 * What updating a package does to its code, and so to its approval (ADR 0054, ADR 0089): said the
 * same by "Packages…" and by "Update from another project" (ADR 0051), before anything changes.
 * Approval is by the hash of the code, its capabilities and what it adds, so a change to any of them
 * asks for approval again.
 */
import { useT, type Translator } from '../i18n';
import type { ChangedPart, CodeChange } from './packageFiles';

/** What updating does to a package's code, in words; undefined when it holds none before or after. */
function codeChangeText(
  t: Translator,
  change: CodeChange,
  changed: ChangedPart | undefined,
  approved: boolean,
): string | undefined {
  switch (change) {
    case 'none':
      return undefined;
    case 'added':
      return t('It adds code, which runs only once you approve it.');
    case 'removed':
      return t('Its code is removed.');
    case 'same':
      return approved
        ? t('Its code stays the same, and so does its approval.')
        : t('Its code stays the same.');
    case 'changed':
      switch (changed) {
        case 'capabilities':
          return t(
            'What its code may reach changed, so it asks for your approval again before it runs.',
          );
        case 'extensions':
          return t(
            'What its code adds to the app changed, so it asks for your approval again before it runs.',
          );
        default:
          return t('Its code changed, so it asks for your approval again before it runs.');
      }
  }
}

/** The note itself, marked as a warning when the code will wait for approval again. */
export function CodeChangeNote({
  change,
  changed,
  approved,
  className,
}: {
  change: CodeChange;
  changed: ChangedPart | undefined;
  approved: boolean;
  /** The class of a plain note; one that asks for approval again is marked as a warning. */
  className: { note: string; warning: string };
}) {
  const t = useT();
  const text = codeChangeText(t, change, changed, approved);
  if (text === undefined) return null;
  return <p className={change === 'changed' ? className.warning : className.note}>{text}</p>;
}
