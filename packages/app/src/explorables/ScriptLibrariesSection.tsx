/**
 * The Components tab's script libraries (ADR 0107), below its solids: each script library the
 * project's packages define, with its npm package, version, license and size; a form to ask for one
 * (`ScriptLibraryRequest`); and the files of
 * `script-libraries/` that no package names, which nothing removes on its own: Remove deletes one, or
 * all of them, saying first that it cannot be undone, as the solids' and media files are.
 */
import type { UnnamedScriptLibraryFileEntry } from '@visual-anything/core';
import { explorablesIn } from '@visual-anything/core';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { useModalFocus } from '../canvas/focus';
import { useEditor } from '../editor/EditorContext';
import { useT, type PluralText } from '../i18n';
import { LiveContext } from '../live/context';
import { librarySize } from './explorable';
import { ScriptLibraryRequest } from './ScriptLibraryRequest';

const UNNAMED: PluralText = {
  one: 'The project’s script-libraries/ folder holds {count} file that no package names. It stays until you remove it.',
  other:
    'The project’s script-libraries/ folder holds {count} files that no package names. They stay until you remove them.',
};

type Listing =
  | { state: 'listing' }
  | { state: 'listed'; files: UnnamedScriptLibraryFileEntry[] }
  | { state: 'refused'; problem: string };

/** A script library's file's path in the project, which is the same in every language. */
function filePath(hash: string): string {
  return `script-libraries/${hash}.js`;
}

/** The path of a script library's file, its hash cut short. */
function shortPath(hash: string): string {
  return `script-libraries/${hash.slice(0, 12)}….js`;
}

export function ScriptLibrariesSection() {
  const t = useT();
  const { project } = useEditor();
  const headingId = useId();
  const libraries = [...explorablesIn(project).scriptLibraries.values()];
  return (
    <section className="panel-section components-script-libraries">
      <h3 id={headingId}>{t('Script libraries')}</h3>
      {libraries.length === 0 ? (
        <p className="panel-empty">
          {t('The project has no script library yet: an explorable asks for one when it needs it.')}
        </p>
      ) : (
        <ul className="item-list" aria-labelledby={headingId}>
          {libraries.map(({ definition }) => {
            const size = librarySize(definition.bytes);
            return (
              <li key={definition.id} className="components-solid">
                <span className="item-name">
                  {t('{npm}, version {version}', {
                    npm: definition.npm,
                    version: definition.version,
                  })}
                </span>
                <p className="item-notes">
                  {[
                    t('License: {license}', { license: definition.license ?? t('not said') }),
                    `${size.value} ${size.unit}`,
                    definition.path,
                  ].join(' · ')}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <ScriptLibraryRequest />
      <UnnamedScriptLibraryFiles />
    </section>
  );
}

function UnnamedScriptLibraryFiles() {
  const t = useT();
  const { project } = useEditor();
  const live = useContext(LiveContext);
  const list = live?.listScriptLibraryFiles;
  const remove = live?.removeScriptLibraryFiles;
  const headingId = useId();
  const [listing, setListing] = useState<Listing>({ state: 'listing' });
  const [asking, setAsking] = useState<readonly string[]>();
  const [said, setSaid] = useState<string[]>([]);
  const packages = project.packages;

  // Listed when the tab opens, and again whenever what the packages name may have changed.
  useEffect(() => {
    if (!list) return;
    let gone = false;
    void list().then((result) => {
      if (gone) return;
      setListing(
        result.ok
          ? { state: 'listed', files: result.answer.files }
          : { state: 'refused', problem: result.problems.map((each) => each.message).join(' ') },
      );
    });
    return () => {
      gone = true;
    };
  }, [list, packages]);

  if (!list || !remove) return null;

  const removeFiles = async (hashes: readonly string[]) => {
    setAsking(undefined);
    const result = await remove(hashes);
    if (!result.ok) {
      setSaid(result.problems.map((each) => each.message));
      return;
    }
    setListing({ state: 'listed', files: result.answer.files });
    setSaid((result.answer.kept ?? []).map((each) => each.message));
  };

  const files = listing.state === 'listed' ? listing.files : [];
  return (
    <div className="components-unnamed">
      <h4 id={headingId}>{t('Files no package names')}</h4>
      <p className="item-notes" role="status">
        {listing.state === 'listing'
          ? t('Looking in the project’s script-libraries/ folder…')
          : listing.state === 'refused'
            ? t.message(listing.problem)
            : files.length === 0
              ? t('Every file in the project’s script-libraries/ folder is named by a package.')
              : t(UNNAMED, { count: files.length })}
      </p>
      {files.length > 0 && (
        <>
          <ul className="item-list" aria-labelledby={headingId}>
            {files.map((file) => {
              const size = librarySize(file.bytes);
              return (
                <li key={file.hash} className="components-unnamed-file">
                  <code title={filePath(file.hash)}>{shortPath(file.hash)}</code>
                  <span className="item-notes">{`${size.value} ${size.unit}`}</span>
                  <button
                    type="button"
                    className="components-action"
                    aria-label={t('Remove “script-libraries/{hash}.js”', { hash: file.hash })}
                    aria-haspopup="dialog"
                    onClick={() => setAsking([file.hash])}
                  >
                    {t('Remove')}
                  </button>
                </li>
              );
            })}
          </ul>
          {files.length > 1 && (
            <button
              type="button"
              className="components-action"
              aria-haspopup="dialog"
              onClick={() => setAsking(files.map((each) => each.hash))}
            >
              {t('Remove all {count} files', { count: files.length })}
            </button>
          )}
        </>
      )}
      {said.length > 0 && (
        <ul className="inspector-problem" role="alert">
          {said.map((each, at) => (
            <li key={at}>{t.message(each)}</li>
          ))}
        </ul>
      )}
      {asking && (
        <RemoveFilesDialog
          hashes={asking}
          onConfirm={() => void removeFiles(asking)}
          onCancel={() => setAsking(undefined)}
        />
      )}
    </div>
  );
}

/** Asks before removing files, which cannot be undone. */
function RemoveFilesDialog({
  hashes,
  onConfirm,
  onCancel,
}: {
  hashes: readonly string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useModalFocus(dialog);
  useEffect(() => cancel.current?.focus(), []);
  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      >
        <h2 id={titleId}>
          {hashes.length === 1
            ? t('Remove the file “script-libraries/{hash}.js”?', { hash: hashes[0] ?? '' })
            : t('Remove {count} files from the project’s script-libraries/ folder?', {
                count: hashes.length,
              })}
        </h2>
        <p>
          {t(
            'No package names it now, but a version of the project, a branch, or an action you undid may. This cannot be undone: once removed, the file is gone from the folder.',
          )}
        </p>
        <div className="dialog-actions">
          <button ref={cancel} type="button" onClick={onCancel}>
            {t('Cancel')}
          </button>
          <button type="button" className="dialog-confirm dialog-danger" onClick={onConfirm}>
            {t('Remove')}
          </button>
        </div>
      </div>
    </div>
  );
}
