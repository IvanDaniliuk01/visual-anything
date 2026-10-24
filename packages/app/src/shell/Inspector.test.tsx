import {
  definitionsOf,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { AttributeDefinition, Element, Relation } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo, useRef, useState } from 'react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { SendCommand } from '../canvas/CanvasArea';
import { buildScene } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { selectionOf, type Selectable, type Selection } from '../editor/selection';
import { loadSample } from '../test/sample';
import { Inspector } from './Inspector';
import { COLOR_FORMS } from '../color';

const sample = loadSample();

/** Attributes of every type that the test calendar adds to the sample's. */
const CALENDAR_ATTRIBUTES: AttributeDefinition[] = [
  {
    name: 'replicated',
    type: 'boolean',
    default: false,
    description: 'Whether a replica follows it.',
  },
  {
    name: 'retention',
    type: 'json',
    default: { days: 30 },
    description: 'How long it keeps past slots.',
  },
  { name: 'poolSize', type: 'number', default: 100 },
];

/**
 * The sample, with a calendar component that defines attributes of every type, and an Appointments DB
 * with values of its own: one that differs from its default, one equal to it, one for an attribute
 * without a default, and one its component does not define.
 */
const PROJECT: ProjectSnapshot = {
  ...sample,
  packages: sample.packages.map((file) =>
    file.id !== 'clinic'
      ? file
      : {
          ...file,
          components: file.components.map((component) =>
            component.id !== 'clinic.calendar'
              ? component
              : {
                  ...component,
                  attributes: [...(component.attributes ?? []), ...CALENDAR_ATTRIBUTES],
                },
          ),
        },
  ),
  model: {
    ...sample.model,
    elements: sample.model.elements.map((each) =>
      each.id !== 'appointments-db'
        ? each
        : {
            ...each,
            attributes: {
              engine: 'postgres',
              retention: { days: 30 },
              sizeGb: 12,
              timezone: 'UTC',
            },
          },
    ),
  },
};

/** The test project with one element changed. */
function withElement(id: string, change: (element: Element) => Element): ProjectSnapshot {
  return {
    ...PROJECT,
    model: {
      ...PROJECT.model,
      elements: PROJECT.model.elements.map((each) => (each.id === id ? change(each) : each)),
    },
  };
}

/** The test project with more relations. */
function withRelations(relations: Relation[]): ProjectSnapshot {
  return {
    ...PROJECT,
    model: { ...PROJECT.model, relations: [...PROJECT.model.relations, ...relations] },
  };
}

const element = (id: string): Selectable => ({ kind: 'element', id });
const relation = (id: string): Selectable => ({ kind: 'relation', id });
const freeShape = (id: string): Selectable => ({ kind: 'free-shape', id });

interface Setup {
  project?: ProjectSnapshot;
  selected?: Selectable[];
  /** Whether the project can be changed; when not, the editor has no `send`. */
  editable?: boolean;
}

interface HarnessProps extends Required<Setup> {
  send: SendCommand;
  select: (selection: Selection) => void;
}

/**
 * The inspector in an editor, as the shell gives it one. What the `send` mock accepts is applied to the
 * project with the core, as the local program would, so the inspector shows the result; and what is
 * selected through the editor becomes the selection.
 */
function Harness({ project: initial, selected, editable, send, select }: HarnessProps) {
  const [project, setProject] = useState(initial);
  const [selection, setSelection] = useState(() => selectionOf(selected));
  const latest = useRef(initial);
  const definitions = useMemo(() => definitionsOf(project.packages), [project.packages]);
  const view = project.views[0];
  const scene = useMemo(() => (view ? buildScene(project, view.id) : undefined), [project, view]);
  const apply: SendCommand = async (command) => {
    const answer = await send(command);
    if (!answer.ok) return answer;
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
    select: (next) => {
      select(next);
      setSelection(next);
    },
    send: editable ? apply : undefined,
    reveal: () => {},
  };
  return (
    <EditorContext.Provider value={editor}>
      <Inspector view={view} scene={scene} definitions={definitions} />
    </EditorContext.Provider>
  );
}

function renderInspector({ project = PROJECT, selected = [], editable = true }: Setup = {}) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  const select = vi.fn<(selection: Selection) => void>();
  render(
    <Harness
      project={project}
      selected={selected}
      editable={editable}
      send={send}
      select={select}
    />,
  );
  return { send, select, inspector: screen.getByRole('complementary', { name: 'Inspector' }) };
}

/** The commands sent so far. */
function sent(send: Mock<SendCommand>): Command[] {
  return send.mock.calls.map(([command]) => command);
}

/** Does something, then lets the answers to what it sent arrive. */
async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Types into a control, then presses Enter. */
async function enter(control: HTMLElement, value: string): Promise<void> {
  fireEvent.change(control, { target: { value } });
  await settle(() => fireEvent.keyDown(control, { key: 'Enter' }));
}

/** Types into a control, then leaves it. */
async function leave(control: HTMLElement, value: string): Promise<void> {
  fireEvent.change(control, { target: { value } });
  await settle(() => fireEvent.blur(control));
}

/** The list item that holds a control. */
function rowOf(control: HTMLElement): HTMLElement {
  const row = control.closest('li');
  if (!row) throw new Error('The control is not in a list item.');
  return row;
}

/** The text of the description that goes with a term in a description list. */
function detail(region: HTMLElement, term: string): string {
  const row = within(region).getByText(term).closest('div');
  return row?.querySelector('dd')?.textContent ?? '';
}

describe('Inspector', () => {
  describe('with nothing selected', () => {
    it('details the open view', () => {
      const { inspector } = renderInspector();
      expect(within(inspector).getByText('Nothing is selected.')).toBeInTheDocument();
      expect(within(inspector).getByRole('heading', { name: 'View' })).toBeInTheDocument();
      expect(detail(inspector, 'Name')).toBe('System overview');
      expect(detail(inspector, 'Perspective')).toContain('Data flow');
      expect(detail(inspector, 'Element shapes')).toBe('8');
    });
  });

  describe('with one element selected', () => {
    it('shows its name and description, each labelled', () => {
      renderInspector({ selected: [element('booking-agent')] });
      expect(screen.getByRole('heading', { name: 'Booking agent, AI agent' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Booking agent');
      expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(
        'Understands the request, offers free slots and books the one the patient picks.',
      );
      expect(screen.queryByText('Nothing is selected.')).not.toBeInTheDocument();
    });

    it('renames it on Enter, as one command, and shows the new name', async () => {
      const { send } = renderInspector({ selected: [element('booking-agent')] });
      const name = screen.getByRole('textbox', { name: 'Name' });
      await enter(name, 'Booking bot');
      await settle(() => fireEvent.blur(name));
      expect(sent(send)).toEqual([
        { type: 'update-element', id: 'booking-agent', changes: { name: 'Booking bot' } },
      ]);
      expect(name).toHaveValue('Booking bot');
      expect(screen.getByRole('heading', { name: 'Booking bot, AI agent' })).toBeInTheDocument();
    });

    it('renames it when the focus leaves the name', async () => {
      const { send } = renderInspector({ selected: [element('booking-agent')] });
      await leave(screen.getByRole('textbox', { name: 'Name' }), 'Booking bot');
      expect(sent(send)).toEqual([
        { type: 'update-element', id: 'booking-agent', changes: { name: 'Booking bot' } },
      ]);
    });

    it('cancels an edit on Escape', async () => {
      const { send } = renderInspector({ selected: [element('booking-agent')] });
      const name = screen.getByRole('textbox', { name: 'Name' });
      fireEvent.change(name, { target: { value: 'Booking bot' } });
      fireEvent.keyDown(name, { key: 'Escape' });
      expect(name).toHaveValue('Booking agent');
      await settle(() => fireEvent.blur(name));
      expect(send).not.toHaveBeenCalled();
    });

    it('sends nothing for text left as it was, or a name left empty', async () => {
      const { send } = renderInspector({ selected: [element('booking-agent')] });
      const name = screen.getByRole('textbox', { name: 'Name' });
      await leave(name, 'Booking agent');
      await leave(name, '   ');
      expect(send).not.toHaveBeenCalled();
      expect(name).toHaveValue('Booking agent');
    });

    it('goes back to the project’s value when the command is refused', async () => {
      const { send } = renderInspector({ selected: [element('booking-agent')] });
      send.mockResolvedValueOnce({ ok: false });
      const name = screen.getByRole('textbox', { name: 'Name' });
      await enter(name, 'Booking bot');
      expect(send).toHaveBeenCalledTimes(1);
      expect(name).toHaveValue('Booking agent');
    });

    it('shows what was typed until the answer comes, and sends it once', async () => {
      const { send } = renderInspector({ selected: [element('booking-agent')] });
      let answer: (result: { ok: boolean }) => void = () => {};
      send.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      );
      const name = screen.getByRole('textbox', { name: 'Name' });
      await enter(name, 'Booking bot');
      await settle(() => fireEvent.blur(name));
      expect(name).toHaveValue('Booking bot');
      expect(send).toHaveBeenCalledTimes(1);
      await settle(() => answer({ ok: false }));
      expect(name).toHaveValue('Booking agent');
    });

    it('changes its description on Enter, keeps Shift+Enter for a new line, and removes an emptied one', async () => {
      const { send } = renderInspector({ selected: [element('booking-agent')] });
      const description = screen.getByRole('textbox', { name: 'Description' });
      fireEvent.change(description, { target: { value: 'Books slots.\n' } });
      fireEvent.keyDown(description, { key: 'Enter', shiftKey: true });
      expect(send).not.toHaveBeenCalled();
      await enter(description, 'Books slots.\nOver WhatsApp.');
      await leave(description, '');
      expect(sent(send)).toEqual([
        {
          type: 'update-element',
          id: 'booking-agent',
          changes: { description: 'Books slots.\nOver WhatsApp.' },
        },
        { type: 'update-element', id: 'booking-agent', changes: { description: null } },
      ]);
      expect(description).toHaveValue('');
    });

    it('shows its component and what that derives from, and changes it', async () => {
      const { send } = renderInspector({ selected: [element('appointments-db')] });
      const component = screen.getByRole('combobox', { name: 'Component' });
      expect(component).toHaveValue('clinic.calendar');
      const systems = within(component).getByRole('group', { name: 'Systems' });
      expect(within(systems).getByRole('option', { name: 'Service' })).toBeInTheDocument();
      expect(
        within(within(component).getByRole('group', { name: 'Clinic' })).getAllByRole('option'),
      ).toHaveLength(1);
      const lineage = screen.getByRole('list', { name: 'Derives from' });
      expect(
        within(lineage)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Database', 'Box', 'Essence']);

      await settle(() => fireEvent.change(component, { target: { value: 'systems.database' } }));
      expect(sent(send)).toEqual([
        {
          type: 'update-element',
          id: 'appointments-db',
          changes: { component: 'systems.database' },
        },
      ]);
      expect(component).toHaveValue('systems.database');
      expect(
        within(screen.getByRole('list', { name: 'Derives from' }))
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Box', 'Essence']);
    });

    it('offers the component of an element that no package in use defines, and says so', () => {
      const project = withElement('patient', (each) => ({ ...each, component: 'gone.visitor' }));
      renderInspector({ project, selected: [element('patient')] });
      expect(screen.getByRole('combobox', { name: 'Component' })).toHaveValue('gone.visitor');
      expect(screen.getByRole('heading', { name: 'Patient, gone.visitor' })).toBeInTheDocument();
      expect(
        screen.getByText(
          'No package in use defines the component “gone.visitor”, so it looks like Essence.',
        ),
      ).toBeInTheDocument();
    });

    it('lists its containers and the relations on it, and selects one when it is clicked', async () => {
      const { select } = renderInspector({ selected: [element('appointments-api')] });
      const containers = screen.getByRole('list', { name: 'Containers' });
      expect(
        within(containers)
          .getAllByRole('button')
          .map((each) => each.textContent),
      ).toEqual(['Scheduling, System']);
      const relations = screen.getByRole('list', { name: 'Relations' });
      expect(
        within(relations)
          .getAllByRole('button')
          .map((each) => each.textContent),
      ).toEqual([
        'Appointments API is part of Scheduling',
        'HTTPS, Booking agent communicates with Appointments API',
        'Appointments API reads from Appointments DB',
        'Appointments API writes to Appointments DB',
        'Appointments API communicates with Reminder service',
      ]);

      await settle(() =>
        fireEvent.click(within(containers).getByRole('button', { name: 'Scheduling, System' })),
      );
      expect(select).toHaveBeenLastCalledWith(selectionOf([element('scheduling')]));
      expect(screen.getByRole('heading', { name: 'Scheduling, System' })).toHaveFocus();

      await settle(() =>
        fireEvent.click(
          within(screen.getByRole('list', { name: 'Relations' })).getByRole('button', {
            name: 'Scheduling is part of Clinic booking',
          }),
        ),
      );
      expect(select).toHaveBeenLastCalledWith(selectionOf([relation('scheduling-in-clinic')]));
      expect(
        screen.getByRole('heading', { name: 'Scheduling → Clinic booking, is part of' }),
      ).toHaveFocus();
    });

    it('says when it sits directly in World', () => {
      renderInspector({ selected: [element('patient')] });
      expect(screen.getByText('It sits directly in World.')).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Containers' })).not.toBeInTheDocument();
    });
  });

  describe('attributes', () => {
    it('lists every attribute its component’s chain defines, with type, description and default, then its own', () => {
      renderInspector({ selected: [element('appointments-db')] });
      const list = screen.getByRole('list', { name: 'Attributes' });
      const labels = within(list)
        .getAllByRole('listitem')
        .map((row) => row.querySelector('label')?.textContent);
      expect(labels).toEqual([
        'owner',
        'engine',
        'timezone',
        'replicated',
        'retention',
        'poolSize',
        'sizeGb',
      ]);

      const owner = screen.getByRole('textbox', { name: 'owner' });
      expect(owner).toHaveValue('');
      expect(owner).toHaveAccessibleDescription('string The team that runs it. No default.');
      const timezone = screen.getByRole('textbox', { name: 'timezone' });
      expect(timezone).toHaveValue('UTC');
      expect(timezone).toHaveAccessibleDescription(
        /^string The time zone of the slots\. Default: "America\/Argentina\/Buenos_Aires"\./,
      );
      expect(screen.getByRole('spinbutton', { name: 'poolSize' })).toHaveValue(100);
      expect(screen.getByRole('spinbutton', { name: 'poolSize' })).toHaveAccessibleDescription(
        'number Default: 100.',
      );
      expect(screen.getByRole('checkbox', { name: 'replicated' })).not.toBeChecked();
      expect(screen.getByRole('textbox', { name: 'retention' })).toHaveValue('{\n  "days": 30\n}');
      const sizeGb = screen.getByRole('spinbutton', { name: 'sizeGb' });
      expect(sizeGb).toHaveValue(12);
      expect(sizeGb).toHaveAccessibleDescription(/^number Not defined by its component\./);
    });

    it('edits a text value', async () => {
      const { send } = renderInspector({ selected: [element('appointments-db')] });
      await enter(screen.getByRole('textbox', { name: 'engine' }), 'mysql');
      expect(sent(send)).toEqual([
        {
          type: 'update-element',
          id: 'appointments-db',
          changes: { attributes: { engine: 'mysql' } },
        },
      ]);
      expect(screen.getByRole('textbox', { name: 'engine' })).toHaveValue('mysql');
    });

    it('edits a number, and asks for one when what is typed is not', async () => {
      const { send } = renderInspector({ selected: [element('appointments-db')] });
      const poolSize = screen.getByRole('spinbutton', { name: 'poolSize' });
      await leave(poolSize, '');
      expect(send).not.toHaveBeenCalled();
      expect(poolSize).toHaveAttribute('aria-invalid', 'true');
      expect(poolSize).toHaveAccessibleDescription(/Enter a number\.$/);

      await enter(poolSize, '250');
      expect(sent(send)).toEqual([
        {
          type: 'update-element',
          id: 'appointments-db',
          changes: { attributes: { poolSize: 250 } },
        },
      ]);
      expect(poolSize).not.toHaveAttribute('aria-invalid');
    });

    it('edits a boolean when it is checked', async () => {
      const { send } = renderInspector({ selected: [element('appointments-db')] });
      const replicated = screen.getByRole('checkbox', { name: 'replicated' });
      await settle(() => fireEvent.click(replicated));
      expect(sent(send)).toEqual([
        {
          type: 'update-element',
          id: 'appointments-db',
          changes: { attributes: { replicated: true } },
        },
      ]);
      expect(replicated).toBeChecked();
    });

    it('edits a JSON value, refusing what is not valid JSON', async () => {
      const { send } = renderInspector({ selected: [element('appointments-db')] });
      const retention = screen.getByRole('textbox', { name: 'retention' });
      await leave(retention, '{ "days" : 30 }');
      await leave(retention, '{days: 7}');
      expect(send).not.toHaveBeenCalled();
      expect(retention).toHaveValue('{days: 7}');
      expect(retention).toHaveAttribute('aria-invalid', 'true');
      expect(within(rowOf(retention)).getByText(/^Not valid JSON/)).toBeInTheDocument();

      fireEvent.keyDown(retention, { key: 'Escape' });
      expect(retention).toHaveValue('{\n  "days": 30\n}');
      expect(retention).not.toHaveAttribute('aria-invalid');

      await enter(retention, '{"days": 7, "archive": true}');
      expect(sent(send)).toEqual([
        {
          type: 'update-element',
          id: 'appointments-db',
          changes: { attributes: { retention: { days: 7, archive: true } } },
        },
      ]);
    });

    it('edits a value that does not fit its type as JSON, and says so', async () => {
      const project = withElement('appointments-db', (each) => ({
        ...each,
        attributes: { ...each.attributes, poolSize: 'lots' },
      }));
      const { send } = renderInspector({ project, selected: [element('appointments-db')] });
      const poolSize = screen.getByRole('textbox', { name: 'poolSize' });
      expect(poolSize).toHaveValue('"lots"');
      expect(poolSize).toHaveAccessibleDescription(/Default: 100\. Its value is not a number\./);
      await enter(poolSize, '40');
      expect(sent(send)).toEqual([
        {
          type: 'update-element',
          id: 'appointments-db',
          changes: { attributes: { poolSize: 40 } },
        },
      ]);
      expect(screen.getByRole('spinbutton', { name: 'poolSize' })).toHaveValue(40);
    });

    it('marks particularities, and takes each back with one command', async () => {
      const { send } = renderInspector({ selected: [element('appointments-db')] });
      const marked = (name: string) => {
        const control = screen.getByRole(name === 'sizeGb' ? 'spinbutton' : 'textbox', { name });
        return within(rowOf(control)).queryByText('Particularity') !== null;
      };
      // A value that differs from the component’s, and an attribute the component does not define.
      expect(marked('timezone')).toBe(true);
      expect(marked('sizeGb')).toBe(true);
      // A value equal to the component’s, one for an attribute without a default, and no value.
      expect(marked('retention')).toBe(false);
      expect(marked('engine')).toBe(false);
      expect(marked('owner')).toBe(false);
      expect(
        screen.queryByRole('button', { name: /^Use the component’s value for retention/ }),
      ).not.toBeInTheDocument();

      await settle(() =>
        fireEvent.click(
          screen.getByRole('button', { name: 'Use the component’s value for timezone' }),
        ),
      );
      expect(screen.getByRole('textbox', { name: 'timezone' })).toHaveValue(
        'America/Argentina/Buenos_Aires',
      );
      expect(marked('timezone')).toBe(false);
      expect(screen.getByRole('textbox', { name: 'timezone' })).toHaveFocus();

      await settle(() => fireEvent.click(screen.getByRole('button', { name: 'Clear engine' })));
      expect(screen.getByRole('textbox', { name: 'engine' })).toHaveValue('');

      await settle(() => fireEvent.click(screen.getByRole('button', { name: 'Remove sizeGb' })));
      expect(screen.queryByRole('spinbutton', { name: 'sizeGb' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Attributes' })).toHaveFocus();

      expect(sent(send)).toEqual(
        ['timezone', 'engine', 'sizeGb'].map((name) => ({
          type: 'update-element',
          id: 'appointments-db',
          changes: { removeAttributes: [name] },
        })),
      );
    });

    it('adds an attribute of its own, and moves the focus to its value', async () => {
      const { send } = renderInspector({ selected: [element('appointments-db')] });
      const name = screen.getByRole('textbox', { name: 'Attribute name' });
      fireEvent.change(name, { target: { value: ' replicas ' } });
      fireEvent.change(screen.getByRole('combobox', { name: 'Attribute type' }), {
        target: { value: 'number' },
      });
      await settle(() => fireEvent.click(screen.getByRole('button', { name: 'Add attribute' })));
      expect(sent(send)).toEqual([
        {
          type: 'update-element',
          id: 'appointments-db',
          changes: { attributes: { replicas: 0 } },
        },
      ]);
      const replicas = screen.getByRole('spinbutton', { name: 'replicas' });
      expect(replicas).toHaveValue(0);
      expect(replicas).toHaveFocus();
      expect(within(rowOf(replicas)).getByText('Particularity')).toBeInTheDocument();
      expect(name).toHaveValue('');
    });

    it('refuses to add an attribute it already has, or one without a name', async () => {
      const { send } = renderInspector({ selected: [element('appointments-db')] });
      const name = screen.getByRole('textbox', { name: 'Attribute name' });
      await settle(() => fireEvent.click(screen.getByRole('button', { name: 'Add attribute' })));
      expect(name).toHaveAccessibleDescription('Give the attribute a name.');
      fireEvent.change(name, { target: { value: 'timezone' } });
      await settle(() => fireEvent.submit(name));
      expect(name).toHaveAttribute('aria-invalid', 'true');
      expect(name).toHaveAccessibleDescription('It already has an attribute named “timezone”.');
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('appearance', () => {
    it('shows shape, fill and stroke, marking those that are the element’s own', () => {
      renderInspector({ selected: [element('booking-agent')] });
      const shape = screen.getByRole('combobox', { name: 'Shape' });
      const fill = screen.getByLabelText('Fill');
      const stroke = screen.getByLabelText('Stroke');
      expect(shape).toHaveValue('rounded-rectangle');
      expect(fill).toHaveValue('#f8e1ec');
      expect(stroke).toHaveValue('#5b3a9e');
      expect(fill).toHaveAccessibleDescription(/Particularity/);
      expect(shape).not.toHaveAccessibleDescription(/Particularity/);
      expect(stroke).not.toHaveAccessibleDescription(/Particularity/);
    });

    it('marks nothing and offers no reset for an element that looks like its component', () => {
      renderInspector({ selected: [element('patient')] });
      expect(screen.getByRole('combobox', { name: 'Shape' })).toHaveValue('person');
      expect(screen.queryByText('Particularity')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Use the component’s appearance' }),
      ).not.toBeInTheDocument();
    });

    it('changes the shape, keeping the rest of its own appearance', async () => {
      const { send } = renderInspector({ selected: [element('booking-agent')] });
      await settle(() =>
        fireEvent.change(screen.getByRole('combobox', { name: 'Shape' }), {
          target: { value: 'ellipse' },
        }),
      );
      expect(sent(send)).toEqual([
        {
          type: 'update-element',
          id: 'booking-agent',
          changes: { appearance: { fill: '#F8E1EC', shape: 'ellipse' } },
        },
      ]);
      expect(screen.getByRole('combobox', { name: 'Shape' })).toHaveAccessibleDescription(
        /Particularity/,
      );
    });

    it('sends a colour when it is chosen, not on every input', async () => {
      const { send } = renderInspector({ selected: [element('booking-agent')] });
      const stroke = screen.getByLabelText('Stroke');
      fireEvent.input(stroke, { target: { value: '#112233' } });
      fireEvent.input(stroke, { target: { value: '#223344' } });
      expect(send).not.toHaveBeenCalled();
      expect(stroke).toHaveValue('#223344');
      await settle(() => fireEvent.change(stroke, { target: { value: '#334455' } }));
      expect(sent(send)).toEqual([
        {
          type: 'update-element',
          id: 'booking-agent',
          changes: { appearance: { fill: '#F8E1EC', stroke: '#334455' } },
        },
      ]);
      expect(stroke).toHaveValue('#334455');
    });

    it('takes a colour written as a code, such as #f3f5f8', async () => {
      const { send } = renderInspector({ selected: [element('booking-agent')] });
      const code = screen.getByRole('textbox', { name: 'Fill colour code' });
      expect(code).toHaveValue('#f8e1ec');
      fireEvent.change(code, { target: { value: '#F3F5F8' } });
      await settle(() => fireEvent.keyDown(code, { key: 'Enter' }));
      expect(sent(send)).toEqual([
        {
          type: 'update-element',
          id: 'booking-agent',
          changes: { appearance: { fill: '#f3f5f8' } },
        },
      ]);
      expect(screen.getByLabelText('Fill')).toHaveValue('#f3f5f8');
      expect(code).toHaveValue('#f3f5f8');
    });

    it('reads rgb() and the short form, and says how to write a colour it cannot read', async () => {
      const { send } = renderInspector({ selected: [element('booking-agent')] });
      const code = screen.getByRole('textbox', { name: 'Stroke colour code' });
      fireEvent.change(code, { target: { value: '#12345' } });
      await settle(() => fireEvent.blur(code));
      expect(code).toHaveAttribute('aria-invalid', 'true');
      expect(code).toHaveAccessibleDescription(COLOR_FORMS);
      expect(send).not.toHaveBeenCalled();
      fireEvent.change(code, { target: { value: 'rgb(17, 34, 51)' } });
      await settle(() => fireEvent.keyDown(code, { key: 'Enter' }));
      expect(sent(send)).toEqual([
        {
          type: 'update-element',
          id: 'booking-agent',
          changes: { appearance: { fill: '#F8E1EC', stroke: '#112233' } },
        },
      ]);
      expect(code).not.toHaveAttribute('aria-invalid');
    });

    it('cancels a colour code with Escape, and sends nothing for the same colour', async () => {
      const { send } = renderInspector({ selected: [element('booking-agent')] });
      const code = screen.getByRole('textbox', { name: 'Fill colour code' });
      fireEvent.change(code, { target: { value: '#000' } });
      fireEvent.keyDown(code, { key: 'Escape' });
      expect(code).toHaveValue('#f8e1ec');
      fireEvent.change(code, { target: { value: 'F8E1EC' } });
      await settle(() => fireEvent.keyDown(code, { key: 'Enter' }));
      expect(send).not.toHaveBeenCalled();
    });

    it('makes it look like its component again', async () => {
      const { send } = renderInspector({ selected: [element('booking-agent')] });
      await settle(() =>
        fireEvent.click(screen.getByRole('button', { name: 'Use the component’s appearance' })),
      );
      expect(sent(send)).toEqual([
        { type: 'update-element', id: 'booking-agent', changes: { appearance: null } },
      ]);
      expect(screen.getByLabelText('Fill')).toHaveValue('#ede4ff');
      expect(screen.queryByText('Particularity')).not.toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Shape' })).toHaveFocus();
    });
  });

  describe('with one relation selected', () => {
    it('shows its relation type, its ends, and its name and description', () => {
      renderInspector({ selected: [relation('agent-to-api')] });
      expect(screen.getByRole('heading', { name: 'HTTPS, communicates with' })).toBeInTheDocument();
      const relationType = screen.getByRole('combobox', { name: 'Relation type' });
      expect(relationType).toHaveValue('systems.communicates-with');
      // Booking agent → Appointments API is outside what "reads from" may connect.
      expect(
        within(relationType).getByRole('option', { name: 'reads from · outside its limits' }),
      ).toBeInTheDocument();
      expect(
        within(relationType).getByRole('option', { name: 'reminds · outside its limits' }),
      ).toBeInTheDocument();
      const ends = screen.getByRole('region', { name: 'Ends' });
      expect(detail(ends, 'From')).toBe('Booking agent, AI agent');
      expect(detail(ends, 'To')).toBe('Appointments API, Service');
      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('HTTPS');
      expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue('');
      expect(screen.queryByRole('list', { name: 'Warnings' })).not.toBeInTheDocument();
    });

    it('changes its relation type', async () => {
      const { send } = renderInspector({ selected: [relation('agent-to-api')] });
      const relationType = screen.getByRole('combobox', { name: 'Relation type' });
      await settle(() => fireEvent.change(relationType, { target: { value: 'clinic.reminds' } }));
      expect(sent(send)).toEqual([
        {
          type: 'update-relation',
          id: 'agent-to-api',
          changes: { relationType: 'clinic.reminds' },
        },
      ]);
      expect(relationType).toHaveValue('clinic.reminds');
    });

    it('selects an end when it is clicked', async () => {
      const { select } = renderInspector({ selected: [relation('agent-to-api')] });
      await settle(() =>
        fireEvent.click(screen.getByRole('button', { name: 'Appointments API, Service' })),
      );
      expect(select).toHaveBeenLastCalledWith(selectionOf([element('appointments-api')]));
      expect(screen.getByRole('heading', { name: 'Appointments API, Service' })).toHaveFocus();
    });

    it('selects an end that is itself a relation, and offers no relation type that nests', async () => {
      const project = withRelations([
        {
          id: 'contract',
          relationType: 'systems.communicates-with',
          from: 'reminder-service',
          to: 'agent-to-api',
          name: 'Contract',
        },
      ]);
      const { select } = renderInspector({ project, selected: [relation('contract')] });
      const nesting = within(screen.getByRole('combobox', { name: 'Relation type' })).getByRole(
        'option',
        { name: 'is part of · needs two elements' },
      );
      expect(nesting).toBeDisabled();
      const ends = screen.getByRole('region', { name: 'Ends' });
      expect(detail(ends, 'To')).toBe('HTTPS, communicates with');
      await settle(() =>
        fireEvent.click(within(ends).getByRole('button', { name: 'HTTPS, communicates with' })),
      );
      expect(select).toHaveBeenLastCalledWith(selectionOf([relation('agent-to-api')]));
      expect(screen.getByRole('heading', { name: 'HTTPS, communicates with' })).toHaveFocus();
    });

    it('edits its name and description, removing each when emptied', async () => {
      const { send } = renderInspector({ selected: [relation('agent-to-api')] });
      const name = screen.getByRole('textbox', { name: 'Name' });
      const description = screen.getByRole('textbox', { name: 'Description' });
      await enter(description, 'Books and cancels appointments.');
      await leave(name, '');
      await enter(name, 'REST');
      expect(sent(send)).toEqual([
        {
          type: 'update-relation',
          id: 'agent-to-api',
          changes: { description: 'Books and cancels appointments.' },
        },
        { type: 'update-relation', id: 'agent-to-api', changes: { name: null } },
        { type: 'update-relation', id: 'agent-to-api', changes: { name: 'REST' } },
      ]);
      await leave(description, '  ');
      expect(sent(send).at(-1)).toEqual({
        type: 'update-relation',
        id: 'agent-to-api',
        changes: { description: null },
      });
    });

    it('edits the attributes its relation type defines', async () => {
      const { send } = renderInspector({ selected: [relation('agent-to-api')] });
      const protocol = screen.getByRole('textbox', { name: 'protocol' });
      expect(protocol).toHaveAccessibleDescription(
        'string Such as "HTTPS", "gRPC" or "AMQP". No default.',
      );
      await enter(protocol, 'HTTPS');
      expect(sent(send)).toEqual([
        {
          type: 'update-relation',
          id: 'agent-to-api',
          changes: { attributes: { protocol: 'HTTPS' } },
        },
      ]);
      await settle(() => fireEvent.click(screen.getByRole('button', { name: 'Clear protocol' })));
      expect(sent(send).at(-1)).toEqual({
        type: 'update-relation',
        id: 'agent-to-api',
        changes: { removeAttributes: ['protocol'] },
      });
      expect(screen.queryByText('Particularity')).not.toBeInTheDocument();
    });

    it('warns of the relation type limits it breaks, without stopping any edit', async () => {
      const project: ProjectSnapshot = {
        ...PROJECT,
        model: {
          ...PROJECT.model,
          relations: PROJECT.model.relations.map((each) =>
            each.id === 'api-reads-db' ? { ...each, to: 'reminder-service' } : each,
          ),
        },
      };
      const { send } = renderInspector({ project, selected: [relation('api-reads-db')] });
      const warnings = screen.getByRole('list', { name: 'Warnings' });
      expect(within(warnings).getByRole('listitem')).toHaveTextContent(
        '"reads from" expects its to end to be "Database" or "Object storage", but "Reminder service" is not.',
      );
      await enter(screen.getByRole('textbox', { name: 'Name' }), 'Reads reminders');
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('free shapes and several things', () => {
    it('shows a note’s text, read-only', () => {
      renderInspector({ selected: [freeShape('calendar-note')] });
      expect(screen.getByRole('heading', { name: 'Note' })).toBeInTheDocument();
      expect(
        screen.getByText(
          'Scheduling owns the calendar: only the Appointments API reads and writes the Appointments DB.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('Edit its text on the canvas.')).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('says what an arrow is', () => {
      const [view] = PROJECT.views;
      if (!view) throw new Error('The sample has no view.');
      const project: ProjectSnapshot = {
        ...PROJECT,
        views: [
          {
            ...view,
            freeShapes: [
              ...view.freeShapes,
              { kind: 'arrow', id: 'emphasis', from: { x: 0, y: 0 }, to: { x: 120, y: 0 } },
            ],
          },
        ],
      };
      renderInspector({ project, selected: [freeShape('emphasis')] });
      expect(screen.getByRole('heading', { name: 'Arrow' })).toBeInTheDocument();
      expect(
        screen.getByText('A free shape: drawing only, not part of the model.'),
      ).toBeInTheDocument();
    });

    it('counts what is selected when several things are', () => {
      const { inspector } = renderInspector({
        selected: [
          element('patient'),
          element('whatsapp'),
          relation('patient-to-whatsapp'),
          freeShape('calendar-note'),
        ],
      });
      expect(
        within(inspector).getByText('2 elements, 1 relation and 1 free shape are selected.'),
      ).toBeInTheDocument();
      expect(within(inspector).queryByRole('textbox')).not.toBeInTheDocument();
    });
  });

  describe('while the project cannot be changed', () => {
    it('disables every control that changes it, and still selects', async () => {
      const { inspector, select } = renderInspector({
        selected: [element('appointments-db')],
        editable: false,
      });
      const controls = inspector.querySelectorAll('input, textarea, select');
      expect(controls.length).toBeGreaterThan(10);
      for (const control of controls) expect(control).toBeDisabled();
      for (const name of [
        'Use the component’s value for timezone',
        'Clear engine',
        'Remove sizeGb',
        'Add attribute',
      ]) {
        expect(screen.getByRole('button', { name })).toBeDisabled();
      }
      await settle(() =>
        fireEvent.click(screen.getByRole('button', { name: 'Scheduling, System' })),
      );
      expect(select).toHaveBeenLastCalledWith(selectionOf([element('scheduling')]));
      expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    });

    it('disables the relation’s controls too', () => {
      const { inspector } = renderInspector({
        selected: [relation('agent-to-api')],
        editable: false,
      });
      const controls = inspector.querySelectorAll('input, textarea, select');
      expect(controls.length).toBeGreaterThan(3);
      for (const control of controls) expect(control).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Booking agent, AI agent' })).toBeEnabled();
    });
  });
});
