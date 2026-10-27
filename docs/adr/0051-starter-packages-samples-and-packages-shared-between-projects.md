---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# Starter packages, sample projects, and packages shared between projects

M6c ships the first starter packages (R38), the sample projects a new project starts from, and a way to take a package from one project into another (R39). ADR 0047 says what may ship; ADR 0018 says built-in packages live in the program and projects use them by id. This decides what those three things are, where they live and how they behave, because projects will come to depend on each of them.

## Starter packages

- **Two, built in.** `c4`, "C4 architecture", and `data-science`, "Data science pipelines", live in `core/src/builtin/` beside Systems and Data modeling, and are used by id like them. Their ids, and those of what they define, change only by additions from now on (ADR 0018). `c4` joins the reserved package ids.
  - **C4 architecture:**
    - components Person, Software system, Container, Component and Deployment node;
    - relation types uses, runs in, delivers to, and is part of.

    Structure nests by "is part of" (a container in its software system, a component in its container) and deployment by "runs in" (a container, a software system or a node in a deployment node). Each view chooses which it shows (ADR 0007), so one model holds both a containers view and a deployment view.
  - **Data science pipelines:** components Source, Transform, Feature store, Model and Dashboard; relation types feeds and trains. It has no nesting relation type of its own.
- **Their icons are drawn for Visual Anything.** Each is a plain SVG on a 24-unit grid in one colour, stored as the core's cleaner writes it. Each reads at 3:1 or more on its component's fill in both themes, since a picture is drawn as stored in both (ADR 0033). A test checks both. Person has no icon: its shape is a person.
- **What Visual Anything writes and draws itself is CC0-1.0**, credited to "Visual Anything contributors". That covers the four built-in packages and their icons. CC0 asks nothing of whoever uses them, so a view, an export or a read-only page made with them can be shared without any notice, whatever license Visual Anything itself takes. The license test (ADR 0047) holds every built-in package and image to the list.

## Sample projects and new projects

- **The samples live in `examples/`.** `examples/c4-architecture` ("Internet banking") and `examples/data-science-pipeline` ("Churn prediction") are ordinary project folders. Each has two or three views laid out as the app lays them out, over what each view's scope shows (ADR 0040), and a scenario that plays.
- **The program holds them.** `packages/server/scripts/samples.ts` embeds every project file of each in `packages/server/src/samples/samples.json`. The program, the single executable included, reads the samples from there. A test fails while the embedded copy differs from `examples/`.
- **A new project goes only into a folder that holds nothing yet.** That is a folder that does not exist, or holds nothing but entries whose names start with a dot, such as `.git`. Each file is written atomically as a regular file inside it, and a failure takes back what was written. An empty project uses Systems, holds World alone and has one view.
- **Two ways to start one:**
  - `visual-anything new <folder> [--from <sample>]` writes it, then opens it as `visual-anything <folder>` does, with `--port`, `--no-open` and `--dev` passed on.
  - The program run on a folder that holds nothing yet starts as usual, behind the same Host, Origin and token checks, but greets each app with `start/offered` in place of `project/opened`. That message carries the samples and, for a page that opened with a launch code, the session token. The app shows its start screen and answers with `start/create`. The program writes and opens the project, and from then on is that project's session, for every app and Claude connected meanwhile. The record that lets Claude attach is written only then.
- **The samples are in English.** What people wrote is never translated (ADR 0038), and a sample is such writing. The start screen's texts, and an empty project's first view's name, are in the language the app reads in.

## Packages shared between projects

- **A copy, not a link.** "Add from another project" copies a package from another project's folder into this one, with its images, keeping every id, as a package of the project's own. The two copies then live apart, and nothing points from one project to the other.
- **Chosen and read in the browser.** The person chooses the other project's folder with the browser's folder picker. The app reads only its project file and the package files in its `packages/` folder, each within 4 MiB, the most one change carries. It sends the package whole in one command, as the image picker sends a picture. The local program never reads a folder outside the project for the app.
- **Checked by the core as any command is.** `add-package` checks the package as `create-package`, `define-image`, `define-component` and `define-relation-type` would, piece by piece:
  - only the keys a package and an image have;
  - each image cleaned again, never trusted to be clean;
  - each definition's values;
  - derivation cycles;
  - the images its components show.

  A clash of ids with anything in the project is refused, saying every id that clashes, as are ids outside the package's own and ids used twice. The built-in packages it needs start being used in the same action. What it needs that no package defines is refused, naming it.
- **Updated after a preview.** "Update from another project" reads the same folder again and finds the package with the same id. The app lists what changed: the properties, and the definitions and images added, removed or changed, with a note when the version there is older. `replace-package` then applies it as one action. It refuses to remove a definition or an image that the rest of the project still uses, saying what uses it. The folder is chosen again each time, and the project stores no path to it: a path would not travel with a shared project, and could tell where someone keeps their files.
- **A version, a license and an attribution** (ADR 0047) say which version a copy is and whom to credit. A semantic version lets the preview say which of two is newer. The program never needs them.

## Considered options

- **Drawing icons from an outside set, such as Lucide (ISC):** rejected for now; superseded by ADR 0079, which lets built-in packages draw on allowed sets. Our own CC0 icons ask nothing of the people who export views, and keep the license test simple. An allowed set can come later, with its attribution travelling as ADR 0047 says.
- **MIT or CC-BY for Visual Anything's own content:** rejected. Either would ask every export made with a built-in package to carry a notice.
- **Samples as TypeScript in the core, written out to `examples/`:** rejected. A sample is best edited by opening it in the app, as any project is; the embedded copy follows the folders, not the other way round.
- **Reading the other project through the local program, by a path typed or browsed:** rejected. It would give the live connection a way to read folders outside the project. The browser's picker reads only what the person chooses.
- **Remembering where a package came from, in the package or the project:** rejected, for the reasons above. Choosing the folder again is one step.
- **Linking to a package in another project instead of copying it:** rejected. A project would no longer open on its own, which ADR 0018 keeps true for built-in packages too.

## Consequences

- The core gains the starter packages and their icons, the license list and its test, the commands `add-package` and `replace-package`, and `packageChanges`, `packageNeeds` and `compareVersions` for previews.
- The live protocol gains `start/offered` and `start/create`; `PROTOCOL_VERSION` stays, since the app and the program always ship together.
- `pnpm --filter @visual-anything/server samples` regenerates the embedded samples after a sample changes, and the change is committed with it.
- Claude's MCP entry point cannot attach to a program on an empty folder until a project is started there.

## Clarifications

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

- 2026-10-26 (M8b, W59): **samples of a milestone's features are not sample projects.** `examples/beyond-boxes` (M8b), like `examples/gauges` (M7), lives in `examples/` beside the sample projects, but the program does not hold it and the start screen does not offer it: it shows features rather than a starter package, and brings a package of its own, which a new project's first files never hold. It is opened as any project folder, and a test of its own opens it through the program's loader.
- 2026-10-26 (M8b, W59): **a sample's `sources/` folder** holds what its files are made from and that is not a project file: a picture before cleaning, with its comments, and HTML to import as a drawing (ADR 0068). The loader reads no such folder, and the embedded samples take none of it. A test holds what the project stores to what its source gives, as the heart's picture is held to what cleaning `sources/heart.svg` gives.
