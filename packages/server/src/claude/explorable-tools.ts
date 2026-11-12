/**
 * Claude's explorable tools (ADR 0107). An explorable is a page of HTML, CSS and JavaScript that a
 * package defines and that runs walled off in a frame of its own, once the person approves it. Claude
 * writes one through `write_explorable`, never its file directly: it defines the explorable when new
 * and writes its text, as one undoable action, and the program continues the person's approval when
 * Claude writes over an approved text. Claude asks the person for a script library from the npm
 * registry with `request_script_library`, sees an explorable's still and console errors with
 * `capture_explorable`, reads explorables with `list_explorables` and `read_explorable`, and places
 * one loose on a view with `add_explorable_shape`. Claude never approves one: only the person does,
 * in the app, and the tools say whether one runs.
 */
import {
  MAX_EXPLORABLE_BYTES,
  MAX_FRAME_ERROR,
  STILL_BUCKETS,
  builtinPackage,
  explorableTextOf,
  explorablesIn,
  utf8Length,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { z } from 'zod';
import type { Program } from './bridge';
import { describeExplorable } from './explorable-reads';
import { READ, WRITE, act, fail, id, ok, tool, withoutUndefined } from './kit';
import type { ExplorableCaptureAsk, ExplorableCaptureReport } from './messages';
import type { Tool, ToolOutcome } from './tools';

/**
 * How to write an explorable, as Claude reads it in `write_explorable`'s description: what one is and
 * when to write one, the `va` API version 1, the theme's variables, one self-contained file, no
 * network and no `eval`, script libraries, Math inside, and approval.
 */
export const EXPLORABLE_GUIDE = `An explorable is a page of HTML, CSS and JavaScript that explains something by letting the person play with it: a function's graph whose coefficients move, an algorithm stepping through its data, a distribution that reshapes as a parameter changes. Write one when moving something teaches more than a picture or a formula; a description with Math, a face or an image says the rest.

How to write one:
- One self-contained HTML file, at most 512 KiB: its CSS in <style> and its JavaScript in <script> inside it, pictures as data: addresses, fonts only as data: addresses. Nothing loads from the network or from other files: no <script src>, no <link>, no fetch, no workers, no frames. style="…" attributes and on…="…" handlers never apply: set styles in <style> or through element.style, and listen with addEventListener.
- No eval and no new Function: what compiles strings into code fails, such as function-plot given formulas as strings, JSXGraph's string terms and d3.csvParse. Pass functions instead, and parse CSV with d3.csvParseRows. A library that injects a <style> element of its own has its styles blocked.
- The va API, version 1 (write_explorable declares api 1):
  - va.data: { api: 1, element?, contents?, relations?, omitted?, parameters, theme, language, size, step? }. element is the element that shows it, or the one a loose shape is bound to: { id, name, component, description?, attributes: [{ name, value, source?, kind?, unit?, description?, choices? }] }, source being computed, live or simulated; contents are the elements it contains, one level down; relations are { id, type, direction: "out" | "in", other }, with the element at the other end; at most 500 elements in all, omitted counting the rest. parameters holds each parameter you declared, a tour step's value or else its default; theme is "light" or "dark"; language "en" or "es"; size { width, height } in pixels; step the scenario or tour step under way.
  - va.on('change', data => …) gives the whole data again whenever any of it changes, at most once a frame, and gives the first data too: draw there, and from va.data when it is set already as your script runs.
  - va.ready() once it has drawn, so that its still is taken then; va.select(id) selects on the canvas one of the elements it received, and changes no model; va.onStill(() => …) lets a WebGL page draw again just before its still is taken.
- Colors: the theme's colors are CSS variables, --va-text, --va-text-muted, --va-canvas, --va-surface, --va-border, --va-accent, --va-accent-soft, --va-highlight, --va-problem and --va-warning, so that a page that uses them changes theme by itself; give each a fallback, as var(--va-text, #1f2328). Fit the page to va.data.size, or to 100% of its frame.
- Parameters: declare what a tour step may set, each with a name (as va.data.parameters names it), a kind (number, integer, boolean or choice), a range or choices, and a default. A tour step sets them with explorable: { id, parameters }.
- Script libraries: only from the npm registry, at an exact version, as one file that sets a global, a UMD or IIFE build, such as D3, Plotly, function-plot, JSXGraph, Chart.js, KaTeX and mathjs ship. Ask the person for one with request_script_library before you name it in scriptLibraries; ES-module-only packages, such as three.js, are refused for now. Plain JavaScript drawing SVG or a canvas needs none and runs at once, with nothing to download: prefer it for a curve, a few shapes or a small table.
- Math inside an explorable: ask for KaTeX as a script library (npm "katex", path "dist/katex.min.js", global katex) and render with katex.render(tex, element, { output: 'mathml', throwOnError: false }), whose MathML the browser lays out with no style sheet; outside explorables, write Math as TeX in descriptions, notes and tours.
- Approval is the person's: every explorable asks them before it runs, in the app, showing its code; you never approve one. A new explorable asks the first time; your later writes to an approved one run without asking again; a change from their editor or from git asks again. Until then it shows as a card, "Not approved yet". write_explorable, read_explorable and get_item say whether it is approved.
- Check it with capture_explorable once the person approved it: its still, its console errors and whether it said va.ready().`;

/** Where an explorable shows, as the tools say it. */
const SHOWN_HOW = `Show it with set_appearance, appearanceTraits { "explorable": { "explorable": "<id>" } }, on a component, so that each of its elements shows it live in the explorable panel with its own data, or on one element; "none" stops one an element inherits. add_explorable_shape places it loose on a view's canvas; a tour step shows it with explorable: { "id": "<id>", "parameters": { … } }.`;

const parameterName = () =>
  z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/)
    .describe('Its name, as va.data.parameters names it: letters, digits and _.');
const parameterLabel = () =>
  z.string().min(1).max(200).optional().describe('What the form says of it.');

const parameter = () =>
  z.discriminatedUnion('kind', [
    z.object({
      name: parameterName(),
      kind: z.literal('number'),
      label: parameterLabel(),
      min: z.number(),
      max: z.number(),
      default: z.number(),
    }),
    z.object({
      name: parameterName(),
      kind: z.literal('integer'),
      label: parameterLabel(),
      min: z.number().int(),
      max: z.number().int(),
      default: z.number().int(),
    }),
    z.object({
      name: parameterName(),
      kind: z.literal('boolean'),
      label: parameterLabel(),
      default: z.boolean(),
    }),
    z.object({
      name: parameterName(),
      kind: z.literal('choice'),
      label: parameterLabel(),
      choices: z.array(z.string().min(1).max(200)).min(1).max(50),
      default: z.string(),
    }),
  ]);

/** A parameter's value, as a tour step or a still sets it. */
export const parameterValues = () =>
  z
    .record(z.string(), z.union([z.number(), z.boolean(), z.string().max(200)]))
    .describe(
      'Values by parameter name: a number within its range, a boolean, or one of its choices. One left out takes its default.',
    );

const explorableId = () =>
  id().describe(
    'The explorable, by id: list_explorables lists them, and get_item names an element’s.',
  );

// ——— Read ———

const listExplorables = tool({
  name: 'list_explorables',
  title: 'List the explorables',
  description: `Lists the explorables of the packages the project uses (ADR 0107), each with its id, name, description, package, file (explorables/<file>, which the person may edit in their own editor), its script libraries, its parameters with their kinds, ranges or choices and defaults, how large its text is, what shows it (components, elements and explorable shapes), the tour steps that show it with the values they set, and approved: whether it runs as the project holds it now. Then the script libraries the packages keep, each with its id, npm package, version, global, license and size, for write_explorable's scriptLibraries. read_explorable gives one explorable's text.

Example: {}
Example: { "package": "math" }`,
  input: { package: id().optional().describe('Only the explorables of this package.') },
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    const catalog = explorablesIn(state);
    const approved = await approvedOf(program);
    const explorables = [...catalog.explorables.values()]
      .filter((each) => args.package === undefined || each.package === args.package)
      .map((each) => ({
        ...describeExplorable(state, each.definition.id),
        ...approvalOf(approved, each.definition.id),
      }));
    const scriptLibraries = [...catalog.scriptLibraries.values()]
      .filter((each) => args.package === undefined || each.package === args.package)
      .map(({ definition, package: owner }) =>
        withoutUndefined({
          id: definition.id,
          package: owner,
          npm: definition.npm,
          version: definition.version,
          path: definition.path,
          global: definition.global,
          license: definition.license,
          bytes: definition.bytes,
          usedBy: [...catalog.explorables.values()]
            .filter((each) => each.definition.scriptLibraries?.includes(definition.id))
            .map((each) => each.definition.id),
        }),
      );
    return ok({
      explorables,
      scriptLibraries,
      ...(explorables.length === 0
        ? {
            note: 'No package in use defines an explorable yet: write_explorable writes one in a package of the project’s own.',
          }
        : {}),
    });
  },
});

const readExplorable = tool({
  name: 'read_explorable',
  title: 'Read an explorable',
  description: `Reads one explorable (ADR 0107): what list_explorables says of it, and its text whole, as the project holds it now, which may be the person's own edit from their editor. Read it before you change it with write_explorable, which replaces the whole text.

Example: { "id": "math.quadratic" }`,
  input: { id: explorableId() },
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    const described = describeExplorable(state, args.id);
    if (described === undefined) return fail(noExplorable(args.id));
    const held = explorableTextOf(state, args.id);
    return ok({
      ...described,
      ...approvalOf(await approvedOf(program), args.id),
      ...(held === undefined ? {} : { content: held.text }),
    });
  },
});

// ——— Write ———

const writeExplorable = tool({
  name: 'write_explorable',
  title: 'Write an explorable',
  description: `Writes an explorable, as one undoable action of yours: a new one is defined in one of the project's own packages with its name, description, file, parameters and script libraries, and its text written; for one that exists, what you give replaces what it has: the text whole, and its name, description, parameters or script libraries. Its file is explorables/<file>; never write that file with your own file tools, which the program takes for a change from outside that the person must approve again. The answer says whether it runs: approved, or that the person must approve it in the app before it runs, which you cannot do.

${EXPLORABLE_GUIDE}

${SHOWN_HOW}

Example, a new one in plain JavaScript: { "package": "math", "name": "Sine wave", "description": "$y = A \\\\sin(\\\\omega x)$ as its amplitude and frequency change.", "parameters": [{ "name": "A", "kind": "number", "label": "Amplitude", "min": 0, "max": 2, "default": 1 }, { "name": "w", "kind": "number", "label": "Frequency", "min": 0.5, "max": 4, "default": 1 }], "text": "<!doctype html><html><head><meta charset=\\"utf-8\\"><style>html,body{margin:0;height:100%;background:var(--va-surface,#fff);color:var(--va-text,#1f2328)}svg{width:100%;height:100%}path{fill:none;stroke:var(--va-accent,#2f6fde);stroke-width:2}</style></head><body><svg viewBox=\\"0 -1.2 6.3 2.4\\" preserveAspectRatio=\\"none\\"><path id=\\"wave\\" vector-effect=\\"non-scaling-stroke\\"/></svg><script>function draw(data){const p=data.parameters;let d='';for(let i=0;i<=200;i++){const x=i*6.3/200;d+=(i?'L':'M')+x+' '+(-p.A*Math.sin(p.w*x)/2);}document.getElementById('wave').setAttribute('d',d);va.ready();}va.on('change',draw);if(va.data)draw(va.data);</script></body></html>" }
Example: { "id": "math.sine-wave", "text": "<!doctype html>…" }
Example, a parameter more, and a script library the person already let you fetch: { "id": "math.sine-wave", "scriptLibraries": ["math.d3"], "parameters": [{ "name": "A", "kind": "number", "min": 0, "max": 2, "default": 1 }, { "name": "grid", "kind": "boolean", "default": true }] }`,
  input: {
    id: id()
      .optional()
      .describe(
        'The explorable to write: one that exists, by id, or the id a new one takes, starting with its package’s id and a dot. Left out, a new one is made, its id from its name.',
      ),
    package: id()
      .optional()
      .describe('For a new one: one of the project’s own packages, which create_package makes.'),
    name: z.string().min(1).max(200).optional().describe('Its name; a new one needs one.'),
    description: z
      .string()
      .max(1000)
      .nullable()
      .optional()
      .describe(
        'What it explains, which its card, the approval dialog and the outline give; Math as TeX. null takes it away.',
      ),
    file: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,62}\.html$/)
      .optional()
      .describe(
        'For a new one: its file’s name inside explorables/, such as "quadratic.html"; made from its name when left out. An existing one keeps its file.',
      ),
    parameters: z
      .array(parameter())
      .max(32)
      .nullable()
      .optional()
      .describe(
        'The values a tour step may set, replacing all it declares; null declares none. Each has a name, a kind (number, integer, boolean or choice), a range (min and max) or choices, and a default.',
      ),
    scriptLibraries: z
      .array(id())
      .max(16)
      .nullable()
      .optional()
      .describe(
        'The script libraries it uses, by id, of its own package, inlined into its frame in this order; request_script_library fetches one first. null uses none.',
      ),
    text: z
      .string()
      .optional()
      .describe(
        'The page whole: one HTML file with its CSS and JavaScript inside it, at most 512 KiB. A new one needs it.',
      ),
  },
  hints: WRITE,
  run: async (args, program) => {
    const state = await program.project();
    if (args.text !== undefined) {
      const bytes = utf8Length(args.text);
      if (bytes > MAX_EXPLORABLE_BYTES) {
        return fail(
          `Not written: the text takes ${bytes} bytes, past 512 KiB. Keep the page smaller: a script library does not count, and pictures drawn in SVG or on a canvas take less than data: addresses.`,
        );
      }
    }
    const existing = args.id === undefined ? undefined : explorablesIn(state).explorable(args.id);
    let command: Command;
    if (existing === undefined) {
      if (args.package === undefined) {
        return fail(
          args.id === undefined
            ? 'Not written: a new explorable goes in one of the project’s own packages: give package, or the id of one that exists (list_explorables lists them).'
            : `Not written: no package in use defines the explorable "${args.id}"; to make it, give package too.`,
        );
      }
      const own = ownPackage(state, args.package);
      if (own !== undefined) return fail(`Not written: ${own}`);
      if (args.name === undefined) return fail('Not written: a new explorable needs a name.');
      if (args.text === undefined) return fail('Not written: a new explorable needs its text.');
      command = {
        type: 'define-explorable',
        package: args.package,
        explorable: withoutUndefined({
          id: args.id,
          name: args.name,
          description: args.description ?? undefined,
          file: args.file,
          scriptLibraries: args.scriptLibraries ?? undefined,
          parameters: args.parameters ?? undefined,
        }),
        text: args.text,
      };
    } else {
      const { definition, package: owner } = existing;
      if (args.package !== undefined && args.package !== owner) {
        return fail(
          `Not written: "${definition.id}" is an explorable of the package "${owner}", which keeps it.`,
        );
      }
      if (args.file !== undefined && args.file !== definition.file) {
        return fail(
          `Not written: "${definition.name}" keeps its file, explorables/${definition.file}.`,
        );
      }
      const changes = withoutUndefined({
        name: args.name,
        description: args.description,
        scriptLibraries: args.scriptLibraries,
        parameters: args.parameters,
      });
      const commands: Command[] = [];
      if (Object.keys(changes).length > 0) {
        commands.push({ type: 'update-explorable', id: definition.id, changes });
      }
      if (args.text !== undefined) {
        commands.push({ type: 'write-explorable', id: definition.id, text: args.text });
      }
      const [only] = commands;
      if (only === undefined) {
        return fail(
          'Not written: give what to write: the text, a name, a description, parameters or script libraries.',
        );
      }
      const name = args.name ?? definition.name;
      command =
        commands.length === 1
          ? only
          : { type: 'batch', label: `Write the explorable "${name}"`, commands };
    }
    return act(program, command, async (answer) => {
      const written = existing?.definition.id ?? answer.created[0] ?? args.id;
      if (written === undefined) return {};
      if (answer.proposed !== undefined) return { explorable: written };
      const after = await program.project();
      const definition = explorablesIn(after).explorable(written)?.definition;
      const approved = (await approvedOf(program))?.includes(written);
      return withoutUndefined({
        explorable: written,
        file: definition === undefined ? undefined : `explorables/${definition.file}`,
        ...approvalOf(approved === undefined ? undefined : approved ? [written] : [], written),
        shown:
          after.views.length > 0 && !shownAnywhere(after, written)
            ? `Nothing shows it yet. ${SHOWN_HOW}`
            : undefined,
      });
    });
  },
});

const requestScriptLibrary = tool({
  name: 'request_script_library',
  title: 'Ask for a script library',
  description: `Asks the person, in the app, to let Visual Anything fetch a script library from the npm registry for one of the project's own packages (ADR 0107): an npm package at one exact version. The person sees the package, the version and the registry's two addresses before any byte is fetched, and approves or refuses; the program then fetches the version's document and tarball, checks the tarball against the registry's SHA-512 integrity, runs no install script, keeps the chosen file as script-libraries/<sha256>.js beside its license, and defines it in the package, as one action of yours. It waits for the person, up to five minutes; with no app open, nothing is fetched. It answers what was kept, or why not.

Version 1 takes one file that sets a global, a UMD or IIFE build: give path and global when you know them, else the program takes the package's own (unpkg, jsdelivr, browser or main) when that is such a build. An ES-module-only package, such as three.js, is refused for now with that reason. Then name the library's id in write_explorable's scriptLibraries; it runs offline from then on, and travels with the project.

Example: { "package": "math", "npm": "d3", "version": "7.9.0", "path": "dist/d3.min.js", "global": "d3" }
Example, Math inside an explorable: { "package": "math", "npm": "katex", "version": "0.16.22", "path": "dist/katex.min.js", "global": "katex" }`,
  input: {
    package: id().describe('One of the project’s own packages, to keep the library in.'),
    npm: z
      .string()
      .min(1)
      .max(214)
      .regex(/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/)
      .describe('The npm package, such as "d3" or "@scope/name".'),
    version: z
      .string()
      .max(100)
      .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/)
      .describe('Its exact version, such as "7.9.0": no range, no tag.'),
    path: z
      .string()
      .min(1)
      .max(500)
      .optional()
      .describe('The file to keep, by its path inside the package, such as "dist/d3.min.js".'),
    global: z
      .string()
      .regex(/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/)
      .optional()
      .describe('The global that file sets, such as "d3".'),
  },
  hints: WRITE,
  run: async (args, program) => {
    const state = await program.project();
    const own = ownPackage(state, args.package);
    if (own !== undefined) return fail(`Not asked: ${own}`);
    if (program.requestScriptLibrary === undefined) {
      return fail('Not asked: this Visual Anything fetches no script libraries.');
    }
    const answer = await program.requestScriptLibrary(withoutUndefined(args));
    if (!answer.ok) {
      const module = /\bmodule\b/i.test(answer.message)
        ? ' Version 1 takes only one file that sets a global, a UMD or IIFE build; give path to another file of the package if it has one, or draw it in plain JavaScript.'
        : '';
      return fail(`Not kept: ${answer.message} (${answer.code})${module}`);
    }
    const { library } = answer;
    return ok(
      withoutUndefined({
        kept: library.id,
        npm: library.npm,
        version: library.version,
        path: library.path,
        global: library.global,
        license: library.license,
        bytes: library.bytes,
        file: `script-libraries/${library.hash}.js`,
        undo: 'The person can undo it in the app.',
        next: `Name "${library.id}" in write_explorable's scriptLibraries; its page then reads the global ${library.global}.`,
      }),
    );
  },
});

const addExplorableShape = tool({
  name: 'add_explorable_shape',
  title: 'Place an explorable on a view',
  description: `Places an explorable loose on a view's canvas, as one undoable action: a free shape that draws its still picture, live once the person explores it, and that belongs to the view, never to the model. Bound to an element, it reads that element's data, as an element that shows it does; unbound, it reads only its parameters, the theme, the language and its size. update_free_shape moves, resizes, binds or unbinds it (element null), and delete_free_shapes removes it.

Example: { "view": "the-function", "explorable": "quadratic.quadratic", "x": 520, "y": 40, "width": 480, "height": 320, "element": "quadratic-function" }`,
  input: {
    view: id().describe('The view, by id.'),
    explorable: explorableId(),
    x: z.number().describe('Its left edge, in canvas units.'),
    y: z.number().describe('Its top edge, in canvas units.'),
    width: z.number().positive().optional().describe('480 when left out.'),
    height: z.number().positive().optional().describe('320 when left out.'),
    element: id().optional().describe('The element whose data it reads.'),
    name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('What screen readers and the outline say; its explorable’s name when left out.'),
  },
  hints: WRITE,
  run: async (args, program) =>
    act(
      program,
      {
        type: 'create-free-shape',
        view: args.view,
        shape: withoutUndefined({
          kind: 'explorable' as const,
          x: args.x,
          y: args.y,
          width: args.width ?? 480,
          height: args.height ?? 320,
          explorable: args.explorable,
          element: args.element,
          name: args.name,
        }),
      },
      (answer) => ({ shape: answer.created[0] }),
    ),
});

// ——— See ———

const captureExplorable = tool({
  name: 'capture_explorable',
  title: 'See an explorable as it draws itself',
  description: `Answers a still of an explorable as the app runs it, as a PNG image you can look at, with its console errors and whether it said va.ready(), and changes nothing. The tab the person used last runs it in a hidden frame of its own, with the data of the element you name, the parameter values you give (the rest at their defaults) and the theme, waits for va.ready() or two frames after it loads, and takes the still the page draws of itself, at a width of 256, 512 or 1,024 pixels (512 when left out), within 20 s. Only an approved explorable runs: for one not approved it answers so, and only the person can approve it, in the app. With no app open, open_app opens one. Use it after write_explorable once the person approved it, to see that the page draws and reads its data, and fix what its errors say.

Example: { "explorable": "quadratic.quadratic", "parameters": { "a": -1, "b": 0, "c": 4 } }
Example: { "explorable": "quadratic.quadratic", "element": "quadratic-function", "width": 1024, "theme": "dark" }`,
  input: {
    explorable: explorableId(),
    element: id().optional().describe('The element whose data it reads; none when left out.'),
    parameters: parameterValues().optional(),
    width: z
      .union([z.literal(256), z.literal(512), z.literal(1024)])
      .optional()
      .describe('In pixels: 256, 512 or 1,024; 512 when left out.'),
    theme: z
      .enum(['light', 'dark'])
      .optional()
      .describe('The theme to draw in; left out, the one the tab shows.'),
  },
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    const defined = explorablesIn(state).explorable(args.explorable);
    if (defined === undefined) return fail(noExplorable(args.explorable));
    const name = defined.definition.name;
    const approved = await approvedOf(program);
    if (approved !== undefined && !approved.includes(args.explorable)) {
      return fail(
        `"${name}" is not approved, so it does not run and has no still: on the canvas and in the explorable panel it shows its card, "Not approved yet". Only the person can approve it, in the app, after reading its code: ask them to, then call capture_explorable again.`,
      );
    }
    if (program.captureExplorable === undefined) {
      return fail('This Visual Anything takes no stills of explorables.');
    }
    const ask: ExplorableCaptureAsk = withoutUndefined({
      explorable: args.explorable,
      element: args.element,
      parameters: args.parameters,
      width: args.width ?? (STILL_BUCKETS[1] as number),
      theme: args.theme,
    });
    return stillAnswer(name, ask, await program.captureExplorable(ask));
  },
});

/** What Claude reads of a still: the picture with a short text, or why there is none. */
function stillAnswer(name: string, ask: ExplorableCaptureAsk, report: ExplorableCaptureReport) {
  const errors = report.errors ?? [];
  const said =
    errors.length === 0
      ? {}
      : {
          errors,
          note: `Its console errors, oldest first, each cut at ${MAX_FRAME_ERROR} characters: fix them with write_explorable.`,
        };
  if (report.still !== undefined) {
    const outcome: ToolOutcome = {
      ok: true,
      value: {
        explorable: ask.explorable,
        name,
        width: report.still.width,
        height: report.still.height,
        ready: report.ready ?? false,
        ...(report.ready === true
          ? {}
          : {
              readyNote:
                'It never said va.ready(): the still was taken two frames after it loaded. Call va.ready() once it has drawn.',
            }),
        ...said,
      },
      image: { data: report.still.png, mimeType: 'image/png' },
    };
    return outcome;
  }
  const errorsSaid =
    errors.length === 0 ? '' : ` Its console errors, oldest first: ${errors.join(' | ')}`;
  if (report.failure !== undefined) {
    switch (report.failure.reason) {
      case 'not-approved':
        return fail(
          `"${name}" is not approved, so it does not run: only the person can approve it, in the app.`,
        );
      case 'stopped':
        return fail(
          `"${name}" stopped answering, so the app removed its frame: a loop that never yields, or work too heavy for a frame, stops it within 3 s. Fix it with write_explorable.${errorsSaid}`,
        );
      default:
        return fail(
          `"${name}" drew no still${report.failure.message === undefined ? '' : `: ${report.failure.message}`}.${errorsSaid}`,
        );
    }
  }
  switch (report.unanswered) {
    case 'unsupported':
      return fail(
        `The app takes no stills of explorables for you yet, so there is no picture of "${name}". Its text is what read_explorable gives; ask the person to look at it in the explorable panel and tell you what they see.`,
      );
    case 'timed-out':
      return fail(
        `No still of "${name}" came within ${Math.round((report.waited ?? 0) / 1000)} s: the page may never have drawn, or the tab may be in the background. Call capture_explorable again, or ask the person to bring the app's tab to the front.${errorsSaid}`,
      );
    case 'gone':
      return fail(
        'The app closed before it answered, so there is no still. Call open_app to open it again, then call capture_explorable again.',
      );
    default:
      return report.apps === 0
        ? fail(
            'No app has the project open, so there is no still: the app runs explorables. Call open_app to open it, or ask the person to, then call capture_explorable again.',
          )
        : fail(
            'No open tab took the still: only the tab the person used last does. Ask the person to bring the app’s tab to the front, or call open_app, then call capture_explorable again.',
          );
  }
}

// ——— Helpers ———

/**
 * The explorables the person approved, as the program says; undefined where it cannot say, and then
 * the tools say nothing of approval.
 */
async function approvedOf(program: Program): Promise<readonly Id[] | undefined> {
  return program.explorableApprovals === undefined ? undefined : program.explorableApprovals();
}

/** Whether an explorable runs, as the tools say it. */
export function approvalOf(
  approved: readonly Id[] | undefined,
  explorable: Id,
): { approved?: boolean; approval?: string } {
  if (approved === undefined) return {};
  return approved.includes(explorable)
    ? {
        approved: true,
        approval:
          'Approved: it runs, live in the explorable panel and when explored on the canvas.',
      }
    : {
        approved: false,
        approval:
          'not-approved: it shows its card, "Not approved yet", until the person approves it in the app, after reading its code. You cannot approve it: tell the person it waits for their approval.',
      };
}

function ownPackage(state: ProjectSnapshot, packageId: Id): string | undefined {
  if (builtinPackage(packageId) !== undefined) {
    return `"${packageId}" is a built-in package, which the project cannot change: use one of its own packages; create_package makes one.`;
  }
  if (!state.packages.some((each) => each.id === packageId)) {
    return `The project uses no package "${packageId}": create_package makes one of its own.`;
  }
  return undefined;
}

function noExplorable(id: Id): string {
  return `No package in use defines the explorable "${id}". list_explorables lists them.`;
}

/** Whether anything shows an explorable: an appearance, an explorable shape or a tour step. */
function shownAnywhere(state: ProjectSnapshot, explorable: Id): boolean {
  const described = describeExplorable(state, explorable);
  return (
    (described?.shownBy.length ?? 0) > 0 ||
    state.tours.some((tour) => tour.steps.some((step) => step.explorable?.id === explorable))
  );
}

/** The explorable tools, in the order Claude reads them. */
export const EXPLORABLE_TOOLS: readonly Tool[] = [
  listExplorables,
  readExplorable,
  writeExplorable,
  requestScriptLibrary,
  addExplorableShape,
  captureExplorable,
];
