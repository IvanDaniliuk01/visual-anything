/**
 * The inspector's picture (ADR 0098): its name, which screen readers, the outline and a missing file
 * say, edited as one action; what its file is; and "Its own size", which gives it its file's size in
 * pixels as canvas units. The view's inspector lists the files of `media/` that no picture names, and
 * removes them, saying first that it cannot be undone.
 */
import { mediaFileName, mediaNamedBy, type UnnamedMediaFile } from '@visual-anything/core';
import type { Picture } from '@visual-anything/schema';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { useModalFocus } from '../../canvas/focus';
import { useEditor } from '../../editor/EditorContext';
import { useT, type PluralText } from '../../i18n';
import { LiveContext } from '../../live/context';
import { TextControl } from './controls';

/** A format as people know it. */
const FORMAT_NAMES: Readonly<Record<Picture['media']['format'], string>> = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
  gif: 'GIF',
  svg: 'SVG',
};

/** A media file's path in the project, which is the same in every language. */
function mediaPath(file: { hash: string; format: Picture['media']['format'] }): string {
  return `media/${mediaFileName(file)}`;
}

/** The path, its hash cut short, for the list. */
function shortMediaPath(hash: string): string {
  return `media/${hash.slice(0, 12)}…`;
}

/** A size in bytes, in KiB or MiB. */
function bytesText(bytes: number, language: string): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toLocaleString(language, { maximumFractionDigits: 1 })} KiB`;
  }
  return `${(bytes / 1024 / 1024).toLocaleString(language, { maximumFractionDigits: 1 })} MiB`;
}

export function PictureInspector({ picture, viewId }: { picture: Picture; viewId: string }) {
  const t = useT();
  const { send } = useEditor();
  const nameId = useId();
  const disabled = send === undefined;
  const { media } = picture;
  const update = (changes: Partial<Picture>) => {
    const next: Picture = { ...picture, ...changes };
    if (changes.name === undefined && 'name' in changes) delete next.name;
    return send?.({ type: 'update-free-shape', view: viewId, shape: next });
  };
  const ownSize = picture.width === media.width && picture.height === media.height;
  return (
    <>
      <h3 className="inspector-title">{picture.name ?? t('Picture')}</h3>
      <p className="inspector-notes">{t('A free shape: drawing only, not part of the model.')}</p>
      <div className="inspector-control">
        <label htmlFor={nameId}>{t('Name')}</label>
        <TextControl
          id={nameId}
          value={picture.name ?? ''}
          placeholder={t('Picture')}
          disabled={disabled}
          onCommit={async (text) => {
            // An empty name takes it out, and the picture is called "Picture".
            const name = text.trim().slice(0, 200);
            await update({ name: name === '' ? undefined : name });
          }}
        />
      </div>
      <p className="inspector-notes">
        {t(
          'What screen readers and the outline say of it, and what shows if its file goes missing.',
        )}
      </p>
      <p className="inspector-notes">
        {[
          FORMAT_NAMES[media.format],
          t('{width} × {height} pixels', { width: media.width, height: media.height }),
          bytesText(media.bytes, t.language),
        ].join(' · ')}
      </p>
      <p className="inspector-notes">
        <code>{mediaPath(media)}</code>
      </p>
      <div className="components-actions">
        <button
          type="button"
          className="components-action"
          disabled={disabled || ownSize}
          onClick={() => void update({ width: media.width, height: media.height })}
        >
          {t('Its own size')}
        </button>
      </div>
    </>
  );
}

const UNNAMED: PluralText = {
  one: 'The project’s media/ folder holds {count} file that no picture names. It stays until you remove it.',
  other:
    'The project’s media/ folder holds {count} files that no picture names. They stay until you remove them.',
};

const PICTURES: PluralText = {
  one: 'This view shows {count} picture.',
  other: 'This view shows {count} pictures.',
};

type Listing =
  | { state: 'listing' }
  | { state: 'listed'; files: readonly UnnamedMediaFile[] }
  | { state: 'refused'; problem: string };

/** The view's pictures, and the files of `media/` that no picture of any view names. */
export function PicturesSection({ pictures }: { pictures: number }) {
  const t = useT();
  const { project } = useEditor();
  const live = useContext(LiveContext);
  const list = live?.listMediaFiles;
  const remove = live?.removeMediaFiles;
  const headingId = useId();
  const listId = useId();
  const [listing, setListing] = useState<Listing>({ state: 'listing' });
  const [asking, setAsking] = useState<readonly UnnamedMediaFile[]>();
  const [said, setSaid] = useState<string[]>([]);
  // Listed again whenever the pictures named may have changed.
  const named = [...mediaNamedBy(project.views)].sort().join();

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
  }, [list, named]);

  const files = listing.state === 'listed' ? listing.files : [];
  if (pictures === 0 && files.length === 0) return null;

  const removeFiles = async (chosen: readonly UnnamedMediaFile[]) => {
    setAsking(undefined);
    if (!remove) return;
    const result = await remove(chosen.map((each) => each.hash));
    if (!result.ok) {
      setSaid(result.problems.map((each) => each.message));
      return;
    }
    setListing({ state: 'listed', files: result.answer.files });
    setSaid((result.answer.kept ?? []).map((each) => each.message));
  };

  return (
    <section className="panel-section" aria-labelledby={headingId}>
      <h3 id={headingId}>{t('Pictures')}</h3>
      {pictures > 0 && <p className="item-notes">{t(PICTURES, { count: pictures })}</p>}
      {list && remove && files.length > 0 && (
        <>
          <h4 id={listId}>{t('Files no picture names')}</h4>
          <p className="item-notes" role="status">
            {t(UNNAMED, { count: files.length })}
          </p>
          <ul className="item-list" aria-labelledby={listId}>
            {files.map((file) => (
              <li key={file.hash} className="components-unnamed-file">
                <code title={mediaPath(file)}>{shortMediaPath(file.hash)}</code>
                <span className="item-notes">{bytesText(file.bytes, t.language)}</span>
                <button
                  type="button"
                  className="components-action"
                  aria-label={t('Remove “media/{file}”', { file: mediaFileName(file) })}
                  aria-haspopup="dialog"
                  onClick={() => setAsking([file])}
                >
                  {t('Remove')}
                </button>
              </li>
            ))}
          </ul>
          {files.length > 1 && (
            <button
              type="button"
              className="components-action"
              aria-haspopup="dialog"
              onClick={() => setAsking(files)}
            >
              {t('Remove all {count} files', { count: files.length })}
            </button>
          )}
        </>
      )}
      {listing.state === 'refused' && (
        <p className="inspector-problem" role="alert">
          {t.message(listing.problem)}
        </p>
      )}
      {said.length > 0 && (
        <ul className="inspector-problem" role="alert">
          {said.map((each, at) => (
            <li key={at}>{t.message(each)}</li>
          ))}
        </ul>
      )}
      {asking && (
        <RemoveMediaDialog
          files={asking}
          onConfirm={() => void removeFiles(asking)}
          onCancel={() => setAsking(undefined)}
        />
      )}
    </section>
  );
}

/** Asks before removing media files, which cannot be undone. */
function RemoveMediaDialog({
  files,
  onConfirm,
  onCancel,
}: {
  files: readonly UnnamedMediaFile[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useModalFocus(dialog);
  useEffect(() => cancel.current?.focus(), []);
  const [first] = files;
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
          {files.length === 1 && first
            ? t('Remove the file “media/{file}”?', { file: mediaFileName(first) })
            : t('Remove {count} files from the project’s media/ folder?', { count: files.length })}
        </h2>
        <p>
          {t(
            'No picture names it now, but a version of the project, a branch, or an action you undid may. This cannot be undone: once removed, the file is gone from the folder.',
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
