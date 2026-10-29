/**
 * Claude's tools. Read and query tools answer from the bridge's copy of the project, the proposed one
 * while Claude's proposal waits, and then say so. Each write tool call sends one command, or one
 * batch, so it is one undoable action labelled Claude in the person's history, or, while the person
 * reviews Claude's changes, one change that joins Claude's proposal (ADR 0073), which its answer says. Guidance tools mark and move the open app's view without changing anything. Descriptions
 * are how Claude learns the tools, so each one says when to use it and gives an example.
 */
import {
  MAX_CAPTION_LENGTH,
  MAX_GUIDANCE_TARGETS,
  automaticRouteStyleOf,
  definitionsIn,
  freshId,
  modelIndexOf,
  previewDelete,
  randomIds,
  routeOf,
  slug,
  type Command,
  type Guidance,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Attributes, FreeShape, Id } from '@visual-anything/schema';
import { z } from 'zod';
import {
  APPEARANCE_TOOLS,
  blendWarnings,
  colorsSet,
  definitionColorWarnings,
  elementColorWarnings,
  relationAppearance,
  relationAppearanceTraits,
  relationColorWarnings,
  strokeWarnings,
} from './appearance-tools';
import { ALIGN_TOOLS } from './align-tools';
import { ProgramUnavailableError, type Program } from './bridge';
import { cascadeOf, cascadeRefusal, takesMore } from './cascade';
import { EXPLORE_TOOLS } from './explore-tools';
import { CODE_TOOLS } from './code-tools';
import { COMMENT_TOOLS } from './comment-tools';
import { EXPORT_TOOLS } from './export-tools';
import { fullGeometry } from './geometry-brief';
import { IMAGE_TOOLS } from './image-tools';
import { PART_TOOLS } from './part-tools';
import { PROPOSAL_TOOLS, proposalNoteOf } from './proposal-tools';
import { OVERLAY_TOOLS } from './overlay-tools';
import { IMPORT_TOOLS } from './import-tools';
import { DRAWING_TOOLS } from './drawing-tools';
import {
  DELETE,
  GUIDE,
  READ,
  WRITE,
  act,
  fail,
  guideApps,
  guidedView,
  id,
  ok,
  sentences,
  tool,
  withoutUndefined,
} from './kit';
import { LIVE_TOOLS, LIVE_VALUES_BESIDE, besideAttributes, liveBeside } from './live-tools';
import { RECIPES_IN_BRIEF } from './recipes';
import { SCENARIO_TOOLS } from './scenario-tools';
import { SCOPE_TOOLS } from './scope-tools';
import { TOUR_TOOLS } from './tour-tools';
import { VIEW_STATE_TOOLS, openApp } from './view-tools';
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

const attributes = () =>
  z
    .record(z.string(), z.unknown())
    .describe(
      'Attribute values by attribute name: strings, numbers, booleans or JSON. An attribute of type destination holds { "view": id, "focus": [ids] }, { "project": "../folder", "view": id } or { "url": "https://…" }, and nothing else.',
    );
/** External identifiers by scheme, as a new element takes them (ADR 0056). */
const externalIds = () =>
  z
    .record(z.string(), z.string())
    .describe(
      'What it is in other catalogs, by scheme: a short lowercase name such as "uberon", "fma" or "wikidata", each with an identifier of up to 200 characters. Data only: nothing follows them.',
    );
/** Changes to external identifiers by scheme: a text sets one, null takes it out; null takes all. */
const externalIdChanges = () =>
  z
    .record(z.string(), z.string().nullable())
    .nullable()
    .describe(
      'External identifiers by scheme to set, such as { "uberon": "UBERON:0002135" }; null for a scheme takes it out, and null for the whole takes them all out.',
    );
const appearance = () =>
  z
    .object({
      shape: z.enum(['rectangle', 'rounded-rectangle', 'ellipse', 'cylinder', 'person']).optional(),
      fill: z.string().optional().describe('A color as #RRGGBB.'),
      stroke: z.string().optional().describe('A color as #RRGGBB.'),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    // The other traits, such as detail or image, go to the core, which checks them.
    .catchall(z.unknown())
    .describe(
      'How the shapes look: shape, fill, stroke, width, height, and the other traits update_element lists; what is left out comes from the component.',
    );
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
  description: `Lists the components (kinds of element) and relation types the project can use, each with its package, what it derives from, its attributes (inherited ones included), its appearance as it inherits it (free geometry in brief unless fullGeometry) and, for relation types, its direction, whether it nests (puts one element inside another) and its limits. Every component derives from "essence" and every relation type from "relates-to". Use it before creating elements or relations, to pick the right component and relation type ids.

Example: { "package": "systems" }`,
  input: {
    package: id().optional().describe('Only the definitions of this package.'),
    fullGeometry: fullGeometry(),
  },
  hints: READ,
  run: async (args, program) =>
    ok(listDefinitions(await program.project(), withoutUndefined(args))),
});

const findElementsTool = tool({
  name: 'find_elements',
  title: 'Find elements',
  description: `Finds elements by component, attribute, external identifier, container or name. Every filter given must hold. A component matches the elements created from it and from components deriving from it, unless exactComponent. An attribute named id:<scheme>, as id:uberon, finds the elements with an external identifier in that scheme, and that identifier when equals gives it. A container finds what sits directly inside it, or at any depth with deep; World's id finds what sits directly in World. Results come in model order, ${MAX_RESULTS} at most per call: page with offset. The attribute filter matches stored values only. ${LIVE_VALUES_BESIDE}

Example: { "component": "systems.service", "container": "clinic-booking", "deep": true }
Example: { "attribute": { "name": "owner", "equals": "Scheduling team" } }
Example: { "attribute": { "name": "id:uberon", "equals": "UBERON:0002135" } }`,
  input: {
    component: id().optional(),
    exactComponent: z.boolean().optional(),
    attribute: z
      .object({ name: z.string().min(1), equals: z.unknown().optional() })
      .optional()
      .describe(
        'Elements that hold this attribute, with this value when equals is given; id:<scheme> for an external identifier.',
      ),
    container: id().optional(),
    deep: z.boolean().optional(),
    nameContains: z.string().optional().describe('Text the name holds, whatever its case.'),
    limit: z.number().int().min(1).max(MAX_RESULTS).optional(),
    offset: z.number().int().min(0).optional(),
  },
  hints: READ,
  run: async (args, program) => {
    const { attribute, ...rest } = args;
    const found = findElements(await program.project(), {
      ...withoutUndefined(rest),
      ...(attribute === undefined
        ? {}
        : {
            attribute: {
              name: attribute.name,
              ...(attribute.equals === undefined ? {} : { equals: attribute.equals as never }),
            },
          }),
    });
    // The live values over what it found, beside the stored attributes (ADR 0057).
    const live = await liveBeside(
      program,
      found.elements.map((each) => each.id),
    );
    return ok({
      ...found,
      elements: found.elements.map((each) => besideAttributes(each, live.of.get(each.id))),
      ...(live.cut === undefined ? {} : { liveValuesCut: live.cut }),
    });
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
  description: `Reads one element or relation by id, with everything around it. For an element: its component, attributes and the definitions of the attributes it can have, its own appearance (free geometry in brief unless fullGeometry), its containers (with the nesting relation that places it in each), its contents, the relations from and to it, and the views that place it. For a relation: its type, ends, attributes, its own appearance, the relations that end on it, and the scenario steps that use it. ${LIVE_VALUES_BESIDE}

Example: { "id": "booking-agent" }`,
  input: { id: id(), fullGeometry: fullGeometry() },
  hints: READ,
  run: async (args, program) => {
    const item = describeItem(await program.project(), args.id, {
      fullGeometry: args.fullGeometry === true,
    });
    if (item === undefined) return fail(`There is no element or relation "${args.id}".`);
    // Its live values, beside its stored attributes (ADR 0057).
    const live = await liveBeside(program, [args.id]);
    return ok({
      ...besideAttributes(item, live.of.get(args.id)),
      ...(live.cut === undefined ? {} : { liveValuesCut: live.cut }),
    });
  },
});

const readViewTool = tool({
  name: 'read_view',
  title: 'Read a view',
  description: `Reads a view: its perspective, the nesting relation types that arrange it, the positions it stores (each relative to the container shape it sits in; pinned ones were set by hand), its free shapes (notes and arrows), the containers it shows collapsed, the routes chosen by hand for its relations (every other relation is routed automatically), its routeStyle when it draws its automatic routes straight or curved, and, for World and every container, the order it draws the shapes directly inside, back to front. An element without a position is placed by layout. It also says how many elements and relations the view shows out of the model's (shows), and its scope when it has one: get_scope says more.

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
  description: `Reads a scenario: the view it plays over and its steps in order, each with its number, description, the relations it activates (with their ends), its data in and out, whether it is broken because a relation it uses was deleted, and, in a scenario with decisions, the innermost alternative it is in (within); then its broken steps, each with its alternative, and how it plays over its view now, each decision playing its default, where steps inside a collapsed container play as one aggregated step.

A scenario with decisions also gives them, in reading order: each with its id, question, the alternative it plays by default (playsByDefault), the alternative it sits in when it is nested, and its alternatives, each with its id, label, the numbers of the steps it holds (none for the way where nothing happens), whether it ends the scenario and its broken steps; and waysToPlay, how many ways the scenario can play. Use these ids with update_scenario, choose_alternative and the choices of play_scenario and go_to_step. Decisions that do not hold together are said in decisionsProblem.

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
  description: `Shows what deleting elements and relations would remove, without deleting anything: the relations that would go with them because they end on something deleted, the view positions that would go, the scenario steps that would become broken, and the tour steps that would name what is deleted (brokenTourSteps), which are kept and play without it. Tell the person before a delete that cascades.

Call it before any delete, also when material you import again no longer has something the model has: an import adds, and deletes only what the person agreed to once they saw this preview.

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

${RECIPES_IN_BRIEF} For instance, a SQL table becomes a data-modeling.table with each column a data-modeling.column inside it, given nestingRelationType "data-modeling.is-column-of"; docker-compose's depends_on becomes systems.communicates-with; a C4 container becomes a systems.service, or a systems.database, inside the systems.system it belongs to.

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
          ids: externalIds().optional(),
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
          appearance: relationAppearance()
            .optional()
            .describe(
              'An appearance of its own: stroke (#RRGGBB), width, dash and route; what it leaves out comes from its relation type.',
            ),
        }),
      )
      .optional(),
    view: id()
      .optional()
      .describe(
        'The view the person is building in: in a view with a scope, the new elements show there even where its rules would leave them out.',
      ),
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
    return act(program, built.command, async (answer) => {
      // What each new shape and line is drawn in, as the project has it now.
      const state = await program.project();
      const warnings = built.colored.flatMap(({ id: made, kind, appearance: given }) =>
        kind === 'element'
          ? elementColorWarnings(state, made, colorsSet(given))
          : relationColorWarnings(state, made, colorsSet(given).stroke),
      );
      return {
        ids: Object.fromEntries(built.refs),
        created: answer.created,
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    });
  },
});

const updateElement = tool({
  name: 'update_element',
  title: 'Change an element',
  description: `Changes an element, World included, as one undoable action: its name, description, component, attribute values, attributes to remove, its external identifiers, or its own appearance (replaced whole; null makes it look like its component again). A description of null removes it.

To change some traits of its own appearance and keep the others, give appearanceTraits instead: a value sets a trait, null makes it inherited again. Colors are #RRGGBB, drawn as stored in both themes; the answer warns about a stroke under 3:1 against the light or the dark canvas, and about a shape that blends into one, and never refuses a color. To recolor every element of a component, built-in ones included, use set_appearance.

An attribute whose type is destination opens something when the person follows the mark on its shape: a view of this project, focused on some elements; a view of another project, by a path relative to this project's folder that stays inside the folder holding it, opened by that project's own program after the person agrees; or an https: web address, opened only after the person confirms. Any other scheme is refused.

Example: { "id": "appointments-db", "attributes": { "engine": "postgres", "sizeGb": 20 } }
Example: { "id": "booking-agent", "appearanceTraits": { "fill": "#F8E1EC", "stroke": null } }
Example: { "id": "mitral-valve", "ids": { "uberon": "UBERON:0002135", "fma": "FMA:7235" } }
Example: { "id": "billing-api", "attributes": { "details": { "project": "../billing", "view": "overview" } } }`,
  input: {
    id: id(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    component: id().optional(),
    attributes: attributes().optional(),
    removeAttributes: z.array(z.string()).optional(),
    ids: externalIdChanges().optional(),
    appearance: appearance().nullable().optional(),
    appearanceTraits: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Traits of its own appearance to set, or null to inherit again: shape, fill, stroke, width, height, detail, contentsAsRows, connectionPoints, image (from list_images, as { "image": id, "placement": "icon", "drawing" or "parts", "tint": "#RRGGBB" }, or "none"), geometry and part (set_appearance shows them, with examples).',
      ),
  },
  hints: WRITE,
  run: async ({ id: target, ...changes }, program) =>
    act(
      program,
      { type: 'update-element', id: target, changes: withoutUndefined(changes) as never },
      async () => {
        const warnings = elementColorWarnings(
          await program.project(),
          target,
          colorsSet(changes.appearance, changes.appearanceTraits),
        );
        return warnings.length > 0 ? { warnings } : {};
      },
    ),
});

const updateRelation = tool({
  name: 'update_relation',
  title: 'Change a relation',
  description: `Changes a relation as one undoable action: its relation type, its ends, name, description, attributes, or its own appearance (stroke, width, dash, and route: the style of its automatic routes, orthogonal, straight or curved), which is a particularity of this relation: replaced whole with appearance, where null makes it look like its relation type again, or trait by trait with appearanceTraits, where a value sets a trait and null makes it inherited again. A name or description of null removes it.

Colors are #RRGGBB, drawn as stored in both themes; a line needs 3:1 against the light and the dark canvas, and the answer warns about a stroke under it, never refusing one. To recolor every relation of a relation type, built-in ones included, use set_appearance.

Example: { "id": "patient-to-whatsapp", "name": "Books by message", "attributes": { "protocol": "HTTPS" } }
Example: { "id": "api-reads-db", "appearanceTraits": { "stroke": "#C05621", "dash": "dashed" } }
Example: { "id": "api-reads-db", "appearance": null }`,
  input: {
    id: id(),
    relationType: id().optional(),
    from: id().optional(),
    to: id().optional(),
    name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    attributes: attributes().optional(),
    removeAttributes: z.array(z.string()).optional(),
    appearance: relationAppearance().nullable().optional(),
    appearanceTraits: relationAppearanceTraits().optional(),
  },
  hints: WRITE,
  run: async ({ id: target, ...changes }, program) =>
    act(
      program,
      { type: 'update-relation', id: target, changes: withoutUndefined(changes) as never },
      async () => {
        const warnings = relationColorWarnings(
          await program.project(),
          target,
          colorsSet(changes.appearance, changes.appearanceTraits).stroke,
        );
        return warnings.length > 0 ? { warnings } : {};
      },
    ),
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
    const state = await program.project();
    const preview = previewDelete(state, targets);
    if (preview.problems.length > 0) return fail(sentences(preview.problems));
    const command: Command = { type: 'delete', ...targets };
    const cascade = cascadeOf(state, command);
    if (!args.cascade && takesMore(cascade)) {
      return fail(cascadeRefusal(cascade, 'Not deleted', 'what you named'));
    }
    return act(program, command, () => ({
      deleted: { elements: preview.elements, relations: preview.relations },
      brokenSteps: preview.brokenSteps,
    }));
  },
});

const changeContainer = tool({
  name: 'change_container',
  title: 'Put elements inside a container, or take them out',
  description: `Puts elements inside a container in a view, or takes them out to World when into is left out, as one undoable action, as the person does by dropping shapes. Each element leaves the container its shape sits in (from: left out for World), losing the nesting relation that placed it there, and gains one relation to the new container, of the same type when it can. Its shape comes to the front there. Containment is part of the model, so every view that nests by that relation type shows the change.

When a nesting relation it takes away has relations ending on it, is used by a scenario step, or has a name, a description or attributes of its own, the change is refused and says what would go, as the app asks the person first: tell the person, then call again with cascade true. A place you give with at is left for layout to change unless pinned.

Example: { "view": "system-overview", "into": "scheduling", "shapes": [{ "element": "reminder-service", "from": "clinic-booking" }] }
Example: { "view": "system-overview", "shapes": [{ "element": "reminder-service", "from": "scheduling", "at": { "x": 40, "y": 600 } }], "cascade": true }`,
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
          pinned: z
            .boolean()
            .optional()
            .describe(
              'Whether layout must keep the place at gives. Default false: layout may still move it. Set true only when the person asked for this exact place.',
            ),
        }),
      )
      .min(1),
    cascade: z
      .boolean()
      .optional()
      .describe(
        'Allow taking away nesting relations that others end on, that steps use or that hold data of their own.',
      ),
  },
  hints: WRITE,
  run: async (args, program) => {
    const command: Command = {
      type: 'change-container',
      view: args.view,
      ...(args.into === undefined ? {} : { to: args.into }),
      ...(args.relationType === undefined ? {} : { relationType: args.relationType }),
      shapes: args.shapes.map((shape) => ({ pinned: false, ...withoutUndefined(shape) })),
    };
    const cascade = cascadeOf(await program.project(), command);
    if (!args.cascade && takesMore(cascade)) {
      return fail(cascadeRefusal(cascade, 'Not moved', 'the nesting relations it takes away'));
    }
    return act(program, command);
  },
});

// ——— Components, relation types and packages ———

const createPackage = tool({
  name: 'create_package',
  title: 'Create a package',
  description: `Creates an empty package of the project's own, which the project then uses, as one undoable action. Components and relation types are defined in a package; their ids start with its id and a dot.

A package can say which version it is (a semantic version, such as "1.0.0"), the license it is shared under (an SPDX identifier, such as "CC-BY-4.0") and whom to credit (attribution); exports carry the attribution.

Example: { "id": "clinic", "name": "Clinic", "description": "What a clinic needs beyond Systems.", "version": "1.0.0", "license": "CC0-1.0" }`,
  input: {
    id: id(),
    name: z.string().min(1),
    description: z.string().optional(),
    version: z.string().optional(),
    license: z.string().optional(),
    attribution: z.string().optional(),
  },
  hints: WRITE,
  run: async (args, program) =>
    act(program, { type: 'create-package', package: withoutUndefined(args) }),
});

const defineComponent = tool({
  name: 'define_component',
  title: 'Define a component',
  description: `Defines a component in one of the project's own packages, as one undoable action, written as the package file's JSON writes it. It derives from exactly one component and inherits everything it does not redefine. Leave the id out to have the program make one from the name. To create, pass createOnly: then an id the package already has is refused rather than redefined. To change some traits of a component, use update_component instead. Read list_definitions first. Colors are #RRGGBB: the answer warns about a stroke under 3:1 against either canvas and a shape that blends into one, as set_appearance does, and never refuses one.

Example: { "package": "clinic", "createOnly": true, "component": { "name": "Calendar", "derivesFrom": "systems.database", "attributes": [{ "name": "slotMinutes", "type": "number", "default": 15 }], "appearance": { "fill": "#E3F2E9" } } }`,
  input: {
    package: id(),
    createOnly: z.boolean().optional(),
    component: z
      .object({ id: id().optional(), name: z.string().min(1), derivesFrom: id() })
      .catchall(z.unknown())
      .describe(
        'name, derivesFrom, and optionally id, description, ids (external identifiers by scheme), attributes and appearance. An attribute may be of type "destination".',
      ),
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
      // Colors hard to see are pointed out, as set_appearance points them out.
      async (answer) =>
        withColorWarnings(
          { created: answer.created },
          definitionColorWarnings(
            await program.project(),
            'component',
            answer.created[0] ?? args.component.id ?? '',
            colorsSet(args.component.appearance),
          ),
        ),
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
        'name, derivesFrom, and optionally id, description, ids (external identifiers by scheme), direction, nests, attributes, appearance and limits.',
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
      async (answer) =>
        withColorWarnings(
          { created: answer.created },
          definitionColorWarnings(
            await program.project(),
            'relation-type',
            answer.created[0] ?? args.relationType.id ?? '',
            colorsSet(args.relationType.appearance),
          ),
        ),
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
  description: `Changes a component of one of the project's own packages, trait by trait, as one undoable action; what you leave out stays. In appearance, a value sets a trait and null makes it inherited again. A built-in component cannot change; to change its look in this project, and the look of everything derived from it that does not set the trait itself, use set_appearance, which keeps it in the project file. The answer warns about colors hard to see, as set_appearance does.

Example: { "id": "clinic.calendar", "name": "Calendar", "appearance": { "fill": "#E3F2E9", "stroke": null }, "attributes": { "rename": [{ "from": "slotMinutes", "to": "slotLength" }] } }`,
  input: {
    id: id(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    derivesFrom: id().optional(),
    appearance: z.record(z.string(), z.unknown()).optional(),
    attributes: attributeChanges().optional(),
    ids: externalIdChanges().optional(),
  },
  hints: WRITE,
  run: async ({ id: target, ...changes }, program) =>
    act(
      program,
      { type: 'update-component', id: target, changes: withoutUndefined(changes) as never },
      async () =>
        withColorWarnings(
          {},
          definitionColorWarnings(
            await program.project(),
            'component',
            target,
            colorsSet(changes.appearance),
          ),
        ),
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
    ids: externalIdChanges().optional(),
  },
  hints: WRITE,
  run: async ({ id: target, ...changes }, program) =>
    act(
      program,
      { type: 'update-relation-type', id: target, changes: withoutUndefined(changes) as never },
      async () =>
        withColorWarnings(
          {},
          definitionColorWarnings(
            await program.project(),
            'relation-type',
            target,
            colorsSet(changes.appearance),
          ),
        ),
    ),
});

const updatePackage = tool({
  name: 'update_package',
  title: 'Rename a package',
  description: `Changes the name, description, version, license or attribution of one of the project's own packages, as one undoable action; null takes the description, version, license or attribution out. Its id stays. A version is a semantic version, such as "1.2.0", and a license an SPDX identifier, such as "MIT".

Example: { "id": "clinic", "name": "Clinic", "description": "What a clinic needs beyond Systems." }`,
  input: {
    id: id(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    version: z.string().nullable().optional(),
    license: z.string().nullable().optional(),
    attribution: z.string().nullable().optional(),
  },
  hints: WRITE,
  run: async ({ id: target, ...changes }, program) =>
    act(program, { type: 'update-package', id: target, changes: withoutUndefined(changes) }),
});

const reorderElements = tool({
  name: 'reorder_elements',
  title: 'Reorder elements',
  description: `Moves elements in the model's order, as one undoable action: the ones listed, in the order listed, before another element, or last. It is the order of a table's rows, and the order shapes that no stacking order names are drawn in. World cannot move.

Example: { "elements": ["patients-id"], "before": "patients-name" }`,
  input: { elements: z.array(id()).min(1), before: id().optional() },
  hints: WRITE,
  run: async (args, program) =>
    act(program, { type: 'reorder-elements', ...withoutUndefined(args) }),
});

// ——— Views ———

const createView = tool({
  name: 'create_view',
  title: 'Create a view',
  description: `Creates a view, as one undoable action. A view shows the model from exactly one perspective, such as "Data flow", "Ownership" or "Security", and is arranged by the nesting relation types it lists; without them, every relation type that nests arranges it. A new view has no positions: layout places every shape until you set some.

A new view shows the whole model, so what an import adds shows in the views without a scope; set_scope gives a view a scope, the part of the model it shows. After an import, create a view when the material brings a perspective none of them has, such as a draw.io page, a Structurizr deployment or a SQL schema's tables, arranged by the nesting relation types that material uses.

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
  description: `Changes a view's name, description, perspective, nesting relation types or route style, as one undoable action. A description of null removes it.

routeStyle draws the view's automatic routes straight or curved, after every layout and move; null draws them orthogonal again. It is for the relations whose appearances set no route (set_appearance's route comes first); a route chosen by hand keeps a style it stores.

Example: { "id": "system-overview", "perspective": { "name": "Data flow" }, "nestingRelationTypes": ["systems.is-part-of"] }
Example, a view drawn curved: { "id": "signal-flow", "routeStyle": "curved" }`,
  input: {
    id: id(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    perspective: z
      .object({ name: z.string().min(1), description: z.string().optional() })
      .optional(),
    nestingRelationTypes: z.array(id()).optional(),
    routeStyle: z
      .enum(['straight', 'curved'])
      .nullable()
      .optional()
      .describe('Its automatic routes straight or curved; null for orthogonal.'),
  },
  hints: WRITE,
  run: async ({ id: target, ...changes }, program) =>
    act(
      program,
      { type: 'update-view', id: target, changes: withoutUndefined(changes) },
      async () => {
        if (changes.routeStyle === undefined) return {};
        const view = (await program.project()).views.find((each) => each.id === target);
        return {
          automaticRoutes: view?.routeStyle ?? 'orthogonal',
          note: 'This draws the automatic routes of the relations whose appearances set no route; a relation type or relation that sets one keeps it, and so does a route chosen by hand with a style of its own.',
        };
      },
    ),
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
  run: async (args, program) => act(program, { type: 'set-collapsed', ...args }),
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
      z.object({
        kind: z.literal('inside'),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      }),
    ])
    .nullable()
    .optional();

const setRoute = tool({
  name: 'set_route',
  title: 'Route a relation by hand',
  description: `Routes a relation by hand in a view, as the person does by dragging its ends and bend points, as one undoable action; only what you give changes, and the rest stays as it is. from and to say where the line attaches to each end: { "kind": "connection-point", "name": "out" } for one of the end's connection points (list_definitions gives a component's), { "kind": "border", "side": "left", "at": 0.25 } for a place on its border, at going from 0 at the side's top or left end to 1 at its bottom or right end, or { "kind": "inside", "x": 0.3, "y": 0.6 } for a place anywhere inside the shape, x and y going from 0 at its left or top to 1 at its right or bottom; null attaches it automatically again. An end that is a relation attaches to the middle of that relation's line and takes neither; a row, or a table that draws rows, takes only its left or right side. bendPoints are the points the line passes through, in order from its from end, in canvas units relative to the shape of the nearest container that holds both ends (or to the canvas when that is World), as read_view gives positions; the answer says which container; null removes them. style is orthogonal, straight or curved. Left out, the route takes the automatic style: its relation's appearance's route, else the view's routeStyle, else orthogonal; a style equal to it is not stored, and the answer says what it is and where it comes from. A relation the view draws as containment has no route.

Example: { "view": "system-overview", "relation": "booking-agent-calls-api-k3f9q2", "from": { "kind": "connection-point", "name": "out" }, "to": { "kind": "border", "side": "top", "at": 0.5 } }
Example: { "view": "system-overview", "relation": "api-reads-db-p0x7aa", "bendPoints": [{ "x": 320, "y": 96 }, { "x": 320, "y": 220 }], "style": "curved" }
Example, orthogonal in a view drawn curved: { "view": "signal-flow", "relation": "api-reads-db-p0x7aa", "style": "orthogonal" }`,
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
    const automatic = automaticStyleOf(state, view, relation);
    return ok({
      ...(outcome.value as Record<string, unknown>),
      route: route ?? 'automatic',
      bendPointsRelativeTo: container === undefined ? 'the canvas' : { container, name },
      ...(automatic === undefined ? {} : { automaticStyle: automatic }),
      ...(automatic !== undefined && changes.style === automatic.style
        ? {
            note: `The style "${changes.style}" is the automatic style of this relation here, so it is not stored: the route follows the automatic style when that changes.`,
          }
        : {}),
    });
  },
});

/**
 * The style of a relation's automatic route in a view (ADR 0069), and what gives it: the relation's
 * own appearance, its relation type's chain, project appearances included, the view, or nothing.
 */
function automaticStyleOf(
  state: ProjectSnapshot,
  viewId: Id,
  relationId: Id,
): { style: string; from: string } | undefined {
  const view = state.views.find((each) => each.id === viewId);
  const relation = modelIndexOf(state).relation(relationId);
  if (view === undefined || relation === undefined) return undefined;
  const style = automaticRouteStyleOf(state, view, relation);
  const type = definitionsIn(state).relationType(relation.relationType);
  const from =
    relation.appearance?.route !== undefined
      ? 'the relation’s own appearance'
      : type?.appearance.route !== undefined
        ? `the relation type "${type.name}"`
        : view.routeStyle !== undefined
          ? `the view "${view.name}"`
          : 'nothing sets one, so it is orthogonal';
  return { style, from };
}

const resetRoute = tool({
  name: 'reset_route',
  title: 'Route relations automatically again',
  description: `Routes relations automatically again in a view, as one undoable action: their ends attach where layout puts them, with no bend points, in their automatic style (set_route's answer says which). Relations the view does not route by hand are left as they are.

Example: { "view": "system-overview", "relations": ["booking-agent-calls-api-k3f9q2"] }`,
  input: { view: id(), relations: z.array(id()).min(1) },
  hints: WRITE,
  run: async (args, program) => act(program, { type: 'reset-route', ...args }),
});

const point = () => z.object({ x: z.number(), y: z.number() });
const noteFill = () =>
  z.string().describe('A color as #RRGGBB; without one, the note takes the theme’s colors.');
const freeStroke = () =>
  z.string().describe('A color as #RRGGBB; without one, it takes the theme’s color.');

// What else a free shape holds goes to the core, which refuses it and says why, as an arrow's fill.
const freeShape = () =>
  z.discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('note'),
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
        text: z.string(),
        fill: noteFill().optional(),
        stroke: freeStroke().optional(),
      })
      .catchall(z.unknown()),
    z
      .object({
        kind: z.literal('arrow'),
        from: point(),
        to: point(),
        stroke: freeStroke().optional(),
      })
      .catchall(z.unknown()),
  ]);

/** An answer with the warnings about colors hard to see, when there are any. */
function withColorWarnings<T extends Record<string, unknown>>(
  answer: T,
  warnings: readonly string[],
): T & { warnings?: readonly string[] } {
  return warnings.length > 0 ? { ...answer, warnings } : answer;
}

/** What to say about the colors a note or an arrow is given: a stroke, or a note, hard to see. */
function freeShapeColorWarnings(
  shape: { kind: string; fill?: unknown; stroke?: unknown },
  viewName: string,
  set: { fill?: string; stroke?: string },
): string[] {
  const subject = shape.kind === 'note' ? `a note in "${viewName}"` : `an arrow in "${viewName}"`;
  const { fill, stroke } = colorsSet(shape);
  // A note without a color of its own there takes the theme's, which reads on its canvas.
  const blends =
    shape.kind === 'note' &&
    (set.fill !== undefined || set.stroke !== undefined) &&
    fill !== undefined &&
    stroke !== undefined
      ? blendWarnings(subject, () => ({ fill, stroke }))
      : [];
  return [...strokeWarnings(subject, set.stroke), ...blends];
}

const addFreeShape = tool({
  name: 'add_free_shape',
  title: 'Add a note or an arrow',
  description: `Adds a free shape to a view, as one undoable action: a note holding text, or an arrow pointing from one place on the canvas to another. Free shapes are drawing only; they are not part of the model.

A note can have a fill and a stroke, and an arrow a stroke, as #RRGGBB, drawn as stored in both themes; without them they take the theme's colors, and an arrow has no fill. The answer warns about a stroke under 3:1 against the light or the dark canvas, and never refuses a color.

Example: { "view": "system-overview", "shape": { "kind": "note", "x": 40, "y": 560, "width": 240, "height": 80, "text": "Reminders go out the day before." } }
Example: { "view": "system-overview", "shape": { "kind": "arrow", "from": { "x": 300, "y": 600 }, "to": { "x": 420, "y": 480 }, "stroke": "#C53030" } }`,
  input: { view: id(), shape: freeShape() },
  hints: WRITE,
  run: async (args, program) => {
    const viewName = (await program.project()).views.find((each) => each.id === args.view)?.name;
    return act(
      program,
      { type: 'create-free-shape', view: args.view, shape: args.shape },
      (answer) => {
        const warnings = freeShapeColorWarnings(
          args.shape,
          viewName ?? args.view,
          colorsSet(args.shape),
        );
        return { shape: answer.created[0], ...(warnings.length > 0 ? { warnings } : {}) };
      },
    );
  },
});

const updateFreeShape = tool({
  name: 'update_free_shape',
  title: 'Change a note or an arrow',
  description: `Changes a free shape of a view, as one undoable action; read_view gives its id. Give its id and what changes: what you leave out stays as it is, its colors included. fill (for a note) and stroke take a color as #RRGGBB, and null to take the shape's own color out, so that it takes the theme's again. Giving another kind replaces the shape whole: then give all of it.

Example: { "view": "system-overview", "shape": { "id": "note-k3f9q2", "text": "Reminders go out at 9:00." } }
Example: { "view": "system-overview", "shape": { "id": "note-k3f9q2", "fill": "#FEF3C7", "stroke": null } }`,
  input: {
    view: id(),
    shape: z.object({
      id: id(),
      kind: z.enum(['note', 'arrow']).optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      text: z.string().optional(),
      from: point().optional(),
      to: point().optional(),
      fill: noteFill().nullable().optional(),
      stroke: freeStroke().nullable().optional(),
    }),
  },
  hints: WRITE,
  run: async (args, program) => {
    const view = (await program.project()).views.find((each) => each.id === args.view);
    if (view === undefined) return fail(`There is no view "${args.view}".`);
    const stored = view.freeShapes.find((each) => each.id === args.shape.id);
    if (stored === undefined) {
      return fail(
        `The view "${view.name}" has no free shape "${args.shape.id}". read_view lists them.`,
      );
    }
    const { fill, stroke, kind, ...given } = args.shape;
    // The same kind keeps what is not given, its colors included; another kind is the shape given.
    const kept: Record<string, unknown> =
      kind === undefined || kind === stored.kind
        ? { ...stored, ...withoutUndefined(given) }
        : { ...withoutUndefined(given), kind };
    for (const [trait, value] of [
      ['fill', fill],
      ['stroke', stroke],
    ] as const) {
      if (value === null) delete kept[trait];
      else if (value !== undefined) kept[trait] = value;
    }
    const shape = kept as unknown as FreeShape;
    return act(program, { type: 'update-free-shape', view: args.view, shape }, () => {
      const warnings = freeShapeColorWarnings(
        shape,
        view.name,
        colorsSet({ fill: fill ?? undefined, stroke: stroke ?? undefined }),
      );
      return warnings.length > 0 ? { warnings } : {};
    });
  },
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

To use a built-in package, such as data-modeling before importing SQL tables, give every package the project uses already, then the new one.

Example: { "name": "Clinic systems" }
Example: { "packages": ["systems", "data-modeling"] }`,
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
  description: `Runs several of Visual Anything's commands as one undoable action, for changes no other tool makes at once. Each command is an object with a type, as the program's core takes it, such as "create-element", "update-element", "delete", "create-relation", "update-relation", "create-package", "define-component", "remove-component", "define-relation-type", "remove-relation-type", "create-view", "update-view", "delete-view", "set-positions", "remove-positions", "create-free-shape", "update-free-shape", "delete-free-shapes", "update-project", "restack", "change-container", "set-route", "reset-route", "set-component-appearance" and "set-relation-type-appearance". Either all of them are done, or none is and the answer says which one was refused and why. Prefer the other tools when one fits.

A delete, or a change-container, that would take more than it names (relations ending on what it deletes, or on the nesting relations it takes away; a nesting relation with data of its own) or break a scenario step is refused, as delete_from_model and change_container refuse it, each previewed over the project as the commands before it leave it: tell the person what would go, then call again with cascade true.

When you import material again, change the elements and relations already there with one run_commands call, one update-element or update-relation each, so that the whole update is one action; and define what an import needs (create-package, then define-component and define-relation-type) as one action, once the person agrees.

With propose true, the commands wait in your proposal for the person's review instead of applying, as every change does while the person reviews your changes: the answer says so, and the person accepts them, change by change, or refuses them in the app.

Example: { "label": "Move the reminders into Scheduling", "commands": [{ "type": "update-element", "id": "reminder-service", "changes": { "name": "Reminders" } }, { "type": "set-positions", "view": "system-overview", "positions": [{ "element": "reminder-service", "container": "scheduling", "x": 40, "y": 260 }] }] }

Example, proposed for review: { "label": "Split the API", "propose": true, "commands": [{ "type": "create-element", "element": { "component": "systems.service", "name": "Orders API" } }, { "type": "update-element", "id": "api", "changes": { "name": "Accounts API" } }] }`,
  input: {
    label: z.string().min(1).max(200),
    commands: z.array(z.object({ type: z.string().min(1) }).catchall(z.unknown())).min(1),
    cascade: z
      .boolean()
      .optional()
      .describe(
        'Allow the deletes and changes of container to take more than they name, and to break scenario steps.',
      ),
    propose: z
      .boolean()
      .optional()
      .describe(
        'Propose the commands rather than apply them: they wait in your proposal until the person accepts or refuses them in the app, even when the person does not review your changes. Use it for a large or uncertain change the person should see first. Nothing you send makes a change apply while the person reviews your changes.',
      ),
  },
  hints: WRITE,
  run: async (args, program) => {
    const command: Command = {
      type: 'batch',
      label: args.label,
      commands: args.commands as never,
    };
    const cascade = cascadeOf(await program.project(), command);
    if (!args.cascade && takesMore(cascade)) {
      return fail(cascadeRefusal(cascade, 'Nothing was done', 'what the commands delete'));
    }
    return act(program, command, undefined, [], args.propose === true ? { propose: true } : {});
  },
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

const layOutView = tool({
  name: 'lay_out_view',
  title: 'Lay out the open view',
  description: `Asks the app the person has open to lay out the view, as its toolbar's Layout does: every shape that is not pinned, or, with containers, every shape inside each of them that is not pinned, at any depth; pinned shapes never move. The layout runs in the app, which records its result as it records any layout: one undoable action per layout, named "Lay out …", in the person's history; read_view shows the positions once it is done. With no app open, nothing is laid out: open_app opens one. Leave positions out of what you create when layout should place it, and use this once the view's shapes are all there.

Example: { "view": "system-overview" }
Example: { "view": "system-overview", "containers": ["scheduling"] }`,
  input: {
    view: guidedView(),
    containers: z
      .array(id())
      .min(1)
      .max(MAX_GUIDANCE_TARGETS)
      .optional()
      .describe(
        'Containers whose contents to lay out, each in its own action; left out, the whole view.',
      ),
  },
  hints: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async (args, program) => {
    const state = await program.project();
    if (args.view !== undefined && !state.views.some((view) => view.id === args.view)) {
      return fail(`There is no view "${args.view}".`);
    }
    const index = modelIndexOf(state);
    const empty = (args.containers ?? []).filter(
      (container) =>
        index.element(container) === undefined || index.contentsOf(container).length === 0,
    );
    if (empty.length > 0) {
      return fail(
        `These hold nothing to lay out: ${empty.join(', ')}. Name containers, as find_elements finds them, or leave containers out to lay out the whole view.`,
      );
    }
    const guidance: Guidance = { kind: 'layout', ...withoutUndefined(args) };
    const apps = await program.guide(guidance);
    return apps === 0
      ? ok({
          apps: 0,
          note: 'No app has the project open, so nothing was laid out: layout runs in the app. Call open_app to open it, or ask the person to, then call lay_out_view again.',
        })
      : ok({
          apps,
          note: `The layout runs in ${apps === 1 ? 'the open app' : `each of the ${apps} open apps`}, which records it as the person's action "Lay out …" once it is done; read_view shows where the shapes went.`,
        });
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
  // How a component or a relation type looks, built-in ones included (ADR-0034).
  ...APPEARANCE_TOOLS,
  updatePackage,
  reorderElements,
  createView,
  updateView,
  deleteView,
  setPositions,
  forgetPositions,
  // Aligning, distributing and sizing alike, as the canvas's Align does (ADR 0074).
  ...ALIGN_TOOLS,
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
  layOutView,
  openApp,
  ...SCENARIO_TOOLS,
  // Tours (ADR 0058).
  ...TOUR_TOOLS,
  ...IMAGE_TOOLS,
  // Named parts of SVG images (ADR 0067).
  ...PART_TOOLS,
  ...CODE_TOOLS,
  // Threads of comments (ADR 0059).
  ...COMMENT_TOOLS,
  ...EXPLORE_TOOLS,
  ...VIEW_STATE_TOOLS,
  ...IMPORT_TOOLS,
  // HTML imported as a drawing (ADR 0068).
  ...DRAWING_TOOLS,
  // What a view shows of the model (ADR-0040).
  ...SCOPE_TOOLS,
  ...EXPORT_TOOLS,
  ...OVERLAY_TOOLS,
  // Live values, never saved (ADR 0057).
  ...LIVE_TOOLS,
  // Claude's proposal, which the person reviews (ADR 0073).
  ...PROPOSAL_TOOLS,
];

/** Runs a tool, turning a program that cannot be reached into an outcome Claude reads. */
export async function runTool(
  definition: Tool,
  args: unknown,
  program: Program,
): Promise<ToolOutcome> {
  try {
    const outcome = await definition.run(args as never, program);
    // While Claude's proposal waits, what a read tool answers includes it (ADR 0073), and says so.
    if (
      outcome.ok &&
      definition.hints.readOnlyHint &&
      !OWN_PROPOSAL_NOTE.has(definition.name) &&
      isRecord(outcome.value)
    ) {
      const note = await proposalNoteOf(program);
      if (note !== undefined) return ok({ ...outcome.value, proposed: note });
    }
    return outcome;
  } catch (error) {
    if (error instanceof ProgramUnavailableError) return fail(error.message);
    return fail(`The tool failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The read tools that say themselves what the proposal holds. */
const OWN_PROPOSAL_NOTE: ReadonlySet<string> = new Set(['read_proposal']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ——— Helpers ———

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
  return guideApps(program, guidance);
}

/** A new element or relation that `add_to_model` gives an appearance, to say what its colors read as. */
interface Colored {
  id: Id;
  kind: 'element' | 'relation';
  appearance: unknown;
}

/** The additions of `add_to_model` as one command, with the id made for each ref. */
function buildAdditions(
  state: ProjectSnapshot,
  args: z.infer<z.ZodObject<(typeof addToModel)['input']>>,
):
  | { ok: true; command: Command; refs: Map<string, Id>; colored: Colored[] }
  | { ok: false; message: string } {
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
        ids: element.ids,
        attributes: element.attributes as Attributes | undefined,
        appearance: element.appearance,
      }),
      ...(containers.length === 0 ? {} : { containers }),
      ...(args.view === undefined ? {} : { inView: args.view }),
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
        appearance: relation.appearance as never,
      }),
    });
  }
  const colored: Colored[] = [
    ...elements.flatMap((each) =>
      each.appearance === undefined
        ? []
        : [{ id: idOf.get(each) as Id, kind: 'element' as const, appearance: each.appearance }],
    ),
    ...relations.flatMap((each) =>
      each.appearance === undefined
        ? []
        : [{ id: idOf.get(each) as Id, kind: 'relation' as const, appearance: each.appearance }],
    ),
  ];
  const only = commands[0];
  const command: Command =
    commands.length === 1 && only !== undefined && args.label === undefined
      ? only
      : {
          type: 'batch',
          label: args.label ?? additionsLabel(elements.length, relations.length),
          commands,
        };
  return { ok: true, command, refs, colored };
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
