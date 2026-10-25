/**
 * The commands the scenario panel and recording send, each one undoable action with a label that says
 * what it did: "Record step 3 of “Patient books an appointment”", "Describe step 2 of …". The labels
 * are English, as the core's are, and the app shows them in the language it reads in (ADR-0038).
 */
import type { Command, NewStep, Recorded } from '@visual-anything/core';
import type { Id, ScenarioFile } from '@visual-anything/schema';
import { t } from '../i18n';
import { fill } from '../i18n/translate';

/** Changes a scenario's steps, as one action named `label`. */
export function stepsCommand(scenario: ScenarioFile, steps: NewStep[], label: string): Command {
  return {
    type: 'batch',
    label,
    commands: [{ type: 'update-scenario', id: scenario.id, changes: { steps } }],
  };
}

/** How the history names a click recorded while recording. */
export function recordedLabel(scenario: ScenarioFile, recorded: Recorded): string {
  const step = stepOf(scenario, recorded.at);
  switch (recorded.change) {
    case 'new-step':
      return fill('Record {step}', { step });
    case 'added':
      return fill('Add a relation to {step}', { step });
    case 'removed':
    case 'unchanged':
      return fill('Take a relation out of {step}', { step });
  }
}

/** “step 3 of “Patient books an appointment””, for labels. */
export function stepOf(scenario: ScenarioFile, at: number): string {
  return fill('step {n} of “{scenario}”', { n: at + 1, scenario: scenario.name });
}

/** Creates an empty scenario over a view, to record. */
export function createScenarioCommand(name: string, view: Id): Command {
  return { type: 'create-scenario', scenario: { name, view, steps: [] } };
}

/** Renames a scenario. */
export function renameScenarioCommand(scenario: ScenarioFile, name: string): Command {
  return {
    type: 'batch',
    label: fill('Rename the scenario “{old}” to “{new}”', { old: scenario.name, new: name }),
    commands: [{ type: 'update-scenario', id: scenario.id, changes: { name } }],
  };
}

/** Deletes a scenario. */
export function deleteScenarioCommand(scenario: ScenarioFile): Command {
  return { type: 'delete-scenario', id: scenario.id };
}

/** Expands a collapsed container in a view, as one undoable action. */
export function expandCommand(view: Id, container: Id): Command {
  return { type: 'set-collapsed', view, elements: [container], collapsed: false };
}

/**
 * A name for a new scenario that no scenario of the project has yet, in the language the app reads
 * in: the person's own from then on.
 */
export function newScenarioName(scenarios: readonly ScenarioFile[]): string {
  const taken = new Set(scenarios.map((scenario) => scenario.name));
  const first = t('New scenario');
  if (!taken.has(first)) return first;
  for (let count = 2; ; count++) {
    const name = t('New scenario {count}', { count });
    if (!taken.has(name)) return name;
  }
}
