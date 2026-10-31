/**
 * Turning in a read-only page (ADR 0075): a page that holds its solids' files turns the selected
 * shape's solid as the app does, with T, the keys and Escape, through the worker it holds; selecting
 * something else ends it; a page without a worker turns nothing.
 */
import { fireEvent } from '@testing-library/react';
import { encodeBase64, solidHash } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexScene } from '../canvas/hit';
import { buildScene } from '../canvas/scene';
import { EMPTY_SELECTION, selectionOf } from '../editor/selection';
import { StandInSolidWorker } from '../solids/stand-in';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { ARM_FILE, withSolids } from '../test/solids';
import { ViewerController } from './controller';
import { pageSolidClient } from './solid-clients';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

async function settle(): Promise<void> {
  for (let round = 0; round < 10; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

async function page(withWorker: boolean) {
  const host = document.createElement('div');
  host.tabIndex = 0;
  document.body.append(host);
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1000 });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: 600 });
  const workers: StandInSolidWorker[] = [];
  const solids = pageSolidClient(
    { form: 'files', files: { [solidHash(ARM_FILE)]: encodeBase64(ARM_FILE) } },
    withWorker
      ? () => {
          const worker = new StandInSolidWorker();
          workers.push(worker);
          return worker;
        }
      : undefined,
  );
  const announced: string[] = [];
  const controller = new ViewerController(
    host,
    {
      select: () => undefined,
      collapse: () => undefined,
      camera: () => undefined,
      failure: (error) => {
        throw error;
      },
      announce: (text) => announced.push(text),
    },
    solids ? { solids } : {},
  );
  const [app] = FakeApplication.created.slice(-1) as [FakeApplication];
  app.finishInit();
  await Promise.resolve();
  await Promise.resolve();
  const project = withSolids();
  controller.update(project, indexScene(buildScene(project, 'robot')));
  controller.setSelection(selectionOf([{ kind: 'element', id: 'motor' }]));
  return { host, controller, announced, workers };
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  // No frame is drawn: what turning sends the worker is what these look at.
  vi.stubGlobal('requestAnimationFrame', () => 0);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('turning in a read-only page', () => {
  it('turns the selected shape’s solid with T and the keys, and ends with Escape', async () => {
    const { host, announced, workers } = await page(true);
    fireEvent.keyDown(host, { key: 't' });
    expect(announced.at(-1)).toMatch(/^Motor, seen from .*Escape to stop\.$/);
    await settle();
    const worker = workers.at(-1);
    expect(worker?.ofType('turn/start')).toHaveLength(1);
    fireEvent.keyDown(host, { key: 'ArrowLeft' });
    await settle();
    expect(worker?.ofType('turn/camera').length).toBeGreaterThan(0);
    expect(announced.at(-1)).toMatch(/^Motor, seen from /);
    fireEvent.keyDown(host, { key: 'Escape' });
    expect(announced.at(-1)).toBe('Stopped turning Motor.');
    expect(worker?.ofType('turn/end')).toHaveLength(1);
  });

  it('ends when something else is selected', async () => {
    const { host, controller, announced } = await page(true);
    fireEvent.keyDown(host, { key: 'T' });
    controller.setSelection(EMPTY_SELECTION);
    expect(announced.at(-1)).toBe('Stopped turning Motor.');
  });

  it('turns nothing in a page that holds no solid worker', async () => {
    const { host, announced } = await page(false);
    fireEvent.keyDown(host, { key: 't' });
    expect(announced.some((text) => text.includes('seen from'))).toBe(false);
  });
});
