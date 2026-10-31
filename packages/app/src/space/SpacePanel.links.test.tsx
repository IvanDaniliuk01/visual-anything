/**
 * The physical-space panel and what it is asked to show (ADR 0076), against the stand-in worker: it
 * takes up a framing, keeps the camera the worker answers in its state and drops the request; it
 * keeps where each frame was drawn from; it draws the relations markers travel along on the
 * canvas, the scenario step played, as lines with their markers; and, while Relations of the
 * selection is on, the relations of the selection that the view draws and its emphasis does not hide.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EmphasisContext, EmphasisStore } from '../editor/emphasis';
import { HoverContext, HoverStore } from '../editor/hover';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../editor/selection';
import { createSolidClient } from '../solids/client';
import { StandInSolidWorker } from '../solids/stand-in';
import { workcell } from '../test/space';
import { SpacePanelContext } from './context';
import { SpacePanel } from './SpacePanel';
import { SpacePanelStore } from './store';

const VIEW = 'cell-view';

/** The workcell with a relation from the camera to the arm, and one from the table to that one. */
function flowing(): ProjectSnapshot {
  const project = workcell();
  return {
    ...project,
    model: {
      ...project.model,
      relations: [
        ...project.model.relations,
        { id: 'sees', relationType: FLOWS, from: 'camera', to: 'arm' },
        { id: 'feeds', relationType: FLOWS, from: 'table', to: 'sees' },
        { id: 'lights', relationType: FLOWS, from: 'lamp', to: 'arm' },
      ],
    },
    packages: project.packages.map((each) => ({
      ...each,
      relationTypes: [
        ...(each.relationTypes ?? []),
        { id: FLOWS, name: 'flows to', derivesFrom: 'relates-to' },
      ],
    })),
  };
}

const FLOWS = 'cell.flows';

function setUp(options: { project?: ProjectSnapshot } = {}) {
  const project = options.project ?? workcell();
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
  const scene = buildScene(project, VIEW);
  const hovers = new HoverStore();
  // The panel's tools read the editor: what it can change, and the selection.
  const panel = (selection: Selection) => (
    <EditorContext.Provider value={{ project, viewId: VIEW, selection } as unknown as Editor}>
      <EmphasisContext.Provider value={emphasis}>
        <SpacePanelContext value={store}>
          <HoverContext value={hovers}>
            <SpacePanel
              id="space-panel"
              store={store}
              project={project}
              view={view}
              scene={scene}
              selection={selection}
              client={client}
            />
          </HoverContext>
        </SpacePanelContext>
      </EmphasisContext.Provider>
    </EditorContext.Provider>
  );
  const rendered = render(panel(EMPTY_SELECTION));
  const select = (selection: Selection) => rendered.rerender(panel(selection));
  const tick = (ms: number) =>
    act(() => {
      time += ms;
      for (const frame of frames.splice(0)) frame();
    });
  return { store, emphasis, worker: () => workers.at(-1), tick, select };
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
        ends: { from: 'camera', to: 'table' },
      },
    ]);
    act(() => emphasis.set('playback', undefined));
    expect(worker()?.ofType('space/update').at(-1)?.lines).toEqual([]);
  });
});

describe('the relations of the selection drawn in space', () => {
  /** The lines the worker was last sent, by the newest message that said. */
  const linesSent = (worker: StandInSolidWorker | undefined) => {
    const updates = worker?.ofType('space/update').filter((update) => 'lines' in update);
    const last = updates?.at(-1);
    return last ? last.lines : worker?.ofType('space/show').at(-1)?.lines;
  };

  it('draws none while Relations of the selection is off, and those of the selection while it is on', async () => {
    const { store, worker, select } = setUp({ project: flowing() });
    act(() => store.open(VIEW, {}));
    await settle();
    act(() => select(selectionOf([{ kind: 'element', id: 'camera' }])));
    expect(linesSent(worker()) ?? []).toEqual([]);
    act(() => store.set(VIEW, { relations: true }));
    // The camera's relations the view draws: "sees", not its containment in the table.
    expect(linesSent(worker())).toEqual([
      {
        relation: 'sees',
        from: { x: 0, y: 0.8, z: 0 },
        to: { x: 2, y: 1, z: 0 },
        ends: { from: 'camera', to: 'arm' },
      },
    ]);
    // A relation selected is drawn selected, and one on a line drawn ends at its middle.
    act(() =>
      select(
        selectionOf([
          { kind: 'element', id: 'camera' },
          { kind: 'relation', id: 'feeds' },
        ]),
      ),
    );
    const lines = linesSent(worker()) ?? [];
    expect(lines.find((line) => line.relation === 'feeds')).toEqual({
      relation: 'feeds',
      from: { x: 0, y: 0, z: 0 },
      to: { x: 1, y: 0.9, z: 0 },
      selected: true,
      ends: { from: 'table', to: 'sees' },
    });
    // The lamp is in no place, so its relation to the arm has no line, even with the arm selected.
    act(() => select(selectionOf([{ kind: 'element', id: 'arm' }])));
    expect((linesSent(worker()) ?? []).map((line) => line.relation)).toEqual(['sees']);
    act(() => store.set(VIEW, {}));
    expect(linesSent(worker())).toEqual([]);
  });

  it('leaves out what the canvas’s emphasis hides, draws faintly what it dims, and joins the markers’ lines', async () => {
    const { store, emphasis, worker, select } = setUp({ project: flowing() });
    act(() => store.open(VIEW, { relations: true }));
    await settle();
    act(() => select(selectionOf([{ kind: 'element', id: 'camera' }])));
    expect((linesSent(worker()) ?? []).map((line) => line.relation)).toEqual(['sees']);
    act(() => emphasis.set('filter', { hidden: new Set(['sees']) }));
    expect(linesSent(worker())).toEqual([]);
    act(() => emphasis.set('filter', { dimmed: new Set(['sees']) }));
    expect(linesSent(worker())?.[0]?.faint).toBe(true);
    act(() => emphasis.set('filter', undefined));
    // A step played along the same relation draws it once, highlighted, with its marker.
    act(() =>
      emphasis.set('playback', {
        highlighted: new Set(['sees']),
        markers: [{ relation: 'sees', progress: 0.5 }],
      }),
    );
    const lines = linesSent(worker()) ?? [];
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ relation: 'sees', highlighted: true, markers: [0.5] });
  });
});
