/**
 * Asking for a script library from the app (ADR 0107), in the Components tab's script libraries
 * section: the person names the npm package and its exact version, for one of the project's own
 * packages, and, when they know them, the file to keep and the global it sets. Before any byte is
 * fetched, a dialog shows the registry's two addresses the program would read, as the dialog for
 * Claude's requests does; Fetch then asks the program (`script-library/fetch`), whose own consent this
 * tab answers at once, since the person saw the same here. Then it says what was kept, or why not.
 */
import {
  builtinPackage,
  registryAddresses,
  type ScriptLibraryAsk,
  type ScriptLibraryKeptMessage,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useContext, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useModalFocus } from '../canvas/focus';
import { useEditor } from '../editor/EditorContext';
import { useT } from '../i18n';
import type { LiveResult } from '../live/connection';
import { LiveContext } from '../live/context';
import { librarySize } from './explorable';
import { readScriptLibraryAsk } from './script-library-ask';

type Fetching =
  | { state: 'asking'; ask: ScriptLibraryAsk }
  | { state: 'fetching'; ask: ScriptLibraryAsk }
  | { state: 'done'; ask: ScriptLibraryAsk; result: LiveResult<ScriptLibraryKeptMessage> };

export function ScriptLibraryRequest() {
  const t = useT();
  const { project } = useEditor();
  const live = useContext(LiveContext);
  const fetchLibrary = live?.fetchScriptLibrary;
  const own = project.packages.filter((file) => builtinPackage(file.id) === undefined);
  const [chosen, setChosen] = useState<Id | undefined>(own[0]?.id);
  const pkg = own.some((file) => file.id === chosen) ? chosen : own[0]?.id;
  const [npm, setNpm] = useState('');
  const [version, setVersion] = useState('');
  const [path, setPath] = useState('');
  const [global, setGlobal] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [fetching, setFetching] = useState<Fetching>();
  if (!fetchLibrary) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const read = readScriptLibraryAsk({ package: pkg, npm, version, path, global });
    if (!read.ok) {
      setProblems(read.problems);
      return;
    }
    setProblems([]);
    setFetching({ state: 'asking', ask: read.ask });
  };

  const approve = async (ask: ScriptLibraryAsk) => {
    setFetching({ state: 'fetching', ask });
    const result = await fetchLibrary(ask);
    setFetching({ state: 'done', ask, result });
    if (result.ok) {
      setNpm('');
      setVersion('');
      setPath('');
      setGlobal('');
    }
  };

  return (
    <details className="components-script-library-ask">
      <summary>{t('Ask for a script library…')}</summary>
      <form className="components-script-library-form" onSubmit={submit} noValidate>
        <p className="item-notes">
          {t(
            'A script library comes only from the npm registry, at one exact version, as a single file that sets a global, such as D3, Plotly, KaTeX or mathjs. An explorable of the same package then names it.',
          )}
        </p>
        {own.length > 1 && (
          <label className="components-field">
            <span>{t('Package')}</span>
            <select value={pkg ?? ''} onChange={(event) => setChosen(event.target.value)}>
              {own.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="components-field">
          <span>{t('npm package')}</span>
          <input
            type="text"
            value={npm}
            placeholder="d3"
            spellCheck={false}
            autoCapitalize="off"
            onChange={(event) => setNpm(event.target.value)}
          />
        </label>
        <label className="components-field">
          <span>{t('Exact version')}</span>
          <input
            type="text"
            value={version}
            placeholder="7.9.0"
            spellCheck={false}
            onChange={(event) => setVersion(event.target.value)}
          />
        </label>
        <label className="components-field">
          <span>{t('File in the package, if you know it')}</span>
          <input
            type="text"
            value={path}
            placeholder="dist/d3.min.js"
            spellCheck={false}
            onChange={(event) => setPath(event.target.value)}
          />
        </label>
        <label className="components-field">
          <span>{t('Global it sets, if you know it')}</span>
          <input
            type="text"
            value={global}
            placeholder="d3"
            spellCheck={false}
            onChange={(event) => setGlobal(event.target.value)}
          />
        </label>
        {problems.length > 0 && (
          <ul className="inspector-problem" role="alert">
            {problems.map((each, at) => (
              <li key={at}>{t(each)}</li>
            ))}
          </ul>
        )}
        <button type="submit" className="components-action" aria-haspopup="dialog">
          {t('Fetch…')}
        </button>
      </form>
      {fetching && (
        <FetchDialog
          fetching={fetching}
          onApprove={() => void approve(fetching.ask)}
          onClose={() => setFetching(undefined)}
        />
      )}
    </details>
  );
}

/** Shows the registry's addresses before anything is fetched, then what was kept, or why not. */
function FetchDialog({
  fetching,
  onApprove,
  onClose,
}: {
  fetching: Fetching;
  onApprove: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useModalFocus(dialog);
  useEffect(() => first.current?.focus(), [fetching.state]);
  const { ask } = fetching;
  const addresses = registryAddresses(ask.npm, ask.version);
  const name = t('{npm}, version {version}', { npm: ask.npm, version: ask.version });
  const kept = fetching.state === 'done' && fetching.result.ok ? fetching.result.answer : undefined;
  const size = kept ? librarySize(kept.library.bytes) : undefined;
  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog script-library-consent"
        role={fetching.state === 'asking' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && fetching.state !== 'fetching') onClose();
        }}
      >
        {fetching.state === 'asking' ? (
          <>
            <h2 id={titleId}>{t('Fetch a script library?')}</h2>
            <p>
              {t('You asked for a script library for the package “{package}”:', {
                package: ask.package,
              })}
            </p>
            <p className="script-library-consent-name">{name}</p>
            {ask.path !== undefined && (
              <p className="dialog-note">{t('Its file: {path}', { path: ask.path })}</p>
            )}
            <p className="dialog-note">
              {t('Visual Anything reads these two addresses of the npm registry:')}
            </p>
            <ul className="script-library-consent-addresses">
              <li>
                <code>{addresses.document}</code>
              </li>
              <li>
                <code>{addresses.tarball}</code>
              </li>
            </ul>
            <p>
              {t(
                'Nothing is fetched until you approve. It checks the package against the registry’s own hash, runs none of its install scripts and keeps one file beside the project, which only an approved explorable runs.',
              )}
            </p>
            <div className="dialog-actions">
              <button ref={first} type="button" onClick={onClose}>
                {t('Cancel')}
              </button>
              <button type="button" className="dialog-confirm" onClick={onApprove}>
                {t('Fetch')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id={titleId}>{name}</h2>
            <p role="status">
              {fetching.state === 'fetching'
                ? t('Fetching it from the npm registry…')
                : kept && size
                  ? t('Kept beside the project: {size} {unit}, license {license}.', {
                      size: size.value,
                      unit: size.unit,
                      license: kept.library.license ?? t('not said'),
                    })
                  : t('Nothing was kept: {why}', {
                      why: fetching.result.ok
                        ? ''
                        : fetching.result.problems.map((each) => t.message(each.message)).join(' '),
                    })}
            </p>
            <div className="dialog-actions">
              <button
                ref={first}
                type="button"
                className="dialog-confirm"
                disabled={fetching.state === 'fetching'}
                onClick={onClose}
              >
                {t('Close')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
