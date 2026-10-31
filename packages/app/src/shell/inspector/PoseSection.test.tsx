/**
 * The inspector's Pose section (ADR 0076): where an element is in physical space, edited as one
 * `update-element` for each change, its lengths in mm, cm, m or km and its rotation in degrees.
 */
import {
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Pose } from '@visual-anything/schema';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { EMPTY_SELECTION } from '../../editor/selection';
import { workcell } from '../../test/space';
import { PoseSection } from './PoseSection';

/** The section for one element, in an editor whose commands the core applies, as the local program would. */
function renderSection(start: ProjectSnapshot, element: string, editable = true) {
  const sent: Command[] = [];
  const latest: { project: ProjectSnapshot } = { project: start };
  function Harness() {
    const [project, setProject] = useState(start);
    const now = useRef(start);
    const definitions = useMemo(() => definitionsIn(project), [project]);
    const send: SendCommand = (command) => {
      sent.push(command);
      const outcome = executeCommand(now.current, command);
      if (!outcome.ok) return Promise.resolve({ ok: false });
      now.current = outcome.state;
      latest.project = outcome.state;
      setProject(outcome.state);
      return Promise.resolve({ ok: true });
    };
    const editor: Editor = {
      project,
      definitions,
      viewId: project.views[0]?.id,
      scene: undefined,
      selection: EMPTY_SELECTION,
      select: vi.fn(),
      ...(editable ? { send } : { send: undefined }),
      reveal: vi.fn(),
    };
    const found =
      element === project.model.world.id
        ? project.model.world
        : project.model.elements.find((each) => each.id === element);
    return (
      <EditorContext.Provider value={editor}>
        {found && <PoseSection element={found} />}
      </EditorContext.Provider>
    );
  }
  render(<Harness />);
  const section = within(screen.getByRole('region', { name: 'Pose' }));
  const poseOf = (id: string): Pose | undefined =>
    latest.project.model.elements.find((each) => each.id === id)?.pose;
  return { sent, latest, section, poseOf };
}

/** Types into a field and presses Enter, as committing it does. */
function commit(field: HTMLElement, text: string) {
  fireEvent.change(field, { target: { value: text } });
  fireEvent.keyDown(field, { key: 'Enter' });
}

describe('the Pose section of a posed element', () => {
  it('says what it is posed in, and shows where in lengths that suit them', () => {
    const { section } = renderSection(workcell(), 'camera');
    expect(section.getByText('Posed in “Table”.')).toBeInTheDocument();
    expect(section.getByRole('combobox', { name: 'Posed in' })).toHaveValue('table');
    const place = within(section.getByRole('group', { name: 'Where it is, from “Table”' }));
    expect(place.getByRole('textbox', { name: 'X' })).toHaveValue('0 m');
    expect(place.getByRole('textbox', { name: 'Y' })).toHaveValue('80 cm');
    const turn = within(
      section.getByRole('group', { name: 'Rotation, in degrees about X, then Y, then Z' }),
    );
    expect(turn.getByRole('textbox', { name: 'About Z' })).toHaveValue('0°');
  });

  it('sends one update-element with the whole pose for each coordinate changed', async () => {
    const { sent, section, poseOf } = renderSection(workcell(), 'camera');
    const z = section.getByRole('textbox', { name: 'Z' });
    commit(z, '5 cm');
    await waitFor(() => expect(poseOf('camera')?.at.z).toBe(0.05));
    expect(sent).toEqual([
      {
        type: 'update-element',
        id: 'camera',
        changes: { pose: { in: 'table', at: { x: 0, y: 0.8, z: 0.05 } } },
      },
    ]);
    await waitFor(() => expect(section.getByRole('textbox', { name: 'Z' })).toHaveValue('5 cm'));
    // A number alone is read in the unit the field shows, and the same length sends nothing.
    commit(section.getByRole('textbox', { name: 'Z' }), '0.05 m');
    commit(section.getByRole('textbox', { name: 'Y' }), '30');
    await waitFor(() => expect(poseOf('camera')?.at.y).toBe(0.3));
    expect(sent).toHaveLength(2);
    commit(section.getByRole('textbox', { name: 'X' }), '2 in');
    await waitFor(() => expect(poseOf('camera')?.at.x).toBe(0.0508));
  });

  it('says what cannot be a length, and sends nothing', () => {
    const { sent, section } = renderSection(workcell(), 'camera');
    const x = section.getByRole('textbox', { name: 'X' });
    commit(x, 'far');
    expect(section.getByRole('alert')).toHaveTextContent(
      'Enter a length, such as 12 cm, 1.5 m or 3 in.',
    );
    expect(x).toHaveAttribute('aria-invalid', 'true');
    commit(x, '2000 km');
    expect(section.getByRole('alert')).toHaveTextContent(
      'Enter a length of at most 1,000 km either way.',
    );
    expect(sent).toEqual([]);
  });

  it('turns it in degrees about one axis, the others kept', async () => {
    const { section, poseOf } = renderSection(workcell(), 'camera');
    commit(section.getByRole('textbox', { name: 'About Z' }), '90');
    await waitFor(() => expect(poseOf('camera')?.rotation?.z).toBeCloseTo(Math.SQRT1_2, 9));
    await waitFor(() =>
      expect(section.getByRole('textbox', { name: 'About Z' })).toHaveValue('90°'),
    );
    commit(section.getByRole('textbox', { name: 'About Z' }), '0');
    await waitFor(() => expect(poseOf('camera')?.rotation).toBeUndefined());
  });

  it('keeps its place when it is posed in another of its containers or in World', async () => {
    const { section, poseOf } = renderSection(workcell(), 'camera');
    const select = section.getByRole('combobox', { name: 'Posed in' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['World', 'Table']);
    fireEvent.change(select, { target: { value: 'world' } });
    await waitFor(() => expect(poseOf('camera')).toEqual({ at: { x: 0, y: 0.8, z: 0 } }));
    expect(screen.getByRole('status')).toHaveTextContent(
      '“Camera” is posed in “World” now, where it was.',
    );
  });

  it('says when what it is posed in is in no place under World', () => {
    const project = workcell();
    const unposed = {
      ...project,
      model: {
        ...project.model,
        elements: project.model.elements.map((each) => {
          if (each.id !== 'table') return each;
          const rest = { ...each };
          delete rest.pose;
          return rest;
        }),
      },
    };
    const { section } = renderSection(unposed, 'camera');
    expect(
      section.getByText(
        '“Table” is in no place under World, so “Camera” shows in physical space when the panel shows “Table”.',
      ),
    ).toBeInTheDocument();
  });

  it('takes it out of physical space', async () => {
    const { sent, section, poseOf } = renderSection(workcell(), 'table');
    fireEvent.click(section.getByRole('button', { name: 'Take out of physical space' }));
    await waitFor(() => expect(poseOf('table')).toBeUndefined());
    expect(sent).toEqual([{ type: 'update-element', id: 'table', changes: { pose: null } }]);
    expect(screen.getByRole('status')).toHaveTextContent('Took “Table” out of physical space.');
    expect(section.getByText('Not in physical space: it has no pose.')).toBeInTheDocument();
  });

  it('is read-only while the project cannot be changed', () => {
    const { section } = renderSection(workcell(), 'camera', false);
    for (const field of section.getAllByRole('textbox')) expect(field).toBeDisabled();
    expect(section.getByRole('combobox', { name: 'Posed in' })).toBeDisabled();
    expect(section.getByRole('button', { name: 'Take out of physical space' })).toBeDisabled();
  });
});

describe('the Pose section of an element that is not posed', () => {
  it('places one in no container at World’s origin', async () => {
    const { sent, section, poseOf } = renderSection(workcell(), 'lamp');
    expect(section.getByText('Not in physical space: it has no pose.')).toBeInTheDocument();
    fireEvent.click(section.getByRole('button', { name: 'Place in physical space' }));
    await waitFor(() => expect(poseOf('lamp')).toEqual({ at: { x: 0, y: 0, z: 0 } }));
    expect(sent).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Placed “Lamp” at the origin of “World”.');
    expect(section.getByRole('textbox', { name: 'X' })).toHaveValue('0 m');
  });

  it('offers to pose one in World where it was once its container no longer holds it', async () => {
    const project = workcell();
    const gone = { ...project, model: { ...project.model, relations: [] } };
    const { section, poseOf } = renderSection(gone, 'camera');
    expect(
      section.getByText(
        'Its pose is measured from “Table”, which no longer holds it, so it is not in physical space.',
      ),
    ).toBeInTheDocument();
    expect(section.queryByRole('textbox')).toBeNull();
    fireEvent.click(section.getByRole('button', { name: 'Pose in World where it was' }));
    await waitFor(() => expect(poseOf('camera')).toEqual({ at: { x: 0, y: 0.8, z: 0 } }));
    expect(screen.getByRole('status')).toHaveTextContent('Posed “Camera” in World, where it was.');
  });

  it('shows where an anchored part is, and edits nothing', () => {
    const { section } = renderSection(workcell(), 'elbow');
    expect(
      section.getByText('Anchored to the part “elbow” of the solid “Arm”, which “Arm” shows.'),
    ).toBeInTheDocument();
    expect(
      section.getByText('Where its part is, from “Arm”: x 0 m, y 1 m, z 0 m.'),
    ).toBeInTheDocument();
    expect(section.queryByRole('textbox')).toBeNull();
    expect(section.queryByRole('button')).toBeNull();
  });

  it('says World has no pose', () => {
    const { section } = renderSection(workcell(), 'world');
    expect(
      section.getByText('Physical space is measured from World, which has no pose of its own.'),
    ).toBeInTheDocument();
    expect(section.queryByRole('button')).toBeNull();
  });
});
