/**
 * Claude's tools. Read and query tools answer from the bridge's copy of the project. Each write tool
 * call sends one command, or one batch, so it is one undoable action labelled Claude in the person's
 * history. Guidance tools mark and move the open app's view without changing anything. Descriptions
 * are how Claude learns the tools, so each one says when to use it and gives an example.
 */
import {
  MAX_CAPTION_LENGTH,
  MAX_GUIDANCE_TARGETS,
  definitionsIn,
  freshId,
  modelIndexOf,
  previewDelete,
  randomIds,
  routeOf,
  slug,
  type Command,
  type Guidance,
  type Problem,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Attributes, Id } from '@visual-anything/schema';
import { z } from 'zod';
import { ProgramUnavailableError, type CommandAnswer, type Program } from './bridge';
import {
  MAX_RESULTS,
  describeItem,
  findElements,
  findRelations,
  idKind,
  listDefinitions,
  readScenario,
  readView,
  summarizeProject,
} from './queries';

/** What a tool call comes to: a value to show Claude as JSON, or why it failed. */
export type ToolOutcome = { ok: true; value: unknown } | { ok: false; message: string };

/** Hints for the client about what a tool does. */
export interface ToolHints {
  readOnlyHint: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint: false;
}

/** One tool: what Claude reads about it, what it takes and what it does. */
export interface Tool<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  input: Shape;
  hints: ToolHints;
  run(args: z.infer<z.ZodObject<Shape>>, program: Program): Promise<ToolOutcome>;
}

function tool<Shape extends z.ZodRawShape>(definition: Tool<Shape>): Tool<Shape> {
  return definition;
}

const READ: ToolHints = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };
const WRITE: ToolHints = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DELETE: ToolHints = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
const GUIDE: ToolHints = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const id = () => z.string().min(1).max(128);
const attributes = () =>
  z
    .record(z.string(), z.unknown())
    .describe('Attribute values by attribute name: strings, numbers, booleans or JSON.');
const appearance = () =>
  z
    .object({
      shape: z.enum(['rectangle', 'rounded-rectangle', 'ellipse', 'cylinder', 'person']).optional(),
      fill: z.string().optional().describe('A color as #RRGGBB.'),
      stroke: z.string().optional().describe('A color as #RRGGBB.'),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .describe('How the shapes look; what is left out comes from the component.');
const place = () => ({
  x: z
    .number()
    .describe(
      'Canvas units, from the left of the container shape it sits in, or of the canvas in World.',
    ),
  y: z.number().describe('Canvas units, from the top of that container shape, or of the canvas.'),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  pinned: z
    .boolean()
    .optional()
    .describe(
      'Whether layout must keep this place. Default false: layout may still move it. Set true only when the person asked for this exact place.',
    ),
});

// ——— Read and query ———

const getProject = tool({
  name: 'get_project',
  title: 'Read the project in brief',
  description: `Summarizes the open project: its name, the packages it uses, how many elements and relations it holds, its views with their perspectives, its scenarios with any broken steps, and what sits directly in World. Call it first, before anything else.

Example: {}`,
  input: {},
  hints: READ,
  run: async (_args, program) => ok(summarizeProject(await program.project())),
});

const listDefinitionsTool = tool({
  name: 'list_definitions',
  title: 'List components and relation types',
  description: `Lists the components (kinds of element) and relation types the project can use, each with its package, what it derives from, its attributes (inherited ones included) and, for relation types, its direction, whether it nests (puts one element inside another) and its limits. Every component derives from "essence" and every relation type from "relates-to". Use it before creating elements or relations, to pick the right component and relation type ids.

Example: { "package": "systems" }`,
  input: { package: id().optional().describe('Only the definitions of this package.') },
  hints: READ,
  run: async (args, program) =>
    ok(
      listDefinitions(
        await program.project(),
        args.package === undefined ? {} : { package: args.package },
      ),
    ),
});

const findElementsTool = tool({
  name: 'find_elements',
  title: 'Find elements',
  description: `Finds elements by component, attribute, container or name. Every filter given must hold. A component matches the elements created from it and from components deriving from it, unless exactComponent. A container finds what sits directly inside it, or at any depth with deep; World's id finds what sits directly in World. Results come in model order, ${MAX_RESULTS} at most per call: page with offset.

Example: { "component": "systems.service", "container": "clinic-booking", "deep": true }
Example: { "attribute": { "name": "owner", "equals": "Scheduling team" } }`,
  input: {
    component: id().optional(),
    exactComponent: z.boolean().optional(),
    attribute: z
      .object({ name: z.string().min(1), equals: z.unknown().optional() })
      .optional()
      .describe('Elements that hold this attribute, with this value when equals is given.'),
    container: id().optional(),
    deep: z.boolean().optional(),
    nameContains: z.string().optional().describe('Text the name holds, whatever its case.'),
    limit: z.number().int().min(1).max(MAX_RESULTS).optional(),
    offset: z.number().int().min(0).optional(),
  },
  hints: READ,
  run: async (args, program) => {
    const { attribute, ...rest } = args;
    return ok(
      findElements(await program.project(), {
        ...withoutUndefined(rest),
        ...(attribute === undefined
          ? {}
          : {
              attribute: {
                name: attribute.name,
                ...(attribute.equals === undefined ? {} : { equals: attribute.equals as never }),
              },
            }),
      }),
    );
  },
});

const findRelationsTool = tool({
  name: 'find_relations',
  title: 'Find relations',
  description: `Finds relations by relation type, by their ends, or by name. A relation type matches its own relations and those of types deriving from it, unless exactType. touching finds the relations that end on an element or a relation at either end. Results come in model order, ${MAX_RESULTS} at most per call.

Example: { "touching": "appointments-api" }
Example: { "relationType": "systems.writes-to", "to": "appointments-db" }`,
  input: {
    relationType: id().optional(),
    exactType: z.boolean().optional(),
    from: id().optional(),
    to: id().optional(),
    touching: id().optional(),
    nameContains: z.string().optional(),
    limit: z.number().int().min(1).max(MAX_RESULTS).optional(),
    offset: z.number().int().min(0).optional(),
  },
  hints: READ,
  run: async (args, program) => ok(findRelations(await program.project(), withoutUndefined(args))),
});

const getItem = tool({
  name: 'get_item',
  title: 'Read an element or a relation',
  description: `Reads one element or relation by id, with everything around it. For an element: its component, attributes and the definitions of the attributes it can have, its own appearance, its containers (with the nesting relation that places it in each), its contents, the relations from and to it, and the views that place it. For a relation: its type, ends, attributes, the relations that end on it, and the scenario steps that use it.

Example: { "id": "booking-agent" }`,
  input: { id: id() },
  hints: READ,
  run: async (args, program) => {
    const item = describeItem(await program.project(), args.id);
    return item === undefined ? fail(`There is no element or relation "${args.id}".`) : ok(item);
  },
});

const readViewTool = tool({
  name: 'read_view',
  title: 'Read a view',
  description: `Reads a view: its perspective, the nesting relation types that arrange it, the positions it stores (each relative to the container shape it sits in; pinned ones were set by hand), its free shapes (notes and arrows), the containers it shows collapsed, and, for World and every container, the order it draws the shapes directly inside, back to front. An element without a position is placed by layout.

Example: { "view": "system-overview" }`,
  input: { view: id() },
  hints: READ,
  run: async (args, program) => {
    const view = readView(await program.project(), args.view);
    return view === undefined ? fail(`There is no view "${args.view}".`) : ok(view);
  },
});

const readScenarioTool = tool({
  name: 'read_scenario',
  title: 'Read a scenario',
  description: `Reads a scenario: the view it plays over and its steps in order, each with its description, the relations it activates (with their ends), its data in and out, and whether it is broken because a relation it uses was deleted.

Example: { "scenario": "patient-books-appointment" }`,
  input: { scenario: id() },
  hints: READ,
  run: async (args, program) => {
    const scenario = readScenario(await program.project(), args.scenario);
    return scenario === undefined ? fail(`There is no scenario "${args.scenario}".`) : ok(scenario);
  },
});

const previewDeleteTool = tool({
  name: 'preview_delete',
  title: 'Preview a delete',
  description: `Shows what deleting elements and relations would remove, without deleting anything: the relations that would go with them because they end on something deleted, the view positions that would go, and the scenario steps that would become broken. Tell the person before a delete that cascades.

Example: { "elements": ["reminder-service"] }`,
  input: { elements: z.array(id()).optional(), relations: z.array(id()).optional() },
  hints: READ,
  run: async (args, program) => ok(previewDelete(await program.project(), withoutUndefined(args))),
});

// ——— Model ———

const addToModel = tool({
  name: 'add_to_model',
  title: 'Add elements and relations',
  description: `Creates elements and relations as one undoable action. Give each new element a ref, a short name of your own such as "api", to use in this same call: in another element's inside, in a position's inside, or as a relation's from or to. Anything that is not a ref is taken as the id of something already in the project. Put an element inside containers with inside; the nesting relation type is chosen by its limits unless you give nestingRelationType. Give positions only when you want shapes at given places; without them, layout places the shapes. The answer maps each ref to the id the program made.

Example: {
  "elements": [
    { "ref": "shop", "component": "systems.system", "name": "Shop" },
    { "ref": "api", "component": "systems.service", "name": "Orders API", "inside": ["shop"], "attributes": { "owner": "Team A" } },
    { "ref": "db", "component": "systems.database", "name": "Orders DB", "inside": ["shop"] }
  ],
  "relations": [
    { "relationType": "systems.writes-to", "from": "api", "to": "db" },
    { "relationType": "systems.communicates-with", "from": "patient", "to": "api", "name": "HTTPS" }
  ]
}`,
  input: {
    elements: z
      .array(
        z.object({
          ref: z.string().min(1).max(64).optional(),
          component: id(),
          name: z.string().min(1),
          description: z.string().optional(),
          attributes: attributes().optional(),
          appearance: appearance().optional(),
          inside: z.array(z.string().min(1)).optional().describe('Containers: refs or ids.'),
          nestingRelationType: id().optional(),
          positions: z
            .array(
              z.object({
                view: id(),
                inside: z
                  .string()
                  .min(1)
                  .optional()
                  .describe(
                    'The container shape it sits in: a ref or an id. Left out, it sits directly in World.',
                  ),
                ...place(),
              }),
            )
            .optional(),
        }),
      )
      .optional(),
    relations: z
      .array(
        z.object({
          ref: z.string().min(1).max(64).optional(),
          relationType: id(),
          from: z.string().min(1).describe('A ref or an id: an element or a relation.'),
          to: z.string().min(1).describe('A ref or an id: an element or a relation.'),
          name: z.string().optional(),
          description: z.string().optional(),
          attributes: attributes().optional(),
        }),
      )
      .optional(),
    label: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('How the history names the action; one is made when left out.'),
  },
  hints: WRITE,
  run: async (args, program) => {
    const built = buildAdditions(await program.project(), args);
    if (!built.ok) return built;
    return act(program, built.command, (answer) => ({
      ids: Object.fromEntries(built.refs),
      created: answer.created,
    }));
  },
});

const updateElement = tool({
  name: 'update_element',
  title: 'Change an element',
  description: `Changes an element, World included, as one undoable action: its name, description, component, attribute values, attributes to remove, or its own appearance (replaced whole; null makes it look like its component again). A description of null removes it.

To change some traits of its own appearance and keep the others, give appearanceTraits instead: a value sets a trait, null makes it inherited again.

Example: { "id": "appointments-db", "attributes": { "engine": "postgres", "sizeGb": 20 } }
Example: { "id": "booking-agent", "appearanceTraits": { "fill": "#F8E1EC", "stroke": null } }`,
  input: {
    id: id(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    component: id().optional(),
    attributes: attributes().optional(),
    removeAttributes: z.array(z.string()).optional(),
    appearance: appearance().nullable().optional(),
    appearanceTraits: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Traits of its own appearance to set, or null to inherit again: shape, fill, stroke, width, height, detail, contentsAsRows, connectionPoints.',
      ),
  },
  hints: WRITE,
  run: async ({ id: target, ...changes }, program) =>
    act(program, {
      type: 'update-element',
      id: target,
      changes: withoutUndefined(changes) as never,
    }),
});

const updateRelation = tool({
  name: 'update_relation',
  title: 'Change a relation',
  description: `Changes a relation as one undoable action: its relation type, its ends, name, description or attributes. A name or description of null removes it.

Example: { "id": "patient-to-whatsapp", "name": "Books by message", "attributes": { "protocol": "HTTPS" } }`,
  input: {
    id: id(),
    relationType: id().optional(),
    from: id().optional(),
    to: id().optional(),
    name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    attributes: attributes().optional(),
    removeAttributes: z.array(z.string()).optional(),
  },
  hints: WRITE,
  run: async ({ id: target, ...changes }, program) =>
    act(program, {
      type: 'update-relation',
      id: target,
      changes: withoutUndefined(changes) as never,
    }),
});

const deleteFromModel = tool({
  name: 'delete_from_model',
  title: 'Delete elements and relations',
  description: `Deletes elements and relations as one undoable action. Deleting anything also deletes the relations that end on it; what an element contained stays, moving to its other containers or to World; scenario steps that used a deleted relation stay, marked broken. When the delete would take more than you named, or break a scenario step, it is refused and says what would go: tell the person, then call again with cascade true.

Example: { "elements": ["reminder-service"] }
Example: { "relations": ["api-reads-db"], "cascade": true }`,
  input: {
    elements: z.array(id()).optional(),
    relations: z.array(id()).optional(),
    cascade: z
      .boolean()
      .optional()
      .describe(
        'Allow deleting the relations that end on what is deleted, and breaking scenario steps.',
      ),
  },
  hints: DELETE,
  run: async (args, program) => {
    const targets = withoutUndefined({ elements: args.elements, relations: args.relations });
    const preview = previewDelete(await program.project(), targets);
    if (preview.problems.length > 0) return fail(sentences(preview.problems));
    if (!args.cascade && (preview.cascaded.length > 0 || preview.brokenSteps.length > 0)) {
      return fail(
        `Not deleted: this would also delete ${preview.cascaded.length} relation(s) that end on what you named (${preview.cascaded.join(', ') || 'none'}) and mark ${preview.brokenSteps.length} scenario step(s) broken. Tell the person, then call again with cascade: true.`,
      );
    }
    return act(program, { type: 'delete', ...targets }, () => ({
      deleted: { elements: preview.elements, relations: preview.relations },
      brokenSteps: preview.brokenSteps,
    }));
  },
});

const changeContainer = tool({
  name: 'change_container',
  title: 'Put elements inside a container, or take them out',
  description: `Puts elements inside a container in a view, or takes them out to World when into is left out, as one undoable action, as the person does by dropping shapes. Each element leaves the container its shape sits in (from: left out for World), losing the nesting relation that placed it there, and gains one relation to the new container, of the same type when it can. Its shape comes to the front there. Containment is part of the model, so every view that nests by that relation type shows the change.

Example: { "view": "system-overview", "into": "scheduling", "shapes": [{ "element": "reminder-service", "from": "clinic-booking" }] }`,
  input: {
    view: id(),
    into: id().optional(),
    relationType: id().optional(),
    shapes: z
      .array(
        z.object({
          element: id(),
          from: id().optional(),
          at: z
            .object({
              x: z.number(),
              y: z.number(),
              width: z.number().optional(),
              height: z.number().optional(),
            })
            .optional(),
          pinned: z.boolean().optional(),
        }),
      )
      .min(1),
  },
  hints: WRITE,
  run: async (args, program) =>
    act(program, {
      type: 'change-container',
      view: args.view,
      ...(args.into === undefined ? {} : { to: args.into }),
      ...(args.relationType === undefined ? {} : { relationType: args.relationType }),
      shapes: args.shapes.map((shape) => withoutUndefined(shape)),
    }),
});

// ——— Components, relation types and packages ———

const createPackage = tool({
  name: 'create_package',
  title: 'Create a package',
  description: `Creates an empty package of the project's own, which the project then uses, as one undoable action. Components and relation types are defined in a package; their ids start with its id and a dot.

Example: { "id": "clinic", "name": "Clinic", "description": "What a clinic needs beyond Systems." }`,
  input: { id: id(), name: z.string().min(1), description: z.string().optional() },
  hints: WRITE,
  run: async (args, program) =>
    act(program, { type: 'create-package', package: withoutUndefined(args) }),
});

const defineComponent = tool({
  name: 'define_component',
  title: 'Define a component',
  description: `Defines a component in one of the project's own packages, as one undoable action, written as the package file's JSON writes it. It derives from exactly one component and inherits everything it does not redefine. Leave the id out to have the program make one from the name. To create, pass createOnly: then an id the package already has is refused rather than redefined. To change some traits of a component, use update_component instead. Read list_definitions first.

Example: { "package": "clinic", "createOnly": true, "component": { "name": "Calendar", "derivesFrom": "systems.database", "attributes": [{ "name": "slotMinutes", "type": "number", "default": 15 }], "appearance": { "fill": "#E3F2E9" } } }`,
  input: {
    package: id(),
    createOnly: z.boolean().optional(),
    component: z
      .object({ id: id().optional(), name: z.string().min(1), derivesFrom: id() })
      .catchall(z.unknown())
      .describe('name, derivesFrom, and optionally id, description, attributes and appearance.'),
  },
  hints: WRITE,
  run: async (args, program) =>
    act(
      program,
      {
        type: 'define-component',
        package: args.package,
        component: args.component,
        ...(args.createOnly ? { createOnly: true } : {}),
      } as unknown as Command,
      (answer) => ({ created: answer.created }),
    ),
});

const defineRelationType = tool({
  name: 'define_relation_type',
  title: 'Define a relation type',
  description: `Defines a relation type in one of the project's own packages, as one undoable action. It derives from exactly one relation type. direction is "directed" or "undirected"; nests: true makes its relations put the from end inside the to end; limits name the components each end should come from, and only warn. Leave the id out to have the program make one; pass createOnly to create rather than redefine. To change some traits, use update_relation_type instead.

Example: { "package": "clinic", "createOnly": true, "relationType": { "name": "books", "derivesFrom": "relates-to", "direction": "directed", "limits": { "from": ["systems.person"] } } }`,
  input: {
    package: id(),
    createOnly: z.boolean().optional(),
    relationType: z
      .object({ id: id().optional(), name: z.string().min(1), derivesFrom: id() })
      .catchall(z.unknown())
      .describe(
        'name, derivesFrom, and optionally id, description, direction, nests, attributes, appearance and limits.',
      ),
  },
  hints: WRITE,
  run: async (args, program) =>
    act(
      program,
      {
        type: 'define-relation-type',
        package: args.package,
        relationType: args.relationType,
        ...(args.createOnly ? { createOnly: true } : {}),
      } as unknown as Command,
      (answer) => ({ created: answer.created }),
    ),
});

const removeDefinition = tool({
  name: 'remove_definition',
  title: 'Remove a component or relation type',
  description: `Removes a component or a relation type of the project's own packages, as one undoable action. It is refused while anything is created from it, derives from it, or a view nests by it.

Example: { "id": "clinic.calendar" }`,
  input: { id: id() },
  hints: DELETE,
  run: async (args, program) => {
    const definitions = definitionsIn(await program.project());
    if (definitions.components.has(args.id)) {
      return act(program, { type: 'remove-component', id: args.id });
    }
    if (definitions.relationTypes.has(args.id)) {
      return act(program, { type: 'remove-relation-type', id: args.id });
    }
    return fail(`No package in use defines a component or relation type "${args.id}".`);
  },
});

const attributeChanges = () =>
  z
    .object({
      rename: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
      set: z.array(z.record(z.string(), z.unknown())).optional(),
      remove: z.array(z.string()).optional(),
      order: z.array(z.string()).optional(),
    })
    .describe(
      'Changes to the attributes it defines itself, applied in this order: rename, set, remove, order. A rename moves the values elements hold.',
    );

const updateComponent = tool({
  name: 'update_component',
  title: 'Change a component, trait by trait',
  description: `Changes a component of one of the project's own packages, trait by trait, as one undoable action; what you leave out stays. In appearance, a value sets a trait and null makes it inherited again. To change a built-in component's look in this project, change its elements instead.

Example: { "id": "clinic.calendar", "name": "Calendar", "appearance": { "fill": "#E3F2E9", "stroke": null }, "attributes": { "rename": [{ "from": "slotMinutes", "to": "slotLength" }] } }`,
  input: {
    id: id(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    derivesFrom: id().optional(),
    appearance: z.record(z.string(), z.unknown()).optional(),
    attributes: attributeChanges().optional(),
  },
  hints: WRITE,
  run: async ({ id: target, ...changes }, program) =>
    actOnNewer(
      program,
      { type: 'update-component', id: target, changes: withoutUndefined(changes) },
      'Changing a component trait by trait is',
    ),
});

const updateRelationType = tool({
  name: 'update_relation_type',
  title: 'Change a relation type, trait by trait',
  description: `Changes a relation type of one of the project's own packages, trait by trait, as one undoable action; what you leave out stays, and null makes a trait inherited again. Limits take, per end, a list of component ids, "any", or null. It cannot stop nesting while a view nests by it.

Example: { "id": "clinic.books", "direction": "directed", "limits": { "to": ["clinic.calendar"] } }`,
  input: {
    id: id(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    derivesFrom: id().optional(),
    direction: z.enum(['directed', 'undirected']).nullable().optional(),
    nests: z.boolean().nullable().optional(),
    appearance: z.record(z.string(), z.unknown()).optional(),
    attributes: attributeChanges().optional(),
    limits: z
      .object({
        from: z
          .union([z.array(id()), z.literal('any')])
          .nullable()
          .optional(),
        to: z
          .union([z.array(id()), z.literal('any')])
          .nullable()
          .optional(),
      })
      .optional(),
  },
  hints: WRITE,
  run: async ({ id: target, ...changes }, program) =>
    actOnNewer(
      program,
      { type: 'update-relation-type', id: target, changes: withoutUndefined(changes) },
      'Changing a relation type trait by trait is',
    ),
});

const updatePackage = tool({
  name: 'update_package',
  title: 'Rename a package',
  description: `Changes the name or description of one of the project's own packages, as one undoable action. Its id stays.

Example: { "id": "clinic", "name": "Clinic", "description": "What a clinic needs beyond Systems." }`,
  input: {
    id: id(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
  },
  hints: WRITE,
  run: async ({ id: target, ...changes }, program) =>
    actOnNewer(
      program,
      { type: 'update-package', id: target, changes: withoutUndefined(changes) },
      'Changing a package is',
    ),
});

const reorderElements = tool({
  name: 'reorder_elements',
  title: 'Reorder elements',
  description: `Moves elements in the model's order, as one undoable action: the ones listed, in the order listed, before another element, or last. It is the order of a table's rows, and the order shapes that no stacking order names are drawn in. World cannot move.

Example: { "elements": ["patients-id"], "before": "patients-name" }`,
  input: { elements: z.array(id()).min(1), before: id().optional() },
  hints: WRITE,
  run: async (args, program) =>
    actOnNewer(
      program,
      { type: 'reorder-elements', ...withoutUndefined(args) },
      'Reordering elements is',
    ),
});

// ——— Views ———

const createView = tool({
  name: 'create_view',
  title: 'Create a view',
  description: `Creates a view, as one undoable action. A view shows the model from exactly one perspective, such as "Data flow", "Ownership" or "Security", and is arranged by the nesting relation types it lists; without them, every relation type that nests arranges it. A new view has no positions: layout places every shape until you set some.

Example: { "name": "Who owns what", "perspective": { "name": "Ownership", "description": "Which team runs each service." }, "nestingRelationTypes": ["systems.is-part-of"] }`,
  input: {
    name: z.string().min(1),
    description: z.string().optional(),
    perspective: z.object({ name: z.string().min(1), description: z.string().optional() }),
    nestingRelationTypes: z.array(id()).optional(),
  },
  hints: WRITE,
  run: async (args, program) =>
    act(
      program,
      {
        type: 'create-view',
        view: withoutUndefined({
          ...args,
          perspective: withoutUndefined(args.perspective),
        }),
      },
      (answer) => ({ view: answer.created[0] }),
    ),
});

const updateView = tool({
  name: 'update_view',
  title: 'Change a view',
  description: `Changes a view's name, description, perspective or nesting relation types, as one undoable action. A description of null removes it.

Example: { "id": "system-overview", "perspective": { "name": "Data flow" }, "nestingRelationTypes": ["systems.is-part-of"] }`,
  input: {
    id: id(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    perspective: z
      .object({ name: z.string().min(1), description: z.string().optional() })
      .optional(),
    nestingRelationTypes: z.array(id()).optional(),
  },
  hints: WRITE,
  run: async ({ id: target, ...changes }, program) =>
    act(program, { type: 'update-view', id: target, changes: withoutUndefined(changes) }),
});

const deleteView = tool({
  name: 'delete_view',
  title: 'Delete a view',
  description: `Deletes a view that no scenario plays over, as one undoable action. The model is untouched.

Example: { "id": "draft-view" }`,
  input: { id: id() },
  hints: DELETE,
  run: async (args, program) => act(program, { type: 'delete-view', id: args.id }),
});

const setPositions = tool({
  name: 'set_positions',
  title: 'Place shapes in a view',
  description: `Sets where element shapes sit in a view, as one undoable action. A position is keyed by the element and the container its shape sits in (left out for World), and is relative to that container's shape; every copy of a container shares its inner layout. Positions are left for layout to change unless pinned. Your positions are not snapped to the grid.

Example: { "view": "system-overview", "positions": [{ "element": "scheduling", "container": "clinic-booking", "x": 520, "y": 64, "width": 440, "height": 384 }, { "element": "patient", "x": 40, "y": 200 }] }`,
  input: {
    view: id(),
    positions: z.array(z.object({ element: id(), container: id().optional(), ...place() })).min(1),
  },
  hints: WRITE,
  run: async (args, program) =>
    act(program, {
      type: 'set-positions',
      view: args.view,
      positions: args.positions.map((position) => ({
        pinned: false,
        ...withoutUndefined(position),
      })),
    }),
});

const forgetPositions = tool({
  name: 'forget_positions',
  title: 'Let layout place shapes again',
  description: `Forgets where element shapes sit in a view, so that layout places them again, as one undoable action.

Example: { "view": "system-overview", "positions": [{ "element": "reminder-service", "container": "scheduling" }] }`,
  input: {
    view: id(),
    positions: z.array(z.object({ element: id(), container: id().optional() })).min(1),
  },
  hints: WRITE,
  run: async (args, program) =>
    act(program, {
      type: 'remove-positions',
      view: args.view,
      positions: args.positions.map((position) => withoutUndefined(position)),
    }),
});

const restack = tool({
  name: 'restack',
  title: 'Change the stacking order',
  description: `Changes which shapes a view draws in front, among the shapes that sit directly in the same container (or in World), one move after another, as one undoable action. A shape goes to the front, to the back, or just in front of or behind a shape beside it. A container is always drawn with everything inside it.

Example: { "view": "system-overview", "moves": [{ "element": "appointments-db", "container": "scheduling", "to": "front" }, { "element": "patient", "to": { "behind": "clinic-booking" } }] }`,
  input: {
    view: id(),
    moves: z
      .array(
        z.object({
          element: id(),
          container: id().optional(),
          to: z.union([
            z.enum(['front', 'back']),
            z.object({ inFrontOf: id() }),
            z.object({ behind: id() }),
          ]),
        }),
      )
      .min(1),
  },
  hints: WRITE,
  run: async (args, program) =>
    act(program, {
      type: 'restack',
      view: args.view,
      moves: args.moves.map(({ element, container, to }) => ({
        shape: withoutUndefined({ element, container }),
        to,
      })),
    }),
});

const setCollapsed = tool({
  name: 'set_collapsed',
  title: 'Collapse or expand containers',
  description: `Collapses containers in a view, showing none of their contents and one aggregated relation, with a count, for each relation type and far end, or expands them again, as one undoable action. It changes only the view.

Example: { "view": "system-overview", "elements": ["scheduling"], "collapsed": true }`,
  input: { view: id(), elements: z.array(id()).min(1), collapsed: z.boolean() },
  hints: WRITE,
  run: async (args, program) =>
    // The command of interface I1.
    actOnNewer(program, { type: 'set-collapsed', ...args }, 'Collapsing and expanding are'),
});

/** Where a line attaches to one of its ends, or `null` for automatically. */
const attachment = () =>
  z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('connection-point'), name: z.string().min(1).max(32) }),
      z.object({
        kind: z.literal('border'),
        side: z.enum(['top', 'right', 'bottom', 'left']),
        at: z.number().min(0).max(1),
      }),
    ])
    .nullable()
    .optional();

const setRoute = tool({
  name: 'set_route',
  title: 'Route a relation by hand',
  description: `Routes a relation by hand in a view, as the person does by dragging its ends and bend points, as one undoable action; only what you give changes, and the rest stays as it is. from and to say where the line attaches to each end: { "kind": "connection-point", "name": "out" } for one of the end's connection points (list_definitions gives a component's), or { "kind": "border", "side": "left", "at": 0.25 } for a place on its border, at going from 0 at the side's top or left end to 1 at its bottom or right end; null attaches it automatically again. An end that is a relation attaches to the middle of that relation's line and takes neither; a row, or a table that draws rows, takes only its left or right side. bendPoints are the points the line passes through, in order from its from end, in canvas units relative to the shape of the nearest container that holds both ends (or to the canvas when that is World), as read_view gives positions; the answer says which container; null removes them. style is orthogonal (the default), straight or curved. A relation the view draws as containment has no route.

Example: { "view": "system-overview", "relation": "booking-agent-calls-api-k3f9q2", "from": { "kind": "connection-point", "name": "out" }, "to": { "kind": "border", "side": "top", "at": 0.5 } }
Example: { "view": "system-overview", "relation": "api-reads-db-p0x7aa", "bendPoints": [{ "x": 320, "y": 96 }, { "x": 320, "y": 220 }], "style": "curved" }`,
  input: {
    view: id(),
    relation: id(),
    from: attachment().describe(
      "Where the line attaches to the relation's from end; null attaches it automatically again.",
    ),
    to: attachment().describe(
      "Where the line attaches to the relation's to end; null attaches it automatically again.",
    ),
    bendPoints: z
      .array(z.object({ x: z.number(), y: z.number() }))
      .max(64)
      .nullable()
      .optional()
      .describe(
        'The points the line passes through, from its from end, relative to the nearest container holding both ends; null removes them.',
      ),
    style: z.enum(['orthogonal', 'straight', 'curved']).optional(),
  },
  hints: WRITE,
  run: async ({ view, relation, ...changes }, program) => {
    const outcome = await act(program, {
      type: 'set-route',
      view,
      relation,
      ...withoutUndefined(changes),
    });
    if (!outcome.ok) return outcome;
    const state = await program.project();
    const kept = state.views.find((each) => each.id === view)?.routes;
    const route = kept !== undefined && Object.hasOwn(kept, relation) ? kept[relation] : undefined;
    const container =
      route?.bendPoints === undefined ? routeOf(state, view, relation)?.frame : route.container;
    const name = container === undefined ? undefined : modelIndexOf(state).element(container)?.name;
    return ok({
      ...(outcome.value as Record<string, unknown>),
      route: route ?? 'automatic',
      bendPointsRelativeTo: container === undefined ? 'the canvas' : { container, name },
    });
  },
});

const resetRoute = tool({
  name: 'reset_route',
  title: 'Route relations automatically again',
  description: `Routes relations automatically again in a view, as one undoable action: their ends attach where layout puts them, with no bend points, orthogonally. Relations the view does not route by hand are left as they are.

Example: { "view": "system-overview", "relations": ["booking-agent-calls-api-k3f9q2"] }`,
  input: { view: id(), relations: z.array(id()).min(1) },
  hints: WRITE,
  run: async (args, program) => act(program, { type: 'reset-route', ...args }),
});

const freeShape = () =>
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('note'),
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
      text: z.string(),
    }),
    z.object({
      kind: z.literal('arrow'),
      from: z.object({ x: z.number(), y: z.number() }),
      to: z.object({ x: z.number(), y: z.number() }),
    }),
  ]);

const addFreeShape = tool({
  name: 'add_free_shape',
  title: 'Add a note or an arrow',
  description: `Adds a free shape to a view, as one undoable action: a note holding text, or an arrow pointing from one place on the canvas to another. Free shapes are drawing only; they are not part of the model.

Example: { "view": "system-overview", "shape": { "kind": "note", "x": 40, "y": 560, "width": 240, "height": 80, "text": "Reminders go out the day before." } }`,
  input: { view: id(), shape: freeShape() },
  hints: WRITE,
  run: async (args, program) =>
    act(program, { type: 'create-free-shape', view: args.view, shape: args.shape }, (answer) => ({
      shape: answer.created[0],
    })),
});

const updateFreeShape = tool({
  name: 'update_free_shape',
  title: 'Change a note or an arrow',
  description: `Replaces a free shape of a view, as one undoable action; read_view gives its id.

Example: { "view": "system-overview", "shape": { "id": "note-k3f9q2", "kind": "note", "x": 40, "y": 560, "width": 240, "height": 80, "text": "Reminders go out at 9:00." } }`,
  input: {
    view: id(),
    shape: z.intersection(z.object({ id: id() }), freeShape()),
  },
  hints: WRITE,
  run: async (args, program) =>
    act(program, { type: 'update-free-shape', view: args.view, shape: args.shape as never }),
});

const deleteFreeShapes = tool({
  name: 'delete_free_shapes',
  title: 'Delete notes and arrows',
  description: `Deletes free shapes from a view, as one undoable action.

Example: { "view": "system-overview", "ids": ["note-k3f9q2"] }`,
  input: { view: id(), ids: z.array(id()).min(1) },
  hints: DELETE,
  run: async (args, program) => act(program, { type: 'delete-free-shapes', ...args }),
});

const updateProject = tool({
  name: 'update_project',
  title: 'Change the project',
  description: `Changes the project's name, description or the packages it uses, as one undoable action. A package can be dropped only while nothing comes from it.

Example: { "name": "Clinic systems" }`,
  input: {
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    packages: z.array(id()).optional(),
  },
  hints: WRITE,
  run: async (args, program) =>
    act(program, { type: 'update-project', changes: withoutUndefined(args) }),
});

const runCommands = tool({
  name: 'run_commands',
  title: 'Run commands as one action',
  description: `Runs several of Visual Anything's commands as one undoable action, for changes no other tool makes at once. Each command is an object with a type, as the program's core takes it, such as "create-element", "update-element", "delete", "create-relation", "update-relation", "create-package", "define-component", "remove-component", "define-relation-type", "remove-relation-type", "create-view", "update-view", "delete-view", "set-positions", "remove-positions", "create-free-shape", "update-free-shape", "delete-free-shapes", "update-project", "restack", "change-container", "set-route" and "reset-route". Either all of them are done, or none is and the answer says which one was refused and why. Prefer the other tools when one fits.

Example: { "label": "Move the reminders into Scheduling", "commands": [{ "type": "update-element", "id": "reminder-service", "changes": { "name": "Reminders" } }, { "type": "set-positions", "view": "system-overview", "positions": [{ "element": "reminder-service", "container": "scheduling", "x": 40, "y": 260 }] }] }`,
  input: {
    label: z.string().min(1).max(200),
    commands: z.array(z.object({ type: z.string().min(1) }).catchall(z.unknown())).min(1),
  },
  hints: WRITE,
  run: async (args, program) =>
    act(program, { type: 'batch', label: args.label, commands: args.commands as never }),
});

// ——— Guidance ———

const targets = () =>
  z
    .array(id())
    .min(1)
    .max(MAX_GUIDANCE_TARGETS)
    .describe(
      'Ids of elements, relations or free shapes; an element is marked in every shape it has.',
    );
const guidedView = () =>
  id().optional().describe('The view to open first; left out, the view the person has open.');

const highlight = tool({
  name: 'highlight',
  title: 'Highlight shapes for the person',
  description: `Marks elements, relations or free shapes in the app the person has open, replacing the marks you made before. It changes nothing in the project and is not undone: it only shows. Use it while you explain, together with show_caption.

Example: { "targets": ["booking-agent", "agent-to-api"], "view": "system-overview" }`,
  input: { targets: targets(), view: guidedView() },
  hints: GUIDE,
  run: async (args, program) => guide(program, { kind: 'highlight', ...withoutUndefined(args) }),
});

const focus = tool({
  name: 'focus',
  title: 'Focus the view on shapes',
  description: `Marks the targets, dims everything not connected to them, and moves the canvas to the first one, in the app the person has open. It changes nothing in the project.

Example: { "targets": ["appointments-api"] }`,
  input: { targets: targets(), view: guidedView() },
  hints: GUIDE,
  run: async (args, program) => guide(program, { kind: 'focus', ...withoutUndefined(args) }),
});

const panTo = tool({
  name: 'pan_to',
  title: 'Move the view to a shape',
  description: `Moves the canvas of the app the person has open so that an element, a relation or a free shape shows, opening its view first when you name one. It changes nothing in the project.

Example: { "target": "appointments-db", "view": "system-overview" }`,
  input: { target: id(), view: guidedView() },
  hints: GUIDE,
  run: async (args, program) => guide(program, { kind: 'pan-to', ...withoutUndefined(args) }),
});

const showCaption = tool({
  name: 'show_caption',
  title: 'Show a caption',
  description: `Shows a short caption over the canvas of the app the person has open, as plain text of at most ${MAX_CAPTION_LENGTH} characters, until you show another or clear it; an empty text takes it away. Say one thing per caption, while you highlight what it is about.

Example: { "text": "The booking agent offers free slots, which it reads from the Appointments API." }`,
  input: { text: z.string().max(MAX_CAPTION_LENGTH) },
  hints: GUIDE,
  run: async (args, program) => guide(program, { kind: 'caption', text: args.text }),
});

const clearGuidance = tool({
  name: 'clear_guidance',
  title: 'Clear the guidance',
  description: `Takes away every mark and the caption you showed in the app.

Example: {}`,
  input: {},
  hints: GUIDE,
  run: async (_args, program) => guide(program, { kind: 'clear' }),
});

const openApp = tool({
  name: 'open_app',
  title: 'Open the app',
  description: `Opens Visual Anything on the project in the person's browser, on the computer it runs on, at an address that works once. Guidance shows only while the app is open. Use it when a guidance tool says no app is open, or when the person asks to see the project.

Example: {}`,
  input: {},
  hints: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async (_args, program) => {
    await program.openApp();
    return ok({ opened: 'The browser was asked to open Visual Anything on the project.' });
  },
});

/** Every tool, in the order Claude reads them. */
export const TOOLS: readonly Tool[] = [
  getProject,
  listDefinitionsTool,
  findElementsTool,
  findRelationsTool,
  getItem,
  readViewTool,
  readScenarioTool,
  previewDeleteTool,
  addToModel,
  updateElement,
  updateRelation,
  deleteFromModel,
  changeContainer,
  createPackage,
  defineComponent,
  defineRelationType,
  removeDefinition,
  updateComponent,
  updateRelationType,
  updatePackage,
  reorderElements,
  createView,
  updateView,
  deleteView,
  setPositions,
  forgetPositions,
  restack,
  setCollapsed,
  setRoute,
  resetRoute,
  addFreeShape,
  updateFreeShape,
  deleteFreeShapes,
  updateProject,
  runCommands,
  highlight,
  focus,
  panTo,
  showCaption,
  clearGuidance,
  openApp,
];

/** Runs a tool, turning a program that cannot be reached into an outcome Claude reads. */
export async function runTool(
  definition: Tool,
  args: unknown,
  program: Program,
): Promise<ToolOutcome> {
  try {
    return await definition.run(args as never, program);
  } catch (error) {
    if (error instanceof ProgramUnavailableError) return fail(error.message);
    return fail(`The tool failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ——— Helpers ———

function ok(value: unknown): ToolOutcome {
  return { ok: true, value };
}

function fail(message: string): ToolOutcome {
  return { ok: false, message };
}

function sentences(problems: readonly Problem[]): string {
  return problems.map((each) => each.message).join(' ');
}

/** Sends a command as Claude's action, and says what was done or why not. */
async function act(
  program: Program,
  command: Command,
  more: (answer: Extract<CommandAnswer, { ok: true }>) => Record<string, unknown> = (answer) =>
    answer.created.length > 0 ? { created: answer.created } : {},
): Promise<ToolOutcome> {
  const answer = await program.execute(command);
  if (!answer.ok) {
    return fail(
      `Refused, so nothing changed: ${sentences(answer.problems)} (${[...new Set(answer.problems.map((each) => each.code))].join(', ')})`,
    );
  }
  return ok({
    done: answer.changed ? answer.label : 'Nothing changed, so nothing was recorded.',
    ...(answer.changed ? { undo: 'The person can undo it in the app.' } : {}),
    ...more(answer),
    ...(answer.warnings.length > 0
      ? { warnings: answer.warnings.map((each) => each.message) }
      : {}),
  });
}

/**
 * Sends a command that only newer builds of the core know, and says so plainly when this one does
 * not: `what` is how the answer names what is missing, such as "Collapsing is".
 */
async function actOnNewer(
  program: Program,
  command: { type: string } & Record<string, unknown>,
  what: string,
): Promise<ToolOutcome> {
  const outcome = await act(program, command as unknown as Command);
  if (!outcome.ok && outcome.message.includes(`"${command.type}" is not a command`)) {
    return fail(`${what} not in this build of Visual Anything yet.`);
  }
  return outcome;
}

/** Checks the targets and view of guidance, sends it, and says whether anyone saw it. */
async function guide(program: Program, guidance: Guidance): Promise<ToolOutcome> {
  const state = await program.project();
  if ('view' in guidance && guidance.view !== undefined) {
    const viewId = guidance.view;
    if (!state.views.some((view) => view.id === viewId))
      return fail(`There is no view "${viewId}".`);
  }
  const named =
    guidance.kind === 'pan-to' ? [guidance.target] : 'targets' in guidance ? guidance.targets : [];
  const unknown = named.filter((target) => idKind(state, target) === undefined);
  if (unknown.length > 0) {
    return fail(
      `Nothing has these ids: ${unknown.join(', ')}. Use find_elements or read_view to find the right ones.`,
    );
  }
  const apps = await program.guide(guidance);
  if (apps === 0) {
    return ok({
      shown: 0,
      note: 'No app has the project open, so nobody sees this. Call open_app to open it in the browser, or ask the person to open it.',
    });
  }
  return ok({ shown: apps });
}

/** The additions of `add_to_model` as one command, with the id made for each ref. */
function buildAdditions(
  state: ProjectSnapshot,
  args: z.infer<z.ZodObject<(typeof addToModel)['input']>>,
): { ok: true; command: Command; refs: Map<string, Id> } | { ok: false; message: string } {
  const elements = args.elements ?? [];
  const relations = args.relations ?? [];
  if (elements.length === 0 && relations.length === 0) {
    return { ok: false, message: 'Give at least one element or relation.' };
  }
  const index = modelIndexOf(state);
  const definitions = definitionsIn(state);
  const generate = randomIds();
  const refs = new Map<string, Id>();
  const assigned = new Set<Id>();
  const taken = (candidate: Id) => index.has(candidate) || assigned.has(candidate);
  const newId = (name: string, fallback: string) => {
    const made = freshId(generate, slug(name, fallback), taken);
    assigned.add(made);
    return made;
  };
  const seen = new Set<string>();
  for (const each of [...elements, ...relations]) {
    if (each.ref === undefined) continue;
    if (seen.has(each.ref)) return { ok: false, message: `The ref "${each.ref}" is given twice.` };
    seen.add(each.ref);
  }
  // The id the program will create each new element and relation with.
  const idOf = new Map<object, Id>();
  const componentOfRef = new Map<string, Id>();
  for (const element of elements) {
    const made = newId(element.name, 'element');
    idOf.set(element, made);
    if (element.ref !== undefined) {
      refs.set(element.ref, made);
      componentOfRef.set(element.ref, element.component);
    }
  }
  for (const relation of relations) {
    const base = relation.name ?? relation.relationType.split('.').at(-1) ?? 'relation';
    const made = newId(base, 'relation');
    idOf.set(relation, made);
    if (relation.ref !== undefined) refs.set(relation.ref, made);
  }
  const resolve = (value: string) => refs.get(value) ?? value;
  const componentOf = (value: string) =>
    componentOfRef.get(value) ?? index.element(value)?.component;

  // Containers before their contents, so each container exists when its contents are created.
  const ordered: typeof elements = [];
  const placed = new Set<(typeof elements)[number]>();
  const visiting = new Set<(typeof elements)[number]>();
  const byRef = new Map(
    elements.flatMap((each) => (each.ref === undefined ? [] : [[each.ref, each] as const])),
  );
  const visit = (element: (typeof elements)[number]): string | undefined => {
    if (placed.has(element)) return undefined;
    if (visiting.has(element))
      return `The elements "${element.name}" and its containers contain each other.`;
    visiting.add(element);
    for (const container of [
      ...(element.inside ?? []),
      ...(element.positions ?? []).flatMap((position) => position.inside ?? []),
    ]) {
      const inner = byRef.get(container);
      if (inner !== undefined) {
        const problem = visit(inner);
        if (problem !== undefined) return problem;
      }
    }
    visiting.delete(element);
    placed.add(element);
    ordered.push(element);
    return undefined;
  };
  for (const element of elements) {
    const problem = visit(element);
    if (problem !== undefined) return { ok: false, message: problem };
  }

  const commands: Command[] = [];
  for (const element of ordered) {
    const containers: { container: Id; relationType: Id }[] = [];
    for (const inside of element.inside ?? []) {
      const container = resolve(inside);
      const relationType =
        element.nestingRelationType ??
        chooseNesting(definitions, element.component, componentOf(inside));
      if (relationType === undefined) {
        return {
          ok: false,
          message: `No relation type in use nests "${element.name}" inside "${inside}": give nestingRelationType, from list_definitions.`,
        };
      }
      containers.push({ container, relationType });
    }
    commands.push({
      type: 'create-element',
      element: withoutUndefined({
        id: idOf.get(element),
        component: element.component,
        name: element.name,
        description: element.description,
        attributes: element.attributes as Attributes | undefined,
        appearance: element.appearance,
      }),
      ...(containers.length === 0 ? {} : { containers }),
      ...(element.positions === undefined
        ? {}
        : {
            positions: element.positions.map(({ inside, ...position }) => ({
              pinned: false,
              ...withoutUndefined(position),
              ...(inside === undefined ? {} : { container: resolve(inside) }),
            })),
          }),
    });
  }
  for (const relation of relations) {
    commands.push({
      type: 'create-relation',
      relation: withoutUndefined({
        id: idOf.get(relation),
        relationType: relation.relationType,
        from: resolve(relation.from),
        to: resolve(relation.to),
        name: relation.name,
        description: relation.description,
        attributes: relation.attributes as Attributes | undefined,
      }),
    });
  }
  const only = commands[0];
  const command: Command =
    commands.length === 1 && only !== undefined && args.label === undefined
      ? only
      : {
          type: 'batch',
          label: args.label ?? additionsLabel(elements.length, relations.length),
          commands,
        };
  return { ok: true, command, refs };
}

/**
 * The nesting relation type that puts an element of a component inside a container of another: the
 * first in use whose limits accept both ends, or the first in use when none limits them.
 */
function chooseNesting(
  definitions: ReturnType<typeof definitionsIn>,
  content: Id,
  container: Id | undefined,
): Id | undefined {
  const accepts = (allowed: readonly Id[] | undefined, component: Id | undefined) =>
    allowed === undefined ||
    (component !== undefined &&
      allowed.some((each) => definitions.componentDerives(component, each)));
  const nesting = [...definitions.nestingRelationTypes];
  return (
    nesting.find((each) => {
      const limits = definitions.relationType(each)?.limits ?? {};
      return accepts(limits.from, content) && accepts(limits.to, container);
    }) ?? nesting[0]
  );
}

function additionsLabel(elements: number, relations: number): string {
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  if (relations === 0) return `Create ${count(elements, 'element')}`;
  if (elements === 0) return `Create ${count(relations, 'relation')}`;
  return `Create ${count(elements, 'element')} and ${count(relations, 'relation')}`;
}

/** The object without the keys whose value is undefined. */
function withoutUndefined<T extends object>(
  value: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(value).filter(([, each]) => each !== undefined),
  ) as never;
}
