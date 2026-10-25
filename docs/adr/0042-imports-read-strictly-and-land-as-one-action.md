---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# Imports are read strictly, run nothing, and land as one action

Claude can already build from existing material through its recipes (R29), but a person cannot import a file themselves. M6c adds importers for:
- Mermaid (R34);
- spreadsheets and JSON (R35);
- Structurizr and LikeC4 (R36);
- draw.io (R37), which the spec listed as "Not planned".

The files come from anywhere, so each is untrusted input.

## How an import works

1. **Read.** A reader for each format turns the file into a plan.
   - Readers are pure TypeScript in the core (`core/src/import/`), with no I/O, so that the app, the command line and Claude's tools use the same ones.
   - The plan holds elements, relations, containers and views. Where the source gives them, it also holds positions and bend points.
   - It also holds what matched nothing.
2. **Map.** A dialog maps the source's kinds to components and relation types: Mermaid's node shapes and classes, draw.io's styles, spreadsheet columns. It shows what the plan will create and what it leaves out, before anything changes. Built-in mappings cover the common cases, such as a cylinder becoming a Database. The person changes any of them.
3. **Apply.** The plan becomes one batch command, labelled with the file's name (`Import "checkout.drawio"`). One undo takes back the whole import.
4. **Report.** After applying, the app lists what matched nothing, quoted as the source writes it, with why.

## What makes it safe

- **Nothing in an import runs.** Readers never evaluate anything: no expressions, no scripts, no links followed, no includes fetched.
  - A Structurizr DSL file comes in only through the Structurizr CLI the person runs themselves, whose JSON output we read. The CLI is never bundled.
  - Mermaid is read by a reader of our own for the supported subsets: flowcharts, C4, ER and class diagrams. Mermaid's own package is not used.
- **Labels become plain text.** HTML in labels has its tags dropped and its entities decoded. An unsanitized label was draw.io's CVE-2026-46642.
- **XML is read strictly.** draw.io files are read by a reader that refuses a DTD and entities, as the SVG cleaner of ADR-0027 does.
- **Compressed content has a cap.** Compressed diagrams and the diagram inside a `.drawio.png` or `.drawio.svg` are inflated to at most 32 MiB.
- **Imports have limits.** At most 20,000 elements and 50,000 relations per import; past them, the import refuses and says so.
- **Images in imports are left out.** That includes draw.io's stencil images, whose terms differ from its code license. A component's own image, chosen in the mapping, is used instead.

## Ids and importing again

- **Ids.** A source id that is a valid id and free in the project is kept. Otherwise one is generated. The plan records which source id became which.
- **Importing a diagram again** adds it again; it never merges.
- **Spreadsheets import again by a key.** The key is the id column, or a column the person chooses. A row whose key matches an element updates that element's values and changes nothing else: positions, containers and appearance stay. A row whose key matches nothing creates an element. Nothing is deleted.

## Considered options

- **Importers in a new package:** rejected for now. They are small, pure, and turn into commands, which is what the core does. They can move out if they grow.
- **Merging a diagram imported again:** rejected. Matching shapes across two versions of someone else's diagram guesses too much. The undoable import and the delete preview are enough.
- **Mermaid's own parser:** rejected. It is large, made to draw rather than to read, and its labels can hold HTML.

## Consequences

- The core gains `core/src/import/` with one reader per format, each tested on fixtures and against hostile input: entities, bombs, HTML in labels and huge files.
- The app gains Import… in the header, and the command line gains `visual-anything import <folder> <file>`.
- Claude gets an `import_file` tool that takes a file's content. The local program still never fetches anything.
- The spec's "draw.io import: Not planned" line changes, since it is planned in M6c.

## Clarifications

<!-- Decided by Claude on 2026-10-25, building W29, under the user's standing delegation of design decisions. -->

- 2026-10-25 (W29): **the readers' list.** `core/src/import/read.ts` lists every reader (`IMPORT_READERS`): the Structurizr, LikeC4 and draw.io readers first, then JSON, Mermaid and spreadsheets.
  - **Which reader reads a file:**
    1. the reader the person names;
    2. else one whose content says it is its format, whatever the file's name, as `readDiagramFile` tells a Structurizr workspace, a LikeC4 model or a draw.io diagram apart;
    3. else the one whose file name ending it has;
    4. else the first that recognizes its content.
  - **One list for every way in.** The dialog, the command line and Claude's tools all read through it, so a reader added there is offered everywhere.
  - **What the readers are told.** Each is told the project, and, for W30's, what the project uses (`ReadOptions.uses`).
- 2026-10-25 (W29): **what every reader shares.**
  - Names are one line of at most 1,000 characters, as W30's readers keep them, and descriptions at most 10,000. What is cut is reported, in the same words by every reader.
  - A report lists at most 500 things that matched nothing, then says how many more there were. It quotes at most 120 characters of each.
  - Files are read up to 32 MiB of text.
  - A reader stops as soon as a file passes the import's limits, before any work that grows with the file. Each reads in time that grows linearly with the file:
    - no nested scans over lists;
    - patterns kept from backtracking;
    - lines of a C4, ER or class diagram read only up to 16,384 characters.
  - What sits inside what has one container per element, at most 64 deep, and never a cycle; what would break that is reported.
  - A lookup keyed by text from a file reads only own values (`own`, `recordOf`), so a kind, a column or a key named `constructor` or `__proto__` is text like any other. No attribute may be named `__proto__`: it is reported and left out.
- 2026-10-25 (W29): **Mermaid.** Flowcharts (`graph`, `flowchart`), C4 (`C4Context` and the other four), ER (`erDiagram`) and class diagrams (`classDiagram`) are read; Mermaid's other diagrams are refused by name.
  - **Kinds:**
    - in a flowchart, a node's class when it has one, else its shape, in brackets or `@{ shape: … }`, labelled as the file writes it, such as `[( )]` or `:::db`;
    - in C4, the macro, such as `ContainerDb`;
    - in ER, entities, attributes, and identifying (`--`) or non-identifying (`..`) relationships;
    - in a class diagram, a class's annotation, such as `<<interface>>`, else `class`, and each UML relationship.
  - **What becomes what:**
    - Edges keep their labels as names.
    - C4's technology becomes the attribute `technology`.
    - An ER attribute becomes an element inside its entity, with `type`, `primaryKey`, `unique` and `foreignKey`.
    - Cardinalities and multiplicities become attributes of the relation.
    - A class's members become its attribute `members`.
  - **What is reported, never read:** styles, layout settings, directives, notes, images and icons, and links and callbacks, which are never followed.
  - **Views:** each diagram becomes one view, named after its title or the file, that shows what it holds. The dialog and the command line can leave it out.
- 2026-10-25 (W29): **spreadsheets.** CSV or TSV, delimited by tab, comma or semicolon, as the first line uses most, or by tab for `.tsv`. They are quoted as RFC 4180 says, and a quote that never closes is refused with the line it opens on.
  - **Tables:** a file holds one table or several, each from its header row. A blank line followed by a header starts the next. A table with `from` and `to` (or `source` and `target`) columns holds relations; any other needs a `name` (`label`, `title`) or `id` column and holds elements.
  - **Columns:**
    - elements take `id`, `name`, `component` (or `kind`), `container` (or `parent`) and `description`;
    - relations take `id`, `from`, `to`, `relation type` (or `type`, `kind`) and `name`;
    - headers match without case, spaces, underscores or dashes;
    - every other column is an attribute named by its header, with a value only where its cell has one.
  - **Values:** cells are text exactly as written, so formulas and HTML stay text. Once mapped, a value whose attribute is a number or a boolean is read as one when it is written as one.
  - **What a cell names:** a container or a relation's end names an element by the id of a row, by a name only one row has, or by the id of an element of the project or a name only one has. Rows past the most an import brings are refused before they are read.
- 2026-10-25 (W29): **JSON.** A file with `world` is a project's own model file. It is checked against the published model schema by an interpreter of the schema's keywords in the core, `checkAgainstSchema`, since the app's page policy lets no code be compiled, as Ajv does with a schema; a test keeps it agreeing with Ajv.
  - **The simple form,** `{ "elements": [...], "relations": [...] }`, is checked against `SIMPLE_FORM_SCHEMA`:
    - elements have `name`, and may have `id`, `component`, `container`, `description` and `attributes`;
    - relations have `from` and `to`, and may have `id`, `relationType`, `name`, `description` and `attributes`;
    - any other key is refused.
  - **What a JSON file holds that is not brought in:**
    - Strings stay as written: an entity is text.
    - A file nesting deeper than 64 is refused.
    - In a model file, World, relations on World and elements' own appearances are left out and reported.
    - A relation on a relation comes after the relation it ends on; a cycle of them is reported.
- 2026-10-25 (W29): **importing again,** for spreadsheets and both JSON forms, matches by `id` unless the person names another column or key, which may be `name` or an attribute. A row that matches several elements is left out and reported. A relation the project already has, between elements the import matched and of the type it maps to, is not created again, and is reported. A planned relation has no `existing`, so a matched relation's values are not updated; that would need the plan's types to change.
- 2026-10-25 (W29): **relations' descriptions.** A planned relation has no description, so a description from a file is kept as the relation's attribute `description`, and reported. Giving the plan a relation description would change the plan's types.
- 2026-10-25 (W29): **the built-in mappings** (`suggestMapping`) choose, for each kind:
  1. its suggestion when the project has it;
  2. else the project's own definition of the same name;
  3. else the suggested built-in definition, whose package the import then starts using in the same action;
  4. else Essence or "relates to".

  The nesting relation type is the one whose limits fit what sits inside what, such as "is column of" for columns in tables. Failing that, it is the open view's first, else "is part of". Suggestions come from words too: a class `db` suggests a Database. `prepareImport` wraps `planToCommand`'s batch with what it starts using, and keeps its label.
- 2026-10-25 (W29): **how large an import can be sent.** The app sends a batch only up to the live connection's 4 MiB (ADR-0027). Past that, the dialog says so and points to `visual-anything import`, which opens the project itself when no program runs (ADR-0049).
- 2026-10-25 (W29): **how fast an import lands.** The core's batch execution re-indexes the model after each operation, so N creates take time that grows as N². Measured on a loaded machine: 3,000 elements in 16 s, and 10,000 in about 5 minutes. Imports at the limits need the core's draft to keep its index as it goes; until then, the limits stay as they are, and the hostile tests check reading and preparing, not applying, at 20,000.
<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25 (W30): how the Structurizr, LikeC4 and draw.io readers read (`core/src/import/structurizr.ts`, `likec4.ts`, `drawio.ts`; `readDiagramFile` tells their files apart by what they hold, and gives nothing for any other file).
  - **LikeC4's exported model, as checked in LikeC4's source today.** `likec4 export json` writes the `$data` of each project's model: one `LikeC4ModelData` object, or a list of them when the workspace holds several projects. Its `_stage` is `layouted`, or `computed` with `--skip-layout`. It holds:
    - `projectId` and `specification`, with the element, relationship and deployment kinds;
    - `elements` and `relations`, as records by FQN and by id; descriptions as `{ txt }` or `{ md }`; relation ends as `{ model, project? }`;
    - `deployments.elements`, deployment nodes and deployed instances (which have `element`), and `deployments.relations`, whose ends are `{ deployment, element? }`;
    - `imports`, the elements imported from other projects, as lists;
    - `views`, as records, each with `_type` (`element`, `deployment` or `dynamic`), `nodes` (with `parent`, `modelRef` or `deploymentRef` and, once laid out, absolute `x`, `y`, `width` and `height`) and `edges` (with `relations`, Bézier `points`, and `controlPoints` when set by hand).

    The reader also takes the older forms, where an end or a description is plain text. Groups are left out, and an edge drawn between the containers of a relation's ends is reported, since a view here shows a relation where both its ends show.
  - **Kinds are named as each format names them**, so their labels need no translation:
    - Structurizr's element types, with the shape a style gives when it is not a box (`Container (Cylinder)`), and `Relationship`, with its first tag of its own (`Relationship (Asynchronous)`);
    - LikeC4's specification kinds, `deploymentNode <kind>` and `instanceOf`, and `->` for a relation of no kind;
    - draw.io's style: the shape (`shape=cylinder3`), the named style (`ellipse`), `rounded=1` or `rectangle`; for lines, `edge` or how they dash and end (`dashed=1;endArrow=none`).

    A kind named like something every object inherits (`constructor`, `__proto__`) is quoted, so that no mapping finds the prototype's.
  - **Suggestions** name only what the project uses, when the reader is told (`ReadOptions.uses`); told nothing, they name what the built-in packages define. Structurizr's and LikeC4's name the C4 starter package's ids first (`c4.person`, `c4.software-system`, `c4.container`, `c4.component`, `c4.deployment-node`, `c4.uses`), which are passed over until a package defines them.
  - **Sizes.** Shapes keep the sizes their file gives, stored with their positions. Structurizr's are drawn at half and LikeC4's at six tenths, so that the files' default boxes come out about as wide as a Service; draw.io's stay as they are.
  - **What a Structurizr view shows** is what it lists. Containers it shows are drawn around what they hold, as Structurizr draws boundaries. Filtered views keep their base view's elements by tag. Implied relationships are kept, being the workspace's own; a relationship a view leaves out between what it shows is reported. Container and software system instances are elements of their own inside their deployment node, related to what they are deployed from, so that no container sits inside a node in a view that does not show the node.
  - **Positions** are stored relative to an element's own container when the view shows it, and on the canvas when no container further out shows. When a container further out shows instead, no position can be stored (ADR-0019 keys them by the direct container), and layout places the shape.
  - **draw.io.**
    - A DOCTYPE that only names an outside DTD, as draw.io's SVG export writes, is skipped and never fetched; one with declarations of its own is refused.
    - A `.drawio.png`'s `zTXt` chunk is read as zlib or raw deflate, both of which draw.io has written.
    - Placeholders such as `%team%` are filled in once, from the object's own values: at most 64 in a label, a label of at most 4,000 characters, and 1,000,000 characters in the whole file.
    - Waypoints become bend points on the canvas; a line with more than 64 is left without them.
    - Lines that end on lines become relations on relations, created after what they end on. Loops among them are found as strongly connected components, in time linear in the lines.
    - A link is kept as text when it is a web address, and reported otherwise.
  - **Caps besides `IMPORT_LIMITS`.** A reader refuses past the elements and relations an import brings before it reads any view. It brings at most 500 views (draw.io pages past them are neither inflated nor read) and 200,000 shown shapes across them. It cuts names at 1,000 characters. A LikeC4 name over 256 characters or 32 levels deep is refused. The XML reader reads at most 500,000 elements, 256 deep, with 1,024 attributes a tag. What matched nothing lists 500 things, then how many more.
  - **Structurizr DSL** stays unread. The import dialog's help (`app/src/import/diagram-formats.ts`) says to export it with `structurizr-cli export -workspace workspace.dsl -format json`.
