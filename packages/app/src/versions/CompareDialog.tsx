/**
 * The dialog of Compare with… (ADR 0070, ADR 0071): it lists the project as opened, then `HEAD`,
 * branches, remote branches, tags and recent commits as the program lists them, each with its kind,
 * name, short id, subject, author and time, and says why when git can list none. A text box finds
 * versions as it is typed in; Up and Down go through the list, Enter chooses, and Escape closes. The
 * focus stays inside it while it is open.
 *
 * Choosing a version asks the program for it: the dialog says it waits, and why the program could
 * not compare it, in words. Once the answer comes the dialog closes, and the comparison shows.
 */
import type { ListedVersion } from '@visual-anything/core';
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react';
import { useModalFocus } from '../canvas/focus';
import { actionTime, useToday } from '../history/time';
import { useT } from '../i18n';
import type { RequestProblem } from '../live/connection';
import type { Live } from '../live/context';
import type { Asking } from './session';
import {
  kindName,
  versionName,
  versionOptions,
  type ChosenVersion,
  type VersionOption,
} from './versions';
import './versions.css';

/** What the program said of the versions it lists. */
type Listing =
  | { state: 'listing' }
  | { state: 'listed'; versions: readonly ListedVersion[]; why?: string }
  | { state: 'failed'; problems: readonly RequestProblem[] };

interface CompareDialogProps {
  /** Asks the program for the versions it lists. */
  list: NonNullable<Live['listVersions']>;
  /** Hears the program's latest listing, which names the commits Claude asks for. */
  onListed: (versions: readonly ListedVersion[]) => void;
  /** The version asked for, while the program reads it, or once it said why it could not. */
  asking: Asking | undefined;
  onChoose: (chosen: ChosenVersion) => void;
  /** Closes the dialog, and stops waiting for a version asked for. */
  onClose: () => void;
}

/** How far Page Up and Page Down move through the list. */
const PAGE = 10;

export function CompareDialog({ list, onListed, asking, onChoose, onClose }: CompareDialogProps) {
  const t = useT();
  const titleId = useId();
  const listId = useId();
  const noteId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [listing, setListing] = useState<Listing>({ state: 'listing' });
  const [typed, setTyped] = useState('');
  const [active, setActive] = useState(0);
  const today = useToday();
  useModalFocus(dialog);
  useEffect(() => {
    field.current?.focus();
  }, []);

  // The versions are listed each time the dialog opens, and again when asked: the latest listing is
  // the only one whose commits the program compares.
  // Only the answer to the latest request shows; the program's latest listing is kept whichever it is.
  const listed = useRef(0);
  const ask = () => {
    listed.current += 1;
    const request = listed.current;
    void list().then((result) => {
      if (result.ok) onListed(result.answer.versions);
      if (listed.current !== request) return;
      setListing(
        result.ok
          ? {
              state: 'listed',
              versions: result.answer.versions,
              ...(result.answer.why === undefined ? {} : { why: result.answer.why }),
            }
          : { state: 'failed', problems: result.problems },
      );
    });
  };
  const listAgain = () => {
    setListing({ state: 'listing' });
    ask();
  };
  const listOnOpen = useEffectEvent(ask);
  useEffect(() => {
    listOnOpen();
    // An answer that comes once the dialog closed is dropped.
    return () => {
      listed.current += 1;
    };
  }, []);

  const { options, more } = useMemo(
    () => versionOptions(t, listing.state === 'listed' ? listing.versions : [], typed),
    [t, listing, typed],
  );
  const at = Math.min(active, options.length - 1);
  const current = at >= 0 ? options[at] : undefined;
  const optionId = (index: number) => `${listId}-${index}`;

  // The option gone to stays in sight.
  useEffect(() => {
    if (at < 0) return;
    const element = document.getElementById(optionId(at));
    element?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the ids follow the list's
  }, [at]);

  const waiting = asking?.state === 'waiting' ? asking : undefined;
  const refused = asking?.state === 'refused' ? asking : undefined;

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog compare-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={noteId}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <h2 id={titleId}>{t('Compare with…')}</h2>
        <p id={noteId} className="dialog-note">
          {t(
            'Compare the project now with another version of it: the open view is drawn before, after and as the comparison, read-only, with the Changes list. Nothing is written.',
          )}
        </p>
        <input
          ref={field}
          type="text"
          className="compare-find"
          role="combobox"
          aria-label={t('Find a version')}
          aria-autocomplete="list"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-activedescendant={current ? optionId(at) : undefined}
          placeholder={t('Branch, tag, commit, subject or author')}
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            const last = options.length - 1;
            const by =
              event.key === 'ArrowDown'
                ? 1
                : event.key === 'ArrowUp'
                  ? -1
                  : event.key === 'PageDown'
                    ? PAGE
                    : event.key === 'PageUp'
                      ? -PAGE
                      : 0;
            if (by !== 0) {
              event.preventDefault();
              setActive(Math.max(0, Math.min(at + by, last)));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (current) onChoose(current.chosen);
            }
          }}
        />
        <ul id={listId} role="listbox" aria-label={t('Versions')} className="compare-options">
          {options.map((option, index) => (
            <VersionRow
              key={option.key}
              id={optionId(index)}
              option={option}
              selected={index === at}
              today={today}
              onChoose={() => {
                setActive(index);
                onChoose(option.chosen);
              }}
            />
          ))}
        </ul>
        {options.length === 0 && listing.state !== 'listing' && (
          <p className="dialog-note">
            {t('No version holds “{text}”. Type other words, or clear the box to list them all.', {
              text: typed,
            })}
          </p>
        )}
        {more > 0 && (
          <p className="dialog-note">
            {t(
              {
                one: '{count} more version is not listed here: type to find it.',
                other: '{count} more versions are not listed here: type to find them.',
              },
              { count: more },
            )}
          </p>
        )}
        <p className="compare-status" role="status">
          {waiting
            ? t('Reading {version} to compare it with the project now…', {
                version: versionName(t, waiting.chosen),
              })
            : listing.state === 'listing'
              ? t('Listing the versions…')
              : listing.state === 'listed' && listing.why !== undefined
                ? t.message(listing.why)
                : ''}
        </p>
        {listing.state === 'failed' && (
          <p className="export-problem" role="alert">
            {t('The versions could not be listed: {why}', {
              why: listing.problems.map((each) => t.message(each.message)).join(' '),
            })}
          </p>
        )}
        {refused && (
          <p className="export-problem" role="alert">
            {t('Could not compare with {version}: {why}', {
              version: versionName(t, refused.chosen),
              why: refused.problems.map((each) => t.message(each.message)).join(' '),
            })}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={listAgain} disabled={listing.state === 'listing'}>
            {t('List again')}
          </button>
          <button type="button" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="dialog-confirm"
            aria-disabled={current && !waiting ? undefined : true}
            onClick={() => {
              if (current && !waiting) onChoose(current.chosen);
            }}
          >
            {t('Compare')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface VersionRowProps {
  id: string;
  option: VersionOption;
  selected: boolean;
  today: number;
  onChoose: () => void;
}

/** One version in the list: its kind, name, short id, subject, author and time. */
function VersionRow({ id, option, selected, today, onChoose }: VersionRowProps) {
  const t = useT();
  const { chosen } = option;
  const version = chosen.kind === 'listed' ? chosen.version : undefined;
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      className="compare-option"
      // The text box keeps the focus.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onChoose}
    >
      <span className="compare-kind">{kindName(t, option.kind)}</span>
      {version === undefined ? (
        <>
          <span className="compare-name">{t('The project as opened')}</span>
          <span className="compare-subject">
            {t('As Visual Anything opened it, or last read it from disk; it needs no git.')}
          </span>
        </>
      ) : (
        <>
          {version.name !== undefined && <span className="compare-name">{version.name}</span>}
          <span className="compare-short">{version.short}</span>
          <span className="compare-subject">{version.subject}</span>
          <span className="compare-by">
            {t('{author}, {time}', {
              author: version.author,
              time: actionTime(version.time, today, t.language),
            })}
          </span>
        </>
      )}
    </li>
  );
}
