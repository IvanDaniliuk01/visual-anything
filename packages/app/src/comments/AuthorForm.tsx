/**
 * Who the person's comments are signed as (ADR 0059): a name and an optional email, kept as one of
 * their preferences (ADR 0032), outside every project and never read by Claude.
 */
import { MAX_AUTHOR_NAME, checkPerson, type AuthorPreference } from '@visual-anything/core';
import { useId, useState, type FormEvent } from 'react';
import { useT } from '../i18n';
import { usePreferences } from '../theme/usePreferences';

interface AuthorFormProps {
  /** Called once the name is kept, or given up on when it was being changed. */
  onDone?: () => void;
}

export function AuthorForm({ onDone }: AuthorFormProps) {
  const t = useT();
  const { preferences, change } = usePreferences();
  const [name, setName] = useState(preferences.author?.name ?? '');
  const [email, setEmail] = useState(preferences.author?.email ?? '');
  const [problem, setProblem] = useState<string>();
  const nameId = useId();
  const emailId = useId();

  const save = (event: FormEvent) => {
    event.preventDefault();
    const checked = checkPerson({ kind: 'person', name, email });
    if (!checked.ok) {
      setProblem(
        checked.code === 'no-comment-author'
          ? t('Give your name.')
          : name.trim().length > MAX_AUTHOR_NAME
            ? t('A name holds at most 200 characters.')
            : t('That is not an email address.'),
      );
      return;
    }
    const { name: kept, email: address } = checked.author;
    const author: AuthorPreference =
      address === undefined ? { name: kept } : { name: kept, email: address };
    change({ author });
    setProblem(undefined);
    onDone?.();
  };

  return (
    // The form checks the email itself, so that what it says reads in the app's language.
    <form className="comment-signing" noValidate onSubmit={save}>
      <p className="comment-hint">
        {t('Your comments are signed with your name, kept on this computer for every project.')}
      </p>
      <label htmlFor={nameId}>{t('Your name')}</label>
      <input
        id={nameId}
        value={name}
        maxLength={200}
        autoComplete="name"
        onChange={(event) => setName(event.target.value)}
      />
      <label htmlFor={emailId}>{t('Email (optional)')}</label>
      <input
        id={emailId}
        type="email"
        value={email}
        maxLength={254}
        autoComplete="email"
        onChange={(event) => setEmail(event.target.value)}
      />
      {problem !== undefined && (
        <p className="comment-problem" role="alert">
          {problem}
        </p>
      )}
      <div className="comment-actions">
        <button type="submit" className="comment-button comment-button-primary">
          {t('Sign my comments')}
        </button>
        {onDone && preferences.author !== null && (
          <button type="button" className="comment-button" onClick={onDone}>
            {t('Cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
