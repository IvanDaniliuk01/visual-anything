/**
 * The inspector's link card (ADR 0098, stage 3): its address, title and description, each edited as
 * one action; its picture, added from a file or taken out; Fetch the preview, which asks the local
 * program to read the page once, over https, and sets what it found as one undoable change; and Open
 * the address, in a new tab.
 */
import {
  LINK_CAPS,
  checkLinkAddress,
  isVideoFormat,
  linkHost,
  mayFetchPreview,
  mediaFileName,
} from '@visual-anything/core';
import type { LinkCard } from '@visual-anything/schema';
import { useContext, useId, useRef, useState } from 'react';
import { isVideoFile, pictureFilesIn } from '../../canvas/pictures/adding';
import { pictureChanges, previewCommand } from '../../canvas/links/adding';
import { openLinkAddress } from '../../canvas/links/open';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { LiveContext } from '../../live/context';
import { TextControl } from './controls';

/** Where a media file is kept, as a path inside the project folder: no word, so not translated. */
function mediaPath(media: Parameters<typeof mediaFileName>[0]): string {
  return `media/${mediaFileName(media)}`;
}

/** The types a card's picture may be chosen from: images, never a video. */
const CARD_PICTURE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg';

export function LinkCardInspector({ card, viewId }: { card: LinkCard; viewId: string }) {
  const t = useT();
  const { send } = useEditor();
  const live = useContext(LiveContext);
  const addressId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const chooser = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'fetching' | 'adding'>();
  const [said, setSaid] = useState<string>();
  const disabled = send === undefined;
  const change = (changes: Record<string, unknown>) =>
    send?.({ type: 'update-free-shape', view: viewId, id: card.id, changes });
  const fetchPreview = live?.fetchLinkPreview;
  const putMedia = live?.putMedia;
  const fetchable = mayFetchPreview(card.url);

  const fetchNow = async () => {
    if (!fetchPreview || !send) return;
    setBusy('fetching');
    setSaid(undefined);
    try {
      const fetched = await fetchPreview(card.url);
      if (!fetched.ok) {
        setSaid(fetched.problems.map((each) => t.message(each.message)).join(' '));
        return;
      }
      const { preview, notes } = fetched.answer;
      const command = previewCommand(viewId, card, preview);
      if (command) await send(command);
      const found = command
        ? t('The preview is set: undo takes it back.')
        : t('The page gives no title, description or image to show.');
      setSaid([found, ...notes.map((note) => t.message(note))].join(' '));
    } finally {
      setBusy(undefined);
    }
  };

  const addPicture = async (files: readonly File[]) => {
    const [file] = pictureFilesIn(files).filter((each) => !isVideoFile(each));
    if (!file || !putMedia) {
      setSaid(t('A link card’s picture is a PNG, JPEG, WebP, GIF or SVG file.'));
      return;
    }
    setBusy('adding');
    setSaid(undefined);
    try {
      const kept = await putMedia(file.name, new Uint8Array(await file.arrayBuffer()));
      if (!kept.ok) {
        setSaid(kept.problems.map((each) => t.message(each.message)).join(' '));
        return;
      }
      if (isVideoFormat(kept.answer.media.format)) {
        setSaid(t('A link card’s picture is a PNG, JPEG, WebP, GIF or SVG file.'));
        return;
      }
      await change(pictureChanges(card, kept.answer.media));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <>
      <h3 className="inspector-title">{card.title}</h3>
      <p className="inspector-notes">
        {t(
          'A link card: drawing only, not part of the model. A click on its address opens it in a new tab; nothing of the page is shown inside Visual Anything.',
        )}
      </p>
      <div className="inspector-control">
        <label htmlFor={addressId}>{t('Address')}</label>
        <TextControl
          id={addressId}
          value={card.url}
          disabled={disabled}
          problemOf={(text) =>
            checkLinkAddress(text).ok ? undefined : t('Write an address that starts with https://.')
          }
          same={(a, b) => {
            const one = checkLinkAddress(a);
            const other = checkLinkAddress(b);
            return one.ok && other.ok && one.url === other.url;
          }}
          onCommit={async (text) => {
            const checked = checkLinkAddress(text);
            if (checked.ok) await change({ url: checked.url });
          }}
        />
      </div>
      <div className="inspector-control">
        <label htmlFor={titleId}>{t('Title')}</label>
        <TextControl
          id={titleId}
          value={card.title}
          disabled={disabled}
          problemOf={(text) => (text.trim() === '' ? t('A link card needs a title.') : undefined)}
          onCommit={async (text) => {
            await change({ title: text.replace(/\s+/g, ' ').trim().slice(0, LINK_CAPS.title) });
          }}
        />
      </div>
      <div className="inspector-control">
        <label htmlFor={descriptionId}>{t('Description')}</label>
        <TextControl
          id={descriptionId}
          value={card.description ?? ''}
          multiline
          disabled={disabled}
          onCommit={async (text) => {
            const description = text.trim().slice(0, LINK_CAPS.description);
            await change({ description: description === '' ? null : description });
          }}
        />
      </div>
      {card.picture && (
        <p className="inspector-notes">
          {t('Its picture:')} <code>{mediaPath(card.picture)}</code>
        </p>
      )}
      <div className="components-actions">
        <button
          type="button"
          className="components-action"
          disabled={disabled || busy !== undefined || !putMedia}
          onClick={() => chooser.current?.click()}
        >
          {card.picture ? t('Another picture…') : t('Add a picture…')}
        </button>
        {card.picture && (
          <button
            type="button"
            className="components-action"
            disabled={disabled || busy !== undefined}
            onClick={() => void change({ picture: null })}
          >
            {t('Take its picture out')}
          </button>
        )}
        <input
          ref={chooser}
          type="file"
          accept={CARD_PICTURE_ACCEPT}
          hidden
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            const files = [...(event.currentTarget.files ?? [])];
            event.currentTarget.value = '';
            if (files.length > 0) void addPicture(files);
          }}
        />
      </div>
      <div className="components-actions">
        <button
          type="button"
          className="components-action"
          disabled={disabled || busy !== undefined || !fetchPreview || !fetchable}
          aria-busy={busy === 'fetching' ? true : undefined}
          onClick={() => void fetchNow()}
        >
          {busy === 'fetching' ? t('Fetching the preview…') : t('Fetch the preview')}
        </button>
        <button
          type="button"
          className="components-action"
          onClick={() => openLinkAddress(card.url)}
        >
          {t('Open the address')}
        </button>
      </div>
      <p className="inspector-notes">
        {fetchable
          ? t(
              'Fetch the preview reads {host} once, over https, and keeps its title, description and image. It runs nothing on the page and sends no cookie; it is the only time Visual Anything reaches the internet.',
              { host: linkHost(card.url) },
            )
          : t('Only an https address’s preview is fetched; write the title and add a picture.')}
      </p>
      {said !== undefined && (
        <p className="inspector-notes" role="status">
          {said}
        </p>
      )}
    </>
  );
}
