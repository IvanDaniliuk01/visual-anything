/**
 * Claude's tools for a view's scope (ADR-0040): `get_scope` reads what a view shows and why;
 * `set_scope` gives it a scope, or takes it away; `add_to_view` and `leave_out_of_view` add elements to
 * a view or leave them out of it, whatever its rules say. Each write is one undoable action, labelled
 * Claude, that changes only the view's file: none of them ever deletes anything from the model.
 */
import {
  MAX_SCOPE_DEPTH,
  MAX_SCOPE_RULES,
  modelIndexOf,
  shownByScope,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, Scope, ScopeRule, ViewFile } from '@visual-anything/schema';
import { z } from 'zod';
import { MAX_RESULTS, shownCounts } from './queries';
import { READ, WRITE, act, fail, id, ok, tool } from './kit';
import type { Tool } from './tools';

/** How many of the elements a view shows `get_scope` lists, at most. */
const LISTED = MAX_RESULTS;

const TESTS = ['is', 'is-not', 'contains', 'below', 'above', 'set', 'unset'] as const;

const rule = () =>
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('component'),
      component: id().describe('A component id, as list_definitions gives it.'),
      exactly: z
        .boolean()
        .optional()
        .describe('true: only this component, not the ones derived from it.'),
    }),
    z.object({
      kind: z.literal('relation-type'),
      relationType: id().describe(
        'A relation type id: the rule takes the elements at either end of its relations.',
      ),
      exactly: z
        .boolean()
        .optional()
        .describe('true: only this relation type, not the ones derived from it.'),
    }),
    z.object({
      kind: z.literal('contents'),
      container: id().describe('An element: the rule takes it and what sits inside it.'),
      depth: z
        .number()
        .int()
        .min(1)
        .max(MAX_SCOPE_DEPTH)
        .optional()
        .describe('How many levels down; left out, every level.'),
    }),
    z.object({
      kind: z.literal('attribute'),
      attribute: z.string().min(1),
      test: z.enum(TESTS),
      value: z
        .union([z.string(), z.number(), z.boolean()])
        .optional()
        .describe('What the value is compared with; left out for set and unset.'),
    }),
  ]);

/** A scope as the tools take it: its rules, and the elements added and left out by hand. */
const SCOPE = {
  include: z
    .array(rule())
    .max(MAX_SCOPE_RULES)
    .optional()
    .describe('An element shows when it meets one of these; with none, every element meets them.'),
  exclude: z
    .array(rule())
    .max(MAX_SCOPE_RULES)
    .optional()
    .describe('An element that meets any of these is left out.'),
  added: z.array(id()).optional().describe('Elements shown whatever the rules say.'),
  leftOut: z.array(id()).optional().describe('Elements left out whatever the rules say.'),
};

const RULES_HELP = `A rule is one of: { "kind": "component", "component": "<id>" } (with what derives from it unless "exactly": true); { "kind": "relation-type", "relationType": "<id>" } (the elements at either end of its relations); { "kind": "contents", "container": "<element id>", "depth": 2 } (the container and what sits inside it through the view's nesting relation types, every level without depth); { "kind": "attribute", "attribute": "owner", "test": "is", "value": "Payments" } (tests: is, is-not, contains, below, above, set, unset, as filters test, with the component's default when the element has no value of its own).`;

const getScope = tool({
  name: 'get_scope',
  title: 'Read what a view shows',
  description: `Reads a view's scope, the part of the model it shows (ADR 0040): its include and exclude rules, the elements added and left out by hand, how many elements and relations it shows out of the model's, and the elements it shows (World left out, at most ${LISTED}, in model order). A view without a scope shows the whole model. A relation shows while both its ends do; a shape whose container is left out sits in its nearest container that shows, or in World.

Example: { "view": "system-overview" }`,
  input: { view: id() },
  hints: READ,
  run: async (args, program) => {
    const project = await program.project();
    const view = project.views.find((each) => each.id === args.view);
    if (!view) return fail(`There is no view "${args.view}". get_project lists them.`);
    return ok(scopeAnswer(project, view));
  },
});

const setScope = tool({
  name: 'set_scope',
  title: 'Set what a view shows',
  description: `Gives a view a scope, the part of the model it shows, as one undoable action that changes only the view's file; scope null takes it away, so that the view shows the whole model again. It replaces the whole scope: read it with get_scope first to change part of it. Elements that meet the rules later, such as ones you create, appear in the view without any call. Leaving an element out of a view never deletes it from the model.

${RULES_HELP}

To show only elements you pick, as a view of one request's path does, exclude Essence, from which every component derives, and add them: added alone adds to what the rules show, and with no include rule every element meets them, so the view would show the whole model. Add the containers they sit in too, or they sit in their nearest container that shows.

Example: { "view": "payments", "scope": { "include": [{ "kind": "contents", "container": "payments-system" }], "exclude": [{ "kind": "component", "component": "systems.person" }] } }
Example: { "view": "checkout-path", "scope": { "exclude": [{ "kind": "component", "component": "essence" }], "added": ["customer", "checkout-api", "orders-db"] } }
Example: { "view": "payments", "scope": null }`,
  input: {
    view: id(),
    scope: z.object(SCOPE).nullable().describe('The scope, or null to show the whole model.'),
  },
  hints: WRITE,
  run: async (args, program) => {
    const scope = args.scope === null ? null : asScope(args.scope);
    return act(program, { type: 'set-scope', view: args.view, scope }, async () =>
      countsOf(program, args.view),
    );
  },
});

const addToView = tool({
  name: 'add_to_view',
  title: 'Add elements to a view',
  description: `Shows elements in a view whatever its scope's rules say, as one undoable action that changes only the view's file: they leave its list of elements left out, and are added by hand unless the rules show them already. A view without a scope shows them already. Use it to bring in the far end of a relation that leaves the view, or what the person asks to see there.

Example: { "view": "payments", "elements": ["ledger-db", "fraud-service"] }`,
  input: { view: id(), elements: z.array(id()).min(1) },
  hints: WRITE,
  run: async (args, program) =>
    act(program, { type: 'add-to-view', view: args.view, elements: args.elements }, async () =>
      countsOf(program, args.view),
    ),
});

const leaveOutOfView = tool({
  name: 'leave_out_of_view',
  title: 'Leave elements out of a view',
  description: `Leaves elements out of a view, never out of the model, as one undoable action that changes only the view's file: they stop being added by hand, and are left out by hand unless the rules leave them out already. A view without a scope gets one. Their relations stop showing there, and the shapes inside them sit in their nearest container that shows. To delete from the model, use delete_from_model.

Example: { "view": "overview", "elements": ["legacy-batch-job"] }`,
  input: { view: id(), elements: z.array(id()).min(1) },
  hints: WRITE,
  run: async (args, program) =>
    act(
      program,
      { type: 'leave-out-of-view', view: args.view, elements: args.elements },
      async () => countsOf(program, args.view),
    ),
});

async function countsOf(
  program: Parameters<Tool['run']>[1],
  viewId: Id,
): Promise<Record<string, unknown>> {
  const project = await program.project();
  const view = project.views.find((each) => each.id === viewId);
  return view ? { shows: shownCounts(project, view) } : {};
}

/** A scope as the tools take it, as the core takes it: values of attribute rules as text. */
function asScope(given: z.infer<z.ZodObject<typeof SCOPE>>): Scope {
  const rules = (list: typeof given.include) =>
    list?.map((each): ScopeRule => {
      if (each.kind !== 'attribute') return each;
      const { value, ...rest } = each;
      return rest.test === 'set' || rest.test === 'unset' || value === undefined
        ? rest
        : { ...rest, value: String(value) };
    });
  const include = rules(given.include);
  const exclude = rules(given.exclude);
  return {
    ...(include ? { include } : {}),
    ...(exclude ? { exclude } : {}),
    ...(given.added ? { added: given.added } : {}),
    ...(given.leftOut ? { leftOut: given.leftOut } : {}),
  };
}

/** What `get_scope` answers for a view. */
function scopeAnswer(project: ProjectSnapshot, view: ViewFile): Record<string, unknown> {
  const index = modelIndexOf(project);
  const named = (ids: readonly Id[] | undefined) =>
    (ids ?? []).map((each) => ({ id: each, name: index.element(each)?.name ?? each }));
  const counts = shownCounts(project, view);
  if (view.scope === undefined) {
    return {
      view: view.id,
      scope: null,
      shows: counts,
      note: 'This view has no scope: it shows the whole model. set_scope gives it one; leave_out_of_view leaves elements out of it.',
    };
  }
  const worldId = project.model.world.id;
  const elements = shownByScope(project, view).elements.filter((each) => each !== worldId);
  return {
    view: view.id,
    scope: view.scope,
    added: named(view.scope.added),
    leftOut: named(view.scope.leftOut),
    shows: counts,
    elements: elements.slice(0, LISTED).map((each) => ({
      id: each,
      name: index.element(each)?.name ?? each,
    })),
    ...(elements.length > LISTED
      ? { more: `${elements.length - LISTED} more elements show; find_elements finds them.` }
      : {}),
  };
}

/** The scope tools, in the order Claude reads them. */
export const SCOPE_TOOLS: readonly Tool[] = [getScope, setScope, addToView, leaveOutOfView];
