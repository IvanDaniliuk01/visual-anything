/**
 * The inspector's video (ADR 0098, stage 2): Play and Stop ask the canvases to play or stop it, and
 * say which it does now; "Make its poster", for a video without one, makes it from the video's file,
 * has the program keep it, and gives it to the video as one change; a frame the browser cannot show is
 * said.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Command, MediaStoredMessage } from '@visual-anything/core';
import type { MediaRef, Picture } from '@visual-anything/schema';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onToggleVideo, reportPlaying } from '../../canvas/pictures/playing';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import type { LiveResult } from '../../live/connection';
import { LiveContext, type Live } from '../../live/context';
import { PictureInspector } from './PictureInspector';

const makePoster = vi.hoisted(() => vi.fn<(video: Blob) => Promise<Uint8Array | undefined>>());
vi.mock('../../canvas/pictures/poster', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../canvas/pictures/poster')>()),
  makePoster,
}));

const VIDEO: MediaRef = { hash: 'c'.repeat(64), format: 'mp4', width: 64, height: 36, bytes: 90 };
const POSTER: MediaRef = { hash: 'e'.repeat(64), format: 'jpeg', width: 64, height: 36, bytes: 9 };

const video = (more: Partial<Picture> = {}): Picture => ({
  kind: 'picture',
  id: 'clip',
  x: 0,
  y: 0,
  width: 64,
  height: 36,
  media: VIDEO,
  name: 'Check-in',
  ...more,
});

function shown(picture: Picture, live: Partial<Live> = {}) {
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
  render(<PictureInspector picture={picture} viewId="overview" />, { wrapper });
  return { sent };
}

const canvas = {};

afterEach(() => {
  reportPlaying(canvas, new Set());
  makePoster.mockReset();
});

describe('the inspector’s video', () => {
  it('asks the canvases to play it, and says Stop while it plays', () => {
    const asked: string[] = [];
    const stop = onToggleVideo((id) => asked.push(id));
    shown(video({ poster: POSTER }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(asked).toEqual(['clip']);
    act(() => reportPlaying(canvas, new Set(['clip'])));
    const playing = screen.getByRole('button', { name: 'Stop' });
    expect(playing.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(playing);
    expect(asked).toEqual(['clip', 'clip']);
    act(() => reportPlaying(canvas, new Set()));
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    stop();
  });

  it('offers to make a poster only for a video without one', () => {
    shown(video({ poster: POSTER }));
    expect(screen.queryByRole('button', { name: 'Make its poster' })).toBeNull();
  });

  it('makes its poster from its file, has it kept, and gives it to the video', async () => {
    makePoster.mockResolvedValue(Uint8Array.of(1, 2, 3));
    const getMediaFile = vi.fn(() =>
      Promise.resolve({ ok: true as const, answer: Uint8Array.of(9) }),
    );
    const putMedia = vi.fn<
      (name: string, bytes: Uint8Array) => Promise<LiveResult<MediaStoredMessage>>
    >(() =>
      Promise.resolve({
        ok: true as const,
        answer: {
          type: 'media/stored',
          requestId: 'r',
          media: POSTER,
          removed: [],
        } satisfies MediaStoredMessage,
      }),
    );
    const { sent } = shown(video(), { getMediaFile, putMedia });
    fireEvent.click(screen.getByRole('button', { name: 'Make its poster' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(getMediaFile).toHaveBeenCalledWith(VIDEO.hash);
    expect(makePoster.mock.calls[0]?.[0].type).toBe('video/mp4');
    expect(putMedia.mock.calls[0]?.[0]).toBe('Check-in-poster.jpg');
    expect(sent[0]).toEqual({
      type: 'update-free-shape',
      view: 'overview',
      shape: { ...video(), poster: POSTER },
    });
  });

  it('says so when the browser shows no frame of it, and changes nothing', async () => {
    makePoster.mockResolvedValue(undefined);
    const { sent } = shown(video(), {
      getMediaFile: () => Promise.resolve({ ok: true, answer: Uint8Array.of(9) }),
      putMedia: vi.fn(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Make its poster' }));
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'The browser could not show a frame of this video.',
    );
    expect(sent).toEqual([]);
  });
});
