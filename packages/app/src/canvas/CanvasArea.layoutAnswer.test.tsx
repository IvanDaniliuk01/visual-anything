/**
 * A tab that passes Claude's layout over says so (M3d, "Fixes from use"), so that `lay_out_view`
 * stops waiting for it: a layout of another view runs only in the tab the person used last
 * (ADR 0029's clarification of 2026-10-26).
 */
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SELECTION } from '../editor/selection';
import type { GuidanceState } from '../guidance/state';
import { setTabUseForTests, trackTabUse, type TabUse } from '../guidance/tabs';
import { LiveContext } from '../live/context';
import { fakeLive } from '../test/fakeLive';
import { loadSample } from '../test/sample';
import { CanvasArea } from './CanvasArea';
import { buildScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const usedElsewhere: TabUse = {
  used: () => undefined,
  isLastUsed: () => false,
  dispose: () => undefined,
};

afterEach(() => setTabUseForTests(trackTabUse({ channel: undefined, shown: true })));

const project = loadSample();
const view = project.views[0]!;

function canvasWith(guidance: GuidanceState) {
  const answerLayout = vi.fn();
  render(
    <LiveContext value={fakeLive({ project, guidance, answerLayout })}>
      <CanvasArea
        project={project}
        view={view}
        scene={buildScene(project, view.id)}
        label={view.name}
        selection={EMPTY_SELECTION}
        onSelect={() => undefined}
      />
    </LiveContext>,
  );
  return answerLayout;
}

describe('a layout Claude waits for, in a tab that passes it over', () => {
  it('answers that another tab runs it, once', () => {
    setTabUseForTests(usedElsewhere);
    const answered = canvasWith({ layout: { view: 'another-view', request: 1, answer: 'a' } });
    expect(answered).toHaveBeenCalledTimes(1);
    expect(answered).toHaveBeenCalledWith('a', { passed: 'other-tab' });
  });

  it('answers nothing for a layout no one waits for, or one this tab runs', () => {
    setTabUseForTests(usedElsewhere);
    expect(canvasWith({ layout: { view: 'another-view', request: 1 } })).not.toHaveBeenCalled();
    expect(
      canvasWith({ layout: { view: view.id, request: 1, answer: 'b' } }),
    ).not.toHaveBeenCalledWith('b', { passed: 'other-tab' });
  });
});
