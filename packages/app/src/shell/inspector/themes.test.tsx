/**
 * The inspector shows colors as the canvas draws them in the person's theme (ADR-0033): built-in
 * colors in their dark shades in the dark theme, stored colors as stored in both; and picking the
 * color already shown records nothing, in either theme (A2).
 */
import {
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo, useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import { buildScene } from '../../canvas/scene';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { selectionOf, type Selectable } from '../../editor/selection';
import { loadSample } from '../../test/sample';
import { changePreferences, resetPreferencesForTests } from '../../theme/store';
import { THEMES } from '../../theme/themes';
import { ColorRow } from '../definitions/ColorRow';
import { Inspector } from '../Inspector';

const sample = loadSample();

const element = (id: string): Selectable => ({ kind: 'element', id });
const relation = (id: string): Selectable => ({ kind: 'relation', id });
const freeShape = (id: string): Selectable => ({ kind: 'free-shape', id });

/** The inspector over the sample, applying what `send` accepts as the local program would. */
function Harness({
  send,
  selected,
  children,
}: {
  send: SendCommand;
  selected: Selectable[];
  children?: React.ReactNode;
}) {
  const [project, setProject] = useState<ProjectSnapshot>(sample);
  const latest = useRef(sample);
  const definitions = useMemo(() => definitionsIn(project), [project]);
  const view = project.views[0];
  const scene = useMemo(() => (view ? buildScene(project, view.id) : undefined), [project, view]);
  const [selection, setSelection] = useState(() => selectionOf(selected));
  const apply: SendCommand = async (command) => {
    const answer = await send(command);
    const outcome = executeCommand(latest.current, command);
    if (!outcome.ok) return { ok: false };
    latest.current = outcome.state;
    setProject(outcome.state);
    return answer;
  };
  const editor: Editor = {
    project,
    definitions,
    viewId: view?.id,
    scene,
    selection,
    select: setSelection,
    send: apply,
    reveal: () => {},
  };
  return (
    <EditorContext.Provider value={editor}>
      {children ?? <Inspector view={view} scene={scene} definitions={definitions} />}
    </EditorContext.Provider>
  );
}

function renderIn(
  theme: 'light' | 'dark',
  selected: Selectable[],
  children?: React.ReactNode,
): Mock<SendCommand> {
  changePreferences({ theme });
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  render(
    <Harness send={send} selected={selected}>
      {children}
    </Harness>,
  );
  return send;
}

async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Picks a color in a control, as the browser's picker does once a color is chosen. */
function pick(control: HTMLElement, color: string): Promise<void> {
  return settle(() => fireEvent.change(control, { target: { value: color } }));
}

function sent(send: Mock<SendCommand>): Command[] {
  return send.mock.calls.map(([command]) => command);
}

afterEach(() => {
  resetPreferencesForTests();
});

describe('the inspector’s colors, in each theme', () => {
  it('shows an element’s colors as the light canvas draws them', () => {
    renderIn('light', [element('patient')]);
    expect(screen.getByLabelText('Fill')).toHaveValue('#fde8cc');
    expect(screen.getByLabelText('Stroke')).toHaveValue('#8a5a12');
  });

  it('shows built-in colors in their dark shades in the dark theme, and stored ones as stored', () => {
    renderIn('dark', [element('booking-agent')]);
    // Its own fill, as stored; AI agent's stroke, in its dark shade.
    expect(screen.getByLabelText('Fill')).toHaveValue('#f8e1ec');
    expect(screen.getByLabelText('Stroke')).toHaveValue('#b39cf0');
    expect(screen.getByRole('textbox', { name: 'Stroke color code' })).toHaveValue('#B39CF0');
  });

  it('records nothing for the color shown in the dark theme, and stores the light value as one of its own', async () => {
    const send = renderIn('dark', [element('patient')]);
    const fill = screen.getByLabelText('Fill');
    expect(fill).toHaveValue('#3a2817');
    await pick(fill, '#3a2817');
    expect(send).not.toHaveBeenCalled();
    await pick(screen.getByLabelText('Fill'), '#fde8cc');
    expect(sent(send)).toEqual([
      { type: 'update-element', id: 'patient', changes: { appearanceTraits: { fill: '#FDE8CC' } } },
    ]);
    // Drawn as stored in both themes from now on.
    expect(screen.getByLabelText('Fill')).toHaveValue('#fde8cc');
    expect(screen.getByLabelText('Fill')).toHaveAccessibleDescription('its own');
  });

  it('follows a change of theme while it shows', async () => {
    renderIn('light', [element('patient')]);
    expect(screen.getByLabelText('Fill')).toHaveValue('#fde8cc');
    await settle(() => changePreferences({ theme: 'dark' }));
    expect(screen.getByLabelText('Fill')).toHaveValue('#3a2817');
    await settle(() => changePreferences({ theme: 'light' }));
    expect(screen.getByLabelText('Fill')).toHaveValue('#fde8cc');
  });

  it('shows every element of a built-in component in its dark colors, and records nothing for them', async () => {
    const send = renderIn('dark', [element('appointments-api')]);
    const appearance = screen.getByRole('region', { name: 'Appearance' });
    await settle(() =>
      fireEvent.click(within(appearance).getByRole('radio', { name: 'Every Service' })),
    );
    const fill = within(appearance).getByLabelText('Fill');
    expect(fill).toHaveValue('#172b45');
    await pick(fill, '#172b45');
    expect(send).not.toHaveBeenCalled();
    await pick(within(appearance).getByLabelText('Fill'), '#dcebff');
    expect(sent(send)).toEqual([
      {
        type: 'set-component-appearance',
        component: 'systems.service',
        appearanceTraits: { fill: '#DCEBFF' },
      },
    ]);
  });

  it('shows a relation’s stroke and its relation type’s in the dark theme', async () => {
    const send = renderIn('dark', [relation('api-reads-db')]);
    const appearance = screen.getByRole('region', { name: 'Appearance' });
    expect(within(appearance).getByLabelText('Stroke')).toHaveValue('#aeb8c4');
    await pick(within(appearance).getByLabelText('Stroke'), '#aeb8c4');
    await settle(() =>
      fireEvent.click(within(appearance).getByRole('radio', { name: 'Every reads from' })),
    );
    expect(within(appearance).getByLabelText('Stroke')).toHaveValue('#aeb8c4');
    await pick(within(appearance).getByLabelText('Stroke'), '#aeb8c4');
    expect(send).not.toHaveBeenCalled();
  });

  it('shows a note in the dark theme’s colors, and records nothing for them', async () => {
    const send = renderIn('dark', [freeShape('calendar-note')]);
    const fill = screen.getByLabelText('Fill');
    expect(fill).toHaveValue(THEMES.dark.canvas.noteFill.toLowerCase());
    await pick(fill, THEMES.dark.canvas.noteFill.toLowerCase());
    expect(send).not.toHaveBeenCalled();
  });

  it('shows what a selection shares in the dark theme', async () => {
    const send = renderIn('dark', [element('appointments-api'), element('reminder-service')]);
    const fill = screen.getByLabelText('Fill');
    expect(fill).toHaveValue('#172b45');
    await pick(fill, '#172b45');
    expect(send).not.toHaveBeenCalled();
  });

  it('shows a definition’s colors in the component editor as the dark canvas draws them', async () => {
    const send = renderIn(
      'dark',
      [],
      <ul>
        <ColorRow kind="component" id="systems.service" trait="stroke" label="Stroke" />
        <ColorRow kind="relation-type" id="systems.reads-from" trait="stroke" label="Line" />
      </ul>,
    );
    expect(screen.getByLabelText('Stroke')).toHaveValue('#78a8ee');
    expect(screen.getByLabelText('Line')).toHaveValue('#aeb8c4');
    await pick(screen.getByLabelText('Stroke'), '#78a8ee');
    expect(send).not.toHaveBeenCalled();
  });
});
