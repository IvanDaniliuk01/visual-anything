/**
 * The way of a package's changes to the person's review (ADR 0089's M14.3 clarification): one run at
 * a time; the changes previewed on the project as the tab holds it when the code answers; and a run
 * that leaves nothing to review says why, in the language read in.
 */
import { notApprovedProblem, type PackageCodeChanges } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import type { PackageAnswer } from '../code/messages';
import { codeProject } from '../code/test/project';
import { translatorFor } from '../i18n/t';
import { PackageChangesStore, type PackageChangesRequest } from './changes';
import { outcomeText } from './run';

const GAUGES = { id: 'gauges', name: 'Gauges' };

function request(
  answer: PackageAnswer<PackageCodeChanges>,
  hold?: Promise<void>,
): PackageChangesRequest {
  return {
    package: GAUGES,
    label: 'Check them',
    ask: async () => {
      await hold;
      return answer;
    },
  };
}

const RENAME: PackageCodeChanges = {
  label: 'Rename the oven',
  commands: [{ type: 'update-element', id: 'oven', changes: { name: 'Stove' } }],
};

function store() {
  const made = new PackageChangesStore();
  const project = codeProject();
  made.attach(() => project);
  return { store: made, project };
}

describe('the changes of a package’s action', () => {
  it('say that the code runs, then wait for review, previewed on the project now', async () => {
    const { store: changes, project } = store();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = changes.run(request({ ok: true, value: RENAME }, held));
    expect(changes.snapshot()).toMatchObject({
      state: 'running',
      request: { label: 'Check them' },
    });
    release();
    expect(await running).toEqual({ kind: 'review' });
    const state = changes.snapshot();
    if (state.state !== 'reviewing') throw new Error('No review');
    expect(state.older).toBe(project);
    expect(state.preview.command).toEqual({ type: 'batch', ...RENAME });
    expect(state.preview.project.model.elements.find((each) => each.id === 'oven')?.name).toBe(
      'Stove',
    );
    // The project itself is untouched until the person accepts.
    expect(project.model.elements.find((each) => each.id === 'oven')?.name).toBe('Oven');
    changes.close();
    expect(changes.snapshot()).toEqual({ state: 'idle' });
  });

  it('runs one at a time', async () => {
    const { store: changes } = store();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = changes.run(request({ ok: true, value: RENAME }, held));
    expect(await changes.run(request({ ok: true, value: RENAME }))).toEqual({ kind: 'busy' });
    release();
    expect(await first).toEqual({ kind: 'review' });
  });

  it('drops what answers after the run was closed', async () => {
    const { store: changes } = store();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = changes.run(request({ ok: true, value: RENAME }, held));
    changes.close();
    release();
    expect(await running).toEqual({ kind: 'dropped' });
    expect(changes.snapshot()).toEqual({ state: 'idle' });
  });

  it('ends with why there is nothing to review, in the language read in', async () => {
    const { store: changes } = store();
    const t = translatorFor('es');
    const none = request({ ok: true, value: { label: 'Nothing', commands: [] } });
    const nothing = await changes.run(none);
    expect(nothing).toEqual({ kind: 'none' });
    expect(outcomeText(t, none, nothing)).toBe(
      '“Check them”, del paquete “Gauges”, no propone ningún cambio.',
    );

    const failing = request({ ok: false, problem: notApprovedProblem(GAUGES) });
    const failed = await changes.run(failing);
    expect(failed).toMatchObject({ kind: 'failed' });
    expect(outcomeText(t, failing, failed)).toBe(
      'El código del paquete "Gauges" no está aprobado: la persona lo aprueba en la app antes de que se ejecute.',
    );

    // One command that breaks a rule refuses them all, as a batch is refused whole.
    const breaking = request({
      ok: true,
      value: {
        label: 'Break',
        commands: [...RENAME.commands, { type: 'update-element', id: 'nowhere', changes: {} }],
      },
    });
    const refused = await changes.run(breaking);
    expect(refused).toMatchObject({ kind: 'refused' });
    expect(outcomeText(t, breaking, refused)).toMatch(
      /^Los cambios que propone “Check them”, del paquete “Gauges”, no se pueden aplicar: /,
    );
    expect(changes.snapshot()).toEqual({ state: 'idle' });
  });
});
