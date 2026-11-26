/**
 * A relation's traveler in its format panel (ADR 0110): a picture of the project chosen for only this
 * relation or for every relation of its type, its size, speed and spacing, sent whole, and "Send no
 * traveler", which takes an inherited one away; each change one command, which the core takes.
 */
import {
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { ImageDefinition } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo } from 'react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import { buildScene } from '../../canvas/scene';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { selectionOf } from '../../editor/selection';
import { untranslatedParts } from '../../i18n/translate';
import { loadSample } from '../../test/sample';
import { Inspector } from '../Inspector';
import {
  relationTypeTravelerCommand,
  travelerImagePackage,
  travelerPictureAction,
  travelerWith,
  withinRange,
} from '../definitions/travelerCommands';

const VIEW = 'system-overview';
const NS = 'xmlns="http://www.w3.org/2000/svg"';
const ENVELOPE: ImageDefinition = {
  kind: 'svg',
  id: 'clinic.envelope',
  name: 'Envelope',
  width: 24,
  height: 16,
  svg: `<svg viewBox="0 0 24 16" ${NS}><path d="M0 0h24v16H0z" fill="#3366AA"/></svg>`,
};

const sample = loadSample();
const withEnvelope: ProjectSnapshot = {
  ...sample,
  packages: sample.packages.map((file) =>
    file.id === 'clinic' ? { ...file, images: [...(file.images ?? []), ENVELOPE] } : file,
  ),
};
const RELATION = withEnvelope.model.relations[0]!;

function applied(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

function Harness({ project, send }: { project: ProjectSnapshot; send: SendCommand }) {
  const definitions = useMemo(() => definitionsIn(project), [project]);
  const view = project.views.find((each) => each.id === VIEW);
  const scene = useMemo(() => buildScene(project, VIEW), [project]);
  const editor: Editor = {
    project,
    definitions,
    viewId: VIEW,
    scene,
    selection: selectionOf([{ kind: 'relation', id: RELATION.id }]),
    select: vi.fn(),
    send,
    reveal: vi.fn(),
  };
  return (
    <EditorContext.Provider value={editor}>
      <Inspector view={view} scene={scene} definitions={definitions} />
    </EditorContext.Provider>
  );
}

function shown(project = withEnvelope) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  render(<Harness project={project} send={send} />);
  const traveler = screen.getByRole('group', { name: 'Traveler' });
  return { send, traveler };
}

function sent(send: Mock<SendCommand>): Command[] {
  return send.mock.calls.map(([command]) => command);
}

async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    for (let tick = 0; tick < 3; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('a relation’s traveler in its format panel', () => {
  it('sends a picture of the project for only this relation, as one command', async () => {
    const { send, traveler } = shown();
    await settle(() =>
      fireEvent.click(
        within(traveler).getByRole('button', { name: 'Use a picture already in the project' }),
      ),
    );
    await settle(() =>
      fireEvent.click(within(traveler).getByRole('button', { name: 'Use “Envelope”' })),
    );
    expect(sent(send)).toEqual([
      {
        type: 'update-relation',
        id: RELATION.id,
        changes: { appearanceTraits: { traveler: { image: ENVELOPE.id } } },
      },
    ]);
    const after = applied(withEnvelope, sent(send)[0]!);
    expect(after.model.relations[0]?.appearance?.traveler).toEqual({ image: ENVELOPE.id });
  });

  it('changes its size, speed and spacing whole, and sends none', async () => {
    const project = applied(withEnvelope, {
      type: 'update-relation',
      id: RELATION.id,
      changes: { appearanceTraits: { traveler: { image: ENVELOPE.id, size: 32 } } },
    });
    const { send, traveler } = shown(project);
    const size = within(traveler).getByLabelText('Size');
    expect(size).toHaveValue(32);
    fireEvent.change(size, { target: { value: '70' } });
    await settle(() => fireEvent.keyDown(size, { key: 'Enter' }));
    expect(sent(send)).toEqual([]);
    expect(within(traveler).getByText('Enter a size from 8 to 64 pixels.')).toBeInTheDocument();
    fireEvent.change(size, { target: { value: '32' } });
    await settle(() =>
      fireEvent.change(within(traveler).getByLabelText('Speed'), { target: { value: 'fast' } }),
    );
    const spacing = within(traveler).getByLabelText('Spacing');
    fireEvent.change(spacing, { target: { value: '400' } });
    await settle(() => fireEvent.keyDown(spacing, { key: 'Enter' }));
    await settle(() =>
      fireEvent.click(within(traveler).getByRole('button', { name: 'Send no traveler' })),
    );
    const traits = sent(send).map(
      (command) => (command as Extract<Command, { type: 'update-relation' }>).changes,
    );
    expect(traits).toEqual([
      { appearanceTraits: { traveler: { image: ENVELOPE.id, size: 32, speed: 'fast' } } },
      { appearanceTraits: { traveler: { image: ENVELOPE.id, size: 32, spacing: 400 } } },
      { appearanceTraits: { traveler: 'none' } },
    ]);
    for (const command of sent(send)) applied(project, command);
  });

  it('sets every relation of its type at the level the project can change, taking its own back', async () => {
    const own = applied(withEnvelope, {
      type: 'update-relation',
      id: RELATION.id,
      changes: { appearanceTraits: { traveler: { image: ENVELOPE.id } } },
    });
    const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    render(<Harness project={own} send={send} />);
    await settle(() => fireEvent.click(screen.getByRole('radio', { name: /^Every / })));
    const traveler = screen.getByRole('group', { name: 'Traveler' });
    await settle(() =>
      fireEvent.click(
        within(traveler).getByRole('button', { name: 'Use a picture already in the project' }),
      ),
    );
    await settle(() =>
      fireEvent.click(within(traveler).getByRole('button', { name: 'Use “Envelope”' })),
    );
    const [command] = sent(send);
    expect(command).toMatchObject({
      type: 'batch',
      commands: [
        {
          type: 'set-relation-type-appearance',
          relationType: RELATION.relationType,
          appearanceTraits: { traveler: { image: ENVELOPE.id } },
        },
        {
          type: 'update-relation',
          id: RELATION.id,
          changes: { appearanceTraits: { traveler: null } },
        },
      ],
    });
    applied(own, command!);
  });
});

describe('the traveler’s commands', () => {
  it('keeps the fields it does not change and leaves defaults out', () => {
    expect(travelerWith({ image: 'a.b', size: 30 }, { speed: 'fast' })).toEqual({
      image: 'a.b',
      size: 30,
      speed: 'fast',
    });
    expect(
      travelerWith({ image: 'a.b', size: 30, speed: 'fast' }, { size: 20, speed: 'normal' }),
    ).toEqual({ image: 'a.b' });
    expect(withinRange('8', { min: 8, max: 64 })).toBe(true);
    expect(withinRange('', { min: 8, max: 64 })).toBe(false);
    expect(withinRange('2001', { min: 40, max: 2000 })).toBe(false);
  });

  it('defines a new picture in the relation type’s package, in the same action', () => {
    expect(travelerImagePackage(withEnvelope, 'clinic.sends-reminder').package).toBe('clinic');
    const action = travelerPictureAction(
      withEnvelope,
      'systems.communicates-with',
      {
        kind: 'new',
        picture: {
          ok: true,
          name: 'Truck',
          content: { svg: `<svg viewBox="0 0 10 10" ${NS}><path d="M0 0h10v10H0z"/></svg>` },
          removed: [],
        } as never,
      },
      { image: ENVELOPE.id, speed: 'slow' },
      (traveler) => relationTypeTravelerCommand('systems.communicates-with', traveler),
      'Change the appearance of the relation type "communicates with"',
    );
    expect(action).toMatchObject({
      type: 'batch',
      commands: [
        { type: 'define-image', package: 'clinic' },
        {
          type: 'set-relation-type-appearance',
          appearanceTraits: { traveler: { speed: 'slow' } },
        },
      ],
    });
    applied(withEnvelope, action!);
  });

  it('reads in Spanish', () => {
    for (const text of [
      'Traveler',
      'Travelers',
      'Send no traveler',
      'Enter a size from 8 to 64 pixels.',
      'The traveler size of the relation "X" is a number from 8 to 64.',
      'The relation "X" cannot send the image "a.b" as its traveler: no package in use defines it.',
      'The travelers of a view move ("moving", or null), stand "still" or are "hidden", not "x".',
      'The image "a.b" cannot be removed: 2 components, elements, relation types or relations show it.',
    ]) {
      expect(untranslatedParts('es', text)).toEqual([]);
    }
  });
});
