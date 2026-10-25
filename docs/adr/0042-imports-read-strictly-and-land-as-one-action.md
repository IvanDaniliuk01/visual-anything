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
