import type { Command } from '@visual-anything/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Container } from 'pixi.js';
import { StrictMode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SELECTION, type Selection } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { fitCamera, worldToScreen } from './camera';
import { CanvasArea, type SendCommand } from './CanvasArea';
import { centerOf } from './geometry';
import { buildScene, type Scene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const project = loadSample();
const view = project.views[0]!;
const scene = buildScene(project, view.id);
const LABEL = 'System overview';
const SIZE = { width: 1000, height: 600 };

function sizeOf(element: HTMLElement, width: number, height: number): void {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
}

/** Runs `action`, which settles a pending start, and lets the canvas area react to it. */
async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await Promise.resolve();
  });
}

/** The canvas area with its selection kept, as the shell keeps it. */
function Harness(props: {
  scene?: Scene;
  onCommand?: SendCommand;
  onSelect?: (selection: Selection) => void;
}) {
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  return (
    <CanvasArea
      project={project}
      view={view}
      scene={props.scene ?? scene}
      label={LABEL}
      selection={selection}
      onSelect={(next) => {
        setSelection(next);
        props.onSelect?.(next);
      }}
      {...(props.onCommand ? { onCommand: props.onCommand } : {})}
    />
  );
}

/** Starts the canvas at a known size, and returns its host and where a scene point is on screen. */
async function started(element: React.ReactElement) {
  const result = render(element);
  const host = screen.getByRole('img', { name: LABEL });
  sizeOf(host, SIZE.width, SIZE.height);
  const [app] = FakeApplication.created as [FakeApplication];
  await settle(() => app.finishInit());
  const camera = fitCamera(scene.bounds, SIZE, 32);
  const at = (key: string) => {
    const shape = scene.shapes.find((each) => each.key === key);
    if (!shape) throw new Error(key);
    return worldToScreen(camera, centerOf(shape.rect));
  };
  return { ...result, host, app, camera, at };
}

function point(
  type: string,
  host: HTMLElement,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
) {
  fireEvent(
    host,
    new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, ...extra }),
  );
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

describe('CanvasArea', () => {
  it('describes the view to assistive technology', () => {
    render(<Harness />);
    expect(screen.getByRole('img', { name: LABEL })).toBeInTheDocument();
  });

  it('starts a WebGL canvas and attaches it once it is ready', async () => {
    render(<Harness />);
    const host = screen.getByRole('img', { name: LABEL });
    const [app] = FakeApplication.created;
    expect(app?.initOptions).toMatchObject({ preference: 'webgl' });
    expect(host.querySelector('canvas')).toBeNull();
    await settle(() => app?.finishInit());
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('keeps one canvas when StrictMode mounts twice, destroying the Application of the first mount', async () => {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    const host = screen.getByRole('img', { name: LABEL });
    const [first, second] = FakeApplication.created as [FakeApplication, FakeApplication];
    await settle(() => {
      second.finishInit();
      first.finishInit();
    });
    expect(first.destroyed).toBe(true);
    expect(second.destroyed).toBe(false);
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('destroys its Application when it goes away, even before its start finishes', async () => {
    const { unmount } = render(<Harness />);
    const [app] = FakeApplication.created as [FakeApplication];
    unmount();
    await settle(() => app.finishInit());
    expect(app.destroyed).toBe(true);
  });

  it('fits the scene into the canvas area when it first draws it', async () => {
    const { app, camera } = await started(<Harness />);
    const world = app.stage.contents.find((item): item is Container => item instanceof Container);
    expect(app.renderer.screen).toEqual(SIZE);
    expect(world?.scale.x).toBeCloseTo(camera.scale);
    expect(world?.position.x).toBeCloseTo(camera.x);
    expect(screen.getByRole('status', { name: 'Zoom' }).textContent).toBe(
      `${Math.round(camera.scale * 100)}%`,
    );
  });

  it('selects the shape under a click, and clears the selection on a click on empty canvas', async () => {
    const onSelect = vi.fn();
    const { host, at } = await started(<Harness onSelect={onSelect} />);
    const api = at('clinic-booking/scheduling/appointments-api');
    point('pointerdown', host, api.x, api.y);
    point('pointerup', host, api.x, api.y);
    expect([...(onSelect.mock.lastCall?.[0] as Selection).elements]).toEqual(['appointments-api']);

    point('pointerdown', host, 2, 2);
    point('pointerup', host, 2, 2);
    expect((onSelect.mock.lastCall?.[0] as Selection).elements.size).toBe(0);
  });

  it('moves a dragged shape by the distance dragged, pinned, in one command', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at, camera } = await started(<Harness onCommand={onCommand} />);
    const patient = at('patient');
    point('pointerdown', host, patient.x, patient.y);
    point('pointermove', host, patient.x + 50, patient.y + 20);
    point('pointerup', host, patient.x + 50, patient.y + 20);
    await act(async () => Promise.resolve());
    const command = onCommand.mock.lastCall?.[0] as Command;
    expect(command).toEqual({
      type: 'set-positions',
      view: view.id,
      positions: [
        {
          element: 'patient',
          x: Math.round(40 + 50 / camera.scale),
          y: Math.round(200 + 20 / camera.scale),
          pinned: true,
        },
      ],
    });
  });

  it('shows what a deletion cascades to before deleting it', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at } = await started(<Harness onCommand={onCommand} />);
    const api = at('clinic-booking/scheduling/appointments-api');
    point('pointerdown', host, api.x, api.y);
    point('pointerup', host, api.x, api.y);
    fireEvent.keyDown(host, { key: 'Delete' });

    const dialog = screen.getByRole('dialog', { name: 'Delete "Appointments API"?' });
    expect(dialog).toHaveTextContent('These 5 relations end on what you delete');
    expect(dialog).toHaveTextContent('Patient books an appointment');
    expect(onCommand).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await Promise.resolve();
    });
    expect(onCommand.mock.lastCall?.[0]).toEqual({
      type: 'delete',
      elements: ['appointments-api'],
      relations: [],
    });
  });

  it('changes nothing without a way to send commands', async () => {
    const { host, at } = await started(<Harness />);
    const patient = at('patient');
    point('pointerdown', host, patient.x, patient.y);
    point('pointermove', host, patient.x + 50, patient.y);
    point('pointerup', host, patient.x + 50, patient.y);
    fireEvent.keyDown(host, { key: 'Delete' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('says so when the view draws nothing', () => {
    const empty: Scene = { shapes: [], relations: [], notes: [], arrows: [], bounds: undefined };
    render(<Harness scene={empty} />);
    expect(screen.getByText('This view has no shapes yet.')).toBeInTheDocument();
  });

  it('explains that the canvas could not draw the view when WebGL is unavailable', async () => {
    render(<Harness />);
    const [app] = FakeApplication.created as [FakeApplication];
    await settle(() =>
      app.failInit(new Error('No available renderer for the current environment')),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /could not draw this view.*No available renderer/,
    );
  });

  it('reports a scene it fails to draw in the canvas area, leaving the rest of the app alone', async () => {
    const broken = {
      ...scene,
      shapes: [{ ...scene.shapes[0], rect: undefined }],
    } as unknown as Scene;
    render(<Harness scene={broken} />);
    const [app] = FakeApplication.created as [FakeApplication];
    await settle(() => app.finishInit());
    expect(screen.getByRole('alert')).toHaveTextContent(/could not draw this view/);
    expect(screen.getByRole('img', { name: LABEL })).toBeInTheDocument();
  });
});
