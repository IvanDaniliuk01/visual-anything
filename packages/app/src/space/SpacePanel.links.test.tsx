/**
 * The physical-space panel and what it is asked to show (ADR 0076), against the stand-in worker: it
 * takes up a framing, keeps the camera the worker answers in its state and drops the request; it
 * keeps where each frame was drawn from; and it draws the relations markers travel along on the
 * canvas, the scenario step played, as lines with their markers.
 */
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/scene';
import { EmphasisContext, EmphasisStore } from '../editor/emphasis';
import { HoverContext, HoverStore } from '../editor/hover';
import { EMPTY_SELECTION } from '../editor/selection';
import { createSolidClient } from '../solids/client';
import { StandInSolidWorker } from '../solids/stand-in';
import { workcell } from '../test/space';
import { SpacePanelContext } from './context';
import { SpacePanel } from './SpacePanel';
import { SpacePanelStore } from './store';

const VIEW = 'cell-view';

function setUp() {
  const project = workcell();
  const view = project.views[0];
  if (!view) throw new Error('The workcell has a view.');
  let time = 0;
  const frames: (() => void)[] = [];
  const store = new SpacePanelStore({
    frames: { request: (callback) => frames.push(callback), cancel: () => undefined },
    windowWidth: () => 1600,
    now: () => time,
  });
  const emphasis = new EmphasisStore();
  const workers: StandInSolidWorker[] = [];
  const client = createSolidClient({
    files: {
      get: () => Promise.resolve({ ok: false, code: 'solid-file-missing', message: 'No.' }),
    },
    start: () => {
      const worker = new StandInSolidWorker();
      workers.push(worker);
      return worker;
    },
  });
  render(
    <EmphasisContext.Provider value={emphasis}>
      <SpacePanelContext value={store}>
        <HoverContext value={new HoverStore()}>
          <SpacePanel
            id="space-panel"
            store={store}
            project={project}
            view={view}
            scene={buildScene(project, VIEW)}
            selection={EMPTY_SELECTION}
            client={client}
          />
        </HoverContext>
      </SpacePanelContext>
    </EmphasisContext.Provider>,
  );
  const tick = (ms: number) =>
    act(() => {
      time += ms;
      for (const frame of frames.splice(0)) frame();
    });
  return { store, emphasis, worker: () => workers.at(-1), tick };
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 10; round++) await Promise.resolve();
  });
}

describe('the panel asked to frame', () => {
  it('frames the elements asked for, keeps the camera the worker answers, and drops the request', async () => {
    const { store, worker, tick } = setUp();
    act(() => store.open(VIEW, {}));
    await settle();
    // Where its frames are drawn from, which a move starts from.
    const drawn = store.moves.drawn(VIEW);
    expect(drawn?.root).toBeUndefined();
    expect(drawn?.aspect).toBeGreaterThan(0);
    act(() => store.frame(VIEW, ['camera']));
    await settle();
    const [framing] = worker()?.ofType('space/framing') ?? [];
    expect(framing?.elements).toEqual(['camera']);
    expect(store.framing(VIEW)).toBeUndefined();
    tick(1000);
    const camera = store.state(VIEW)?.camera;
    expect(camera).toBeDefined();
    // The camera is the panel's from now on, so the worker is sent it.
    const updates = worker()?.ofType('space/update') ?? [];
    expect(updates.at(-1)?.camera).toEqual(camera);
    expect(store.moves.byMove(VIEW, camera)).toBe(true);
  });
});

describe('relations drawn in space', () => {
  it('sends the lines of the relations markers travel along, with their markers, and none after', async () => {
    const { store, emphasis, worker } = setUp();
    act(() => store.open(VIEW, {}));
    await settle();
    act(() =>
      emphasis.set('playback', {
        highlighted: new Set(['camera-in-table']),
        markers: [{ relation: 'camera-in-table', progress: 0.5 }],
      }),
    );
    const sent = worker()?.ofType('space/update').at(-1);
    expect(sent?.lines).toEqual([
      {
        relation: 'camera-in-table',
        from: { x: 0, y: 0.8, z: 0 },
        to: { x: 0, y: 0, z: 0 },
        highlighted: true,
        markers: [0.5],
      },
    ]);
    act(() => emphasis.set('playback', undefined));
    expect(worker()?.ofType('space/update').at(-1)?.lines).toEqual([]);
  });
});
