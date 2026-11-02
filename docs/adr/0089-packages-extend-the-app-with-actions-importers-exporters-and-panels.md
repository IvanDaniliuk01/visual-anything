---
status: accepted
---

<!-- Decided by Claude on 2026-11-02 under the user's standing delegation of design decisions, after the user asked for "el tema de los plugins para poder tener mejoras del sistema", with a screenshot of draw.io's menu and its "Plugins…" item. -->

# Packages extend the app with actions, importers, exporters and panels, still sandboxed and approved by their hash

Package code (ADR 0012, 0054, 0060) can compute attributes, check elements, draw inside shapes and simulate (ADR 0085). It cannot add anything a person does: a menu item, an importer, an exporter, a section of the inspector, an action Claude can run. Those are written into the program. The user wants plugins that add improvements to the system, as draw.io's Plugins… menu does. In Visual Anything a plugin is a **package**: the glossary keeps that word and avoids "plugin" (CONTEXT.md), so the menu reads "Packages…".

## Decision

- **Package code may export four more hooks, each a pure function answering plain data**, run as every hook is: in QuickJS in the code worker, within ADR 0054's limits per call, only after the person approves the code by its hash, with only the capabilities they grant:
  - **`actions`** lists named actions, each with a label, where it shows (the canvas menu for a selection, the Packages menu, or both) and the components it applies to. Running one calls the hook with a frozen copy of the selection and, with `model:read`, the model, and it answers a **proposal** (ADR 0073): commands the person reviews and accepts or declines. An action never changes the model by itself. What is accepted is recorded with the person as its author; Claude's runs wait as Claude's proposals.
  - **`import`** declares the file extensions it reads. Given a file's text, it answers a proposal that builds what the file describes, reviewed as any proposal.
  - **`export`** declares a format's name and extension. Given the model and a view, it answers a text, which the local program writes where the person chooses. It never writes files itself.
  - **`panel`** answers a section of the inspector for a selection as data: headings, read-only values, tables, charts of numbers, and buttons that run the package's actions. The app draws it with its own controls; package code never touches the page (no HTML, no DOM).
- **Claude reaches them through two generic tools,** `list_package_actions` and `run_package_action`, rather than tools a package adds, so Claude's tool list stays fixed and every run is a proposal.
- **"Packages…", in the app's menu,** lists the project's packages, built-in and its own: what each adds (components, relation types, hooks, actions, importers, exporters, panels), its capabilities, its approval, and switches to turn a package's hooks off for this computer (a preference, ADR 0032). It adds a package from a `.vapackage` file or a folder on this computer, shows the code before the first approval, and updates one from a newer file, asking for approval again since the hash changed. There is no download from a registry; a marketplace stays not planned.
- **Results are validated before they are used:** a proposal's commands go through the core's checks as any command does, an export's text is capped in size, and a panel's data is checked against its schema and capped. A hook that fails or runs out of time shows a notice naming its package and is not retried automatically.
- **Built-in packages may use the same hooks,** so new improvements can ship as packages: for example a SQL DDL exporter in Data modeling, or "Find tables no relation reaches" as an action.

## Considered

- **Packages running UI code (iframes, HTML, React components):** rejected. It would break ADR 0012's sandbox, the project's rule against storing code that runs outside package code, and the read-only page's security (Trusted Types). Data-only panels keep the app's look and accessibility.
- **Actions applying commands directly:** rejected. A proposal keeps the person in charge and the history clear, and it costs one click.
- **Packages adding MCP tools of their own:** rejected for now. Claude's tools would change with each project, and descriptions written by packages would reach Claude's instructions.
- **Layout algorithms from packages:** left for later. Layout runs in its own worker within a frame budget (ADR 0015), and QuickJS is too slow for 10,000 shapes.
- **A registry to download packages from:** not planned (spec, "Not planned"); a shared package is a file.

## Clarifications

- 2026-11-02 (M14.0, the seam, in the main session):
  - **Declared in the file, run by the code.** What a package adds is declared in its file, `extensions: { actions, importers, exporters, panels }`, so that the app lists it in menus, in Import… and Export… and in the inspector before the code is approved or runs; each runs through one hook named for its kind, `act`, `importFile`, `exportFile` or `panel`, called with the declaration's id. The hooks are not called `actions`, `import` and `export`, since `import` and `export` are JavaScript's own words. An action has an id, a label, an optional description, where it is offered (`selection`, `packages-menu`, or both) and the components it is offered for; an importer, the extensions it reads; an exporter, the one it writes; a panel, the components it shows for. At most 32 actions and 8 of each other kind; ids are lower case letters, digits and `-`, unique within their kind; labels are 1 to 60 characters, in the package's own words.
  - **They go with the code, and in its hash.** `set-package-code` takes `extensions`, as it takes capabilities: `null` removes them, and they are removed with the code. The hash a package is approved by is `[text, capabilities, extensions]` when it declares any, with their keys sorted, and stays `[text, capabilities]` otherwise, so that every approval given before ADR 0089 holds while adding an action asks again.
  - **What the hooks answer.** `act` and `importFile` answer `{ label?, commands }`: at most 500 commands, within 1 MiB as JSON, none that creates, edits, resolves or deletes a comment, resolves conflicts or writes package code, in batches too. `exportFile` answers a text of at most 4 Mi characters. `panel` answers at most 64 blocks, each a heading, a text, a value, a table (up to 12 columns and 200 rows), a bar or line chart (up to 6 series of 200 values), or a button that runs one of the package's own actions. Each is checked by `core/src/code/extensions.ts` and kept rebuilt from the parts its kind has, or dropped whole with the reason.
  - **Longer calls for what the person asked for.** `act`, `importFile` and `exportFile` run up to 2,000 ms a call, since the person waits for them with a notice; `panel` keeps ADR 0054's 50 ms, since the inspector calls it as the selection changes. Memory stays 32 MiB.
  - **Changes for review are not Claude's proposals.** An action or an importer the person runs answers changes the core shows with `previewPackageChanges`: the comparison of the project now and with them (ADR 0070), and the one batch command that applies them all as the person's action, refused whole when one breaks a rule. Choosing some of them is left out for now. Claude's runs (M14.5) go through Claude's proposals (ADR 0073) as any command of Claude's does.
  - **The protocol's messages** for running actions, importers and exporters, which the seam was to hold, go with M14.3 and M14.5, which know where each runs: package code runs in the app's code worker, and Claude's tools run it in the local program.
