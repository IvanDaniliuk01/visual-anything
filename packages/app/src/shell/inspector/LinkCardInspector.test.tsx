/**
 * The inspector's link card (ADR 0098, stage 3): its address, title and description edited as one
 * change each, an address that is not an http or https one refused before it is sent; Fetch the
 * preview asks the program for the card's address only, and sets what it found as one undoable
 * change, saying what it left out; an http address's preview is not offered; Open the address opens
 * a new tab; and its picture is added from a file, the card growing to show it, or taken out.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Command, LinkFetchedMessage, MediaStoredMessage } from '@visual-anything/core';
import type { LinkCard, MediaRef } from '@visual-anything/schema';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import type { LiveResult } from '../../live/connection';
import { LiveContext, type Live } from '../../live/context';
import { LinkCardInspector } from './LinkCardInspector';

const PICTURE: MediaRef = {
  hash: 'a'.repeat(64),
  format: 'png',
  width: 1200,
  height: 630,
  bytes: 9,
};

const card = (more: Partial<LinkCard> = {}): LinkCard => ({
  kind: 'link',
  id: 'guide',
  x: 0,
  y: 0,
  width: 320,
  height: 112,
  url: 'https://example.org/intake',
  title: 'example.org',
  ...more,
});

function shown(linked: LinkCard, live: Partial<Live> = {}) {
  const sent: Command[] = [];
  const editor = {
    send: (command: Command) => {
      sent.push(command);
      return Promise.resolve({ ok: true });
    },
  } as unknown as Editor;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <EditorContext value={editor}>
      <LiveContext value={live as Live}>{children}</LiveContext>
    </EditorContext>
  );
  render(<LinkCardInspector card={linked} viewId="overview" />, { wrapper });
  return { sent };
}

function fetched(answer: Omit<LinkFetchedMessage, 'type' | 'requestId'>) {
  return vi.fn<(url: string) => Promise<LiveResult<LinkFetchedMessage>>>(() =>
    Promise.resolve({ ok: true, answer: { type: 'link/fetched', requestId: 'r', ...answer } }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the inspector’s link card', () => {
  it('edits its title and its address, refusing an address that is not http or https', async () => {
    const { sent } = shown(card());
    const title = screen.getByLabelText('Title');
    fireEvent.change(title, { target: { value: '  The intake   guide ' } });
    fireEvent.keyDown(title, { key: 'Enter' });
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      type: 'update-free-shape',
      view: 'overview',
      id: 'guide',
      changes: { title: 'The intake guide' },
    });
    const address = screen.getByLabelText('Address');
    fireEvent.change(address, { target: { value: 'javascript:alert(1)' } });
    fireEvent.keyDown(address, { key: 'Enter' });
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Write an address that starts with https://.',
    );
    fireEvent.change(address, { target: { value: 'HTTPS://Example.org/other' } });
    fireEvent.keyDown(address, { key: 'Enter' });
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toMatchObject({ changes: { url: 'https://example.org/other' } });
  });

  it('fetches the preview of its address only, and sets what it found as one change', async () => {
    const fetchLinkPreview = fetched({
      preview: { title: 'The intake guide', description: 'How.', picture: PICTURE },
      notes: [],
    });
    const { sent } = shown(card(), { fetchLinkPreview });
    fireEvent.click(screen.getByRole('button', { name: 'Fetch the preview' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(fetchLinkPreview).toHaveBeenCalledExactlyOnceWith('https://example.org/intake');
    expect(sent[0]).toEqual({
      type: 'batch',
      label: 'Fetch the preview of a link card',
      commands: [
        {
          type: 'update-free-shape',
          view: 'overview',
          id: 'guide',
          changes: {
            title: 'The intake guide',
            description: 'How.',
            picture: PICTURE,
            height: 280,
          },
        },
      ],
    });
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'The preview is set: undo takes it back.',
    );
  });

  it('says what the program left out, or why there is no preview', async () => {
    shown(card(), {
      fetchLinkPreview: fetched({ preview: {}, notes: ['The page’s image is left out.'] }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fetch the preview' }));
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'The page gives no title, description or image to show. The page’s image is left out.',
    );
  });

  it('offers no preview of an http address, and opens its address in a new tab', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const fetchLinkPreview = fetched({ preview: {}, notes: [] });
    shown(card({ url: 'http://intranet.local/' }), { fetchLinkPreview });
    expect(screen.getByRole('button', { name: 'Fetch the preview' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open the address' }));
    expect(open).toHaveBeenCalledWith('http://intranet.local/', '_blank', 'noopener,noreferrer');
  });

  it('adds a picture from a file, the card growing to show it, and takes it out', async () => {
    const putMedia = vi.fn<
      (name: string, bytes: Uint8Array) => Promise<LiveResult<MediaStoredMessage>>
    >(() =>
      Promise.resolve({
        ok: true as const,
        answer: {
          type: 'media/stored',
          requestId: 'r',
          media: PICTURE,
          removed: [],
        } satisfies MediaStoredMessage,
      }),
    );
    const { sent } = shown(card(), { putMedia });
    const chooser = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(chooser, {
      target: { files: [new File(['x'], 'guide.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(putMedia.mock.calls[0]?.[0]).toBe('guide.png');
    expect(sent[0]).toMatchObject({ changes: { picture: PICTURE, height: 280 } });
  });

  it('takes its picture out', () => {
    const { sent } = shown(card({ picture: PICTURE, height: 280 }));
    fireEvent.click(screen.getByRole('button', { name: 'Take its picture out' }));
    expect(sent[0]).toMatchObject({ changes: { picture: null } });
  });
});
