/**
 * A solid's preview that turns (ADR 0075): one turning of the solid worker while it shows, from the
 * camera given, which the keys, a drag and the wheel turn as on the canvas; Use this view keeps the
 * camera it is seen from, and a camera given anew moves it there.
 */
import type { SolidCamera } from '@visual-anything/schema';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import type { SolidClient, SolidTurning } from '../../solids/client';
import type { SolidView } from '../../solids/protocol';
import { SolidPreview } from './SolidPreview';

const HASH = 'a'.repeat(64);
const CAMERA: SolidCamera = { azimuth: 30, elevation: 20 };

function fakeClient() {
  const session = {
    turn: 1,
    frame: undefined,
    camera: vi.fn<SolidTurning['camera']>(),
    play: vi.fn<SolidTurning['play']>(),
    end: vi.fn<SolidTurning['end']>(),
  };
  const turn = vi.fn<(view: SolidView) => SolidTurning>(() => session);
  const client = {
    started: true,
    limits: undefined,
    contextLost: false,
    unavailable: false,
    problem: () => undefined,
    turn,
  } as unknown as SolidClient;
  return { client, session, turn };
}

function renderPreview(camera: SolidCamera, client: SolidClient, onUseView = vi.fn()) {
  const view = (at: SolidCamera) => (
    <LanguageProvider language="en">
      <SolidPreview
        hash={HASH}
        name="Arm"
        label="A six-axis arm on a round base."
        camera={at}
        lighting="flat"
        size={100}
        client={client}
        onUseView={onUseView}
      />
    </LanguageProvider>
  );
  const rendered = render(view(camera));
  return { ...rendered, onUseView, rerender: (at: SolidCamera) => rendered.rerender(view(at)) };
}

describe('a solid’s preview', () => {
  it('turns the solid live from the camera given, in its light', () => {
    const { client, turn, session } = fakeClient();
    const { unmount } = renderPreview(CAMERA, client);
    expect(turn).toHaveBeenCalledTimes(1);
    expect(turn.mock.calls[0]?.[0]).toMatchObject({
      solid: HASH,
      camera: CAMERA,
      lighting: 'flat',
      hidden: [],
      parts: false,
    });
    expect(screen.getByRole('img', { name: 'A six-axis arm on a round base.' })).toBeTruthy();
    unmount();
    expect(session.end).toHaveBeenCalledTimes(1);
  });

  it('turns with the keys, announces where it is seen from, and keeps that view when asked', () => {
    const { client, session } = fakeClient();
    const { onUseView } = renderPreview(CAMERA, client);
    const keep = screen.getByRole('button', { name: 'Use this view' }) as HTMLButtonElement;
    // Nothing to keep while it is seen from the camera given.
    expect(keep.disabled).toBe(true);
    const picture = screen.getByRole('img', { name: 'A six-axis arm on a round base.' });
    fireEvent.keyDown(picture, { key: 'ArrowUp' });
    expect(session.camera).toHaveBeenLastCalledWith({ azimuth: 30, elevation: 35 });
    expect(screen.getByText(/^Arm, seen from/)).toBeTruthy();
    fireEvent.click(keep);
    expect(onUseView).toHaveBeenCalledWith({ azimuth: 30, elevation: 35 });
    // 0 goes back to the camera given.
    fireEvent.keyDown(picture, { key: '0' });
    expect(session.camera).toHaveBeenLastCalledWith(CAMERA);
  });

  it('turns with a drag and zooms with the wheel', () => {
    const { client, session } = fakeClient();
    renderPreview(CAMERA, client);
    const picture = screen.getByRole('img', { name: 'A six-axis arm on a round base.' });
    fireEvent.pointerDown(picture, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(picture, { clientX: 50, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(picture, { pointerId: 1 });
    const turned = session.camera.mock.calls.at(-1)?.[0];
    expect(turned?.azimuth).not.toBe(30);
    fireEvent.wheel(picture, { deltaY: -500 });
    expect(session.camera.mock.calls.at(-1)?.[0].zoom).toBe(2);
  });

  it('moves to a camera given anew, without starting another turning', () => {
    const { client, session, turn } = fakeClient();
    const { rerender } = renderPreview(CAMERA, client);
    act(() => rerender({ azimuth: -90, elevation: 0 }));
    expect(turn).toHaveBeenCalledTimes(1);
    expect(session.camera).toHaveBeenLastCalledWith({ azimuth: -90, elevation: 0 });
  });

  it('says so where nothing draws solids', () => {
    renderPreview(CAMERA, {
      unavailable: true,
      problem: () => undefined,
    } as unknown as SolidClient);
    expect(screen.getByRole('img', { name: 'A six-axis arm on a round base.' }).textContent).toBe(
      'No preview here: the solid is drawn where Visual Anything draws solids.',
    );
    expect(screen.queryByRole('button', { name: 'Use this view' })).toBeNull();
  });
});
