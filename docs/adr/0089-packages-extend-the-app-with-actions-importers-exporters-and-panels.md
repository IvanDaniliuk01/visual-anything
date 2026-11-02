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
