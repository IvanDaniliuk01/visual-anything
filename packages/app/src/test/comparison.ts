/**
 * Two versions of the sample `my-systems` for the comparison's tests (ADR 0070): the newer one has
 * the WhatsApp channel renamed, the patient moved, the reminder service deleted with its relations,
 * an SMS channel added, and the calendar note moved.
 */
import {
  compareProjects,
  compareView,
  executeCommand,
  type Command,
  type Comparison,
  type ProjectSnapshot,
  type ViewComparison,
} from '@visual-anything/core';
import { loadSample } from './sample';

export const VIEW = 'system-overview';

/** The project after a command, which must be done. */
export function done(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(state, command, { newId: (base) => `${base}-new` });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

export interface ComparedVersions {
  older: ProjectSnapshot;
  newer: ProjectSnapshot;
  comparison: Comparison;
  view: ViewComparison;
}

/** The two versions, compared, with the comparison of the sample's view. */
export function comparedSample(): ComparedVersions {
  const older = loadSample();
  const commands: Command[] = [
    { type: 'update-element', id: 'whatsapp', changes: { name: 'WhatsApp Business' } },
    {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'patient', x: 40, y: 360, pinned: true }],
    },
    { type: 'delete', elements: ['reminder-service'] },
    {
      type: 'create-element',
      element: { id: 'sms', component: 'systems.chat-channel', name: 'SMS channel' },
      containers: [{ container: 'clinic-booking', relationType: 'systems.is-part-of' }],
      positions: [{ view: VIEW, container: 'clinic-booking', x: 40, y: 320 }],
    },
  ];
  let newer = older;
  for (const command of commands) newer = done(newer, command);
  const note = newer.views[0]?.freeShapes.find((shape) => shape.id === 'calendar-note');
  if (note?.kind === 'note') {
    newer = done(newer, { type: 'update-free-shape', view: VIEW, shape: { ...note, x: 760 } });
  }
  const comparison = compareProjects(older, newer);
  return { older, newer, comparison, view: compareView(comparison, older, newer, VIEW) };
}
