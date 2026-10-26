/**
 * Claude's tools for exploring the open view (ADR-0025 and its clarification): setting its filters,
 * turning focus mode on, and ending both, through live guidance. The app applies them as if the
 * person had set them, shows them as the person's, and the person ends them there. Nothing is written
 * to a view file and nothing enters the history.
 */
import {
  MAX_GUIDANCE_TARGETS,
  definitionsIn,
  modelIndexOf,
  type Guidance,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { z } from 'zod';
import { GUIDE, ONE_TAB, counted, fail, guideApps, guidedView, id, tool } from './kit';
import { idKind } from './queries';
import type { Tool } from './tools';

type Condition = Extract<Guidance, { kind: 'filter' }>['filters']['conditions'][number];

/** The tests a condition can make, as the app's filters offer them. */
const TESTS = [
  'is',
  'is-not',
  'contains',
  'below',
  'above',
  'set',
  'unset',
] as const satisfies readonly Condition['test'][];

const NOTHING_WRITTEN =
  'Nothing is written to the view and nothing enters the history: the app shows them as the person’s own, and the person can end them.';

const filterView = tool({
  name: 'filter_view',
  title: 'Filter the open view',
  description: `Sets the filters of the view the person has open in the app, replacing the ones it has, as if the person had set them: it hides the elements created from some components, the relations of some relation types, and what fails conditions on attributes. Nothing moves; a relation shows only while both its ends show, and a container that holds something still shown stays, drawn faintly. ${NOTHING_WRITTEN} Use it to cut a large view down to what you are explaining; end it with clear_explore.

components hides exactly the component each element is created from; onlyComponents keeps the elements created from the components named or ones deriving from them, and hides every other. relationTypes and onlyRelationTypes do the same for relations. A condition tests an attribute of elements or of relations: is, is-not, contains, below, above (numbers as numbers, text without minding case), set or unset; an element or relation stays only if it meets every condition, and a component's default counts as its value. ${ONE_TAB}

Example: { "onlyComponents": ["systems.service", "systems.database"] }
Example: { "relationTypes": ["systems.is-part-of"], "conditions": [{ "of": "elements", "attribute": "owner", "test": "is", "value": "Scheduling team" }], "view": "system-overview" }`,
  input: {
    components: z.array(id()).max(MAX_GUIDANCE_TARGETS).optional(),
    onlyComponents: z.array(id()).min(1).max(MAX_GUIDANCE_TARGETS).optional(),
    relationTypes: z.array(id()).max(MAX_GUIDANCE_TARGETS).optional(),
    onlyRelationTypes: z.array(id()).min(1).max(MAX_GUIDANCE_TARGETS).optional(),
    conditions: z
      .array(
        z.object({
          of: z.enum(['elements', 'relations']),
          attribute: z.string().min(1),
          test: z.enum(TESTS),
          value: z
            .union([z.string(), z.number(), z.boolean()])
            .optional()
            .describe('What the value is compared with; set and unset take none.'),
        }),
      )
      .optional(),
    view: guidedView(),
  },
  hints: GUIDE,
  run: async (args, program) => {
    const state = await program.project();
    const viewProblem = unknownView(state, args.view);
    if (viewProblem !== undefined) return fail(viewProblem);
    if (args.components !== undefined && args.onlyComponents !== undefined) {
      return fail('Give components to hide, or onlyComponents to keep, not both.');
    }
    if (args.relationTypes !== undefined && args.onlyRelationTypes !== undefined) {
      return fail('Give relationTypes to hide, or onlyRelationTypes to keep, not both.');
    }
    const definitions = definitionsIn(state);
    const unknownComponents = [...(args.components ?? []), ...(args.onlyComponents ?? [])].filter(
      (each) => each !== 'essence' && !definitions.components.has(each),
    );
    const unknownTypes = [...(args.relationTypes ?? []), ...(args.onlyRelationTypes ?? [])].filter(
      (each) => each !== 'relates-to' && !definitions.relationTypes.has(each),
    );
    if (unknownComponents.length > 0 || unknownTypes.length > 0) {
      const named = [...unknownComponents, ...unknownTypes].map((each) => `"${each}"`).join(', ');
      return fail(
        `No package in use defines ${named}. list_definitions gives the components and relation types.`,
      );
    }
    const components =
      args.onlyComponents === undefined
        ? (args.components ?? [])
        : allBut(
            state.model.elements.map((element) => element.component),
            (component) =>
              (args.onlyComponents ?? []).some((kept) =>
                definitions.componentDerives(component, kept),
              ),
          );
    const relationTypes =
      args.onlyRelationTypes === undefined
        ? (args.relationTypes ?? [])
        : allBut(
            state.model.relations.map((relation) => relation.relationType),
            (type) =>
              (args.onlyRelationTypes ?? []).some((kept) =>
                definitions.relationTypeDerives(type, kept),
              ),
          );
    const conditions = (args.conditions ?? []).map(({ of, attribute, test, value }): Condition => ({
      of,
      attribute,
      test,
      value: value === undefined ? '' : String(value),
    }));
    const hidesNothing =
      components.length === 0 && relationTypes.length === 0 && conditions.length === 0;
    return guideApps(
      program,
      {
        kind: 'filter',
        filters: { components, relationTypes, conditions },
        ...(args.view === undefined ? {} : { view: args.view }),
      },
      {
        hidden: { components, relationTypes },
        conditions: conditions.length,
        note: hidesNothing
          ? 'These filters hide nothing, so the view shows everything again.'
          : `The person sees the filters in the app, with a button that shows everything. ${NOTHING_WRITTEN}`,
      },
    );
  },
});

const focusView = tool({
  name: 'focus_view',
  title: 'Turn focus mode on in the open view',
  description: `Turns focus mode on in the view the person has open in the app, as if the person had, starting from elements and relations: what they reach through relations, up to some degrees (1 to 5, or "all"), outgoing, incoming or both ways, stays as it is, and the rest is drawn faintly, or hidden with isolate. It walks only what the filters leave. From then on it follows the person's selection, as focus mode does. ${NOTHING_WRITTEN} End it with clear_explore.

Unlike focus, which marks a few shapes while you explain them, this sets the app's own focus mode and its reach; it stays until the person or clear_explore ends it.

Example: { "targets": ["appointments-api"], "degrees": 2, "direction": "outgoing" }
Example: { "targets": ["booking-agent", "agent-to-api"], "degrees": "all", "isolate": true, "view": "system-overview" }`,
  input: {
    targets: z
      .array(id())
      .min(1)
      .max(MAX_GUIDANCE_TARGETS)
      .describe('Ids of elements and relations to start from.'),
    degrees: z
      .union([z.number().int().min(1).max(5), z.literal('all')])
      .optional()
      .describe('How many relations away it reaches; 1 when left out.'),
    direction: z
      .enum(['both', 'outgoing', 'incoming'])
      .optional()
      .describe('Which way it follows relations; both when left out.'),
    isolate: z
      .boolean()
      .optional()
      .describe('Hide what it does not reach instead of dimming it; false when left out.'),
    view: guidedView(),
  },
  hints: GUIDE,
  run: async (args, program) => {
    const state = await program.project();
    const viewProblem = unknownView(state, args.view);
    if (viewProblem !== undefined) return fail(viewProblem);
    const unknown = args.targets.filter((target) => idKind(state, target) === undefined);
    if (unknown.length > 0) {
      return fail(
        `Nothing has these ids: ${unknown.join(', ')}. Use find_elements or read_view to find the right ones.`,
      );
    }
    const freeShapes = args.targets.filter((target) => idKind(state, target) === 'free-shape');
    if (freeShapes.length > 0) {
      return fail(
        `Focus starts from elements and relations, and ${freeShapes.join(', ')} ${freeShapes.length === 1 ? 'is a free shape' : 'are free shapes'}.`,
      );
    }
    const index = modelIndexOf(state);
    const elements = args.targets.filter((target) => index.element(target) !== undefined).length;
    return guideApps(
      program,
      {
        kind: 'focus-view',
        targets: args.targets,
        degrees: args.degrees ?? 1,
        direction: args.direction ?? 'both',
        isolate: args.isolate ?? false,
        ...(args.view === undefined ? {} : { view: args.view }),
      },
      {
        from: `${counted(elements, 'element')} and ${counted(args.targets.length - elements, 'relation')}`,
        note: `The person sees focus mode on in the app, and can change its reach or end it. ${NOTHING_WRITTEN}`,
      },
    );
  },
});

const clearExplore = tool({
  name: 'clear_explore',
  title: 'End the filters and focus of the open view',
  description: `Ends the filters and focus mode of the view the person has open in the app, whoever set them, so that it shows everything again. It changes nothing in the project. clear_guidance takes away your marks and caption; this ends filters and focus.

Example: {}
Example: { "view": "system-overview" }`,
  input: { view: guidedView() },
  hints: GUIDE,
  run: async (args, program) => {
    const viewProblem = unknownView(await program.project(), args.view);
    if (viewProblem !== undefined) return fail(viewProblem);
    return guideApps(program, {
      kind: 'clear-explore',
      ...(args.view === undefined ? {} : { view: args.view }),
    });
  },
});

/** Claude's tools for exploring the open view, in the order Claude reads them. */
export const EXPLORE_TOOLS: readonly Tool[] = [filterView, focusView, clearExplore];

/** Why a view named cannot be used, or undefined. */
function unknownView(state: ProjectSnapshot, view: Id | undefined): string | undefined {
  if (view === undefined || state.views.some((each) => each.id === view)) return undefined;
  return `There is no view "${view}". get_project lists the views.`;
}

/** Each id used, once, that `kept` does not keep. */
function allBut(used: readonly Id[], kept: (id: Id) => boolean): Id[] {
  return [...new Set(used)].filter((each) => !kept(each));
}
