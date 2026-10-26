---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# A read-only page in one file, which connects nowhere

Reading a project needs the local program today, so a project cannot be shared, embedded in a wiki or read on a phone. The second benchmark (R32) puts a read-only page in M6b. The architecture already lets the core run in the browser alone.

## What the page is

- **One HTML file.** Export → Read-only page, and `visual-anything export <folder> --format page`, write one `.html` file. It holds the app's viewer, built for reading, and a copy of the project:
  - the model, views and scenarios;
  - the packages it uses, with their cleaned images and their attribution;
  - the view to open first.
- **The project inside it is data.** It sits in a `<script type="application/json">` element, which the browser never runs. The viewer reads it with the same checks as opening a project, so a page whose data was edited by hand opens only when the data is valid.
- **What the reader can do:**
  - open every view, pan, zoom and select, with touch on phones and tablets;
  - explore, as the app does: filters, focus, collapse and search;
  - play scenarios, and later tours (R45);
  - follow view addresses (ADR-0030's addendum) in the page's own fragment, so that a link to `page.html#view=…&select=…` opens that view state.
- **What the reader cannot do.** It cannot edit: the page has no commands, no undo and no inspector controls. Nothing the reader does is stored, apart from the theme and the language, kept in the browser as preferences of that page.
- **It follows the system's theme and language,** with the same light and dark themes and the same two languages as the app.

## What keeps it safe

- **It connects nowhere.** The page's content security policy, in a `<meta>` element:
  - `default-src 'none'`;
  - scripts only by the hashes of the page's own inline scripts;
  - styles by their hashes;
  - `img-src data: blob:`;
  - `worker-src blob:`, for layout in a worker;
  - `connect-src 'none'`.

  So it fetches nothing, opens no WebSocket and loads nothing from outside, wherever it is hosted. Trusted Types are required, as in the app.
- **No token, ever.** The viewer has no live connection: the code that redeems launch addresses, keeps a session token or joins a session is not in it. A page cannot reach a local program, even on the machine that made it.
- **Only the product's code runs.** No project content runs: images are the cleaned ones (ADR-0027), names and descriptions are drawn as text, and package code (M7) is not in the page.
- **Embedding.** It can be published on any static host and embedded in an `<iframe>`. Where it is embedded is up to whoever hosts it, since a `<meta>` policy cannot say where the page may be framed.

## Size and speed

- The page should open a view of 10,000 elements within the same frame budget on a laptop, and readably on a recent phone; M6b measures both.
- Its size is reported when it is written. Past 25 MB, the export says so before writing.

## Considered options

- **A folder of files, a static site:** rejected as the only form. One file is easier to send, attach and keep with a pull request, and a static host serves one file as well as a folder.
- **A hosted viewer that loads projects by address:** rejected. Visual Anything has no server or accounts (spec, Not planned), and a page that connects nowhere cannot leak a project.
- **An exported image only:** kept as well (PNG today, SVG and PDF in M6b), for reading without exploring.

## Consequences

- The app's build gains a viewer entry point that leaves out the live connection, the commands and the editors. A test checks that the page's bundle holds none of them, and that its policy is the one above.
- The spec's scope table changes from "Mobile out of scope" to "mobile reading through the read-only page".
- CLAUDE.md gains a rule: an exported page never carries a token and connects nowhere.
- CONTEXT.md gains **Read-only page**.

## Clarifications

<!-- Decided by Claude on 2026-10-25, building W33, under the user's standing delegation of design decisions. -->

- 2026-10-25: **how the page is built and written.**
  - The viewer is a second build of the app (`viewer.html`, `vite.viewer.config.ts`, `app/src/viewer/**`): one module script and one stylesheet in `dist/viewer`, which load nothing. `pnpm build` builds it after the app, the program serves it beside the app (`/viewer/viewer.js`, `/viewer/viewer.css`), and the single executable holds it with the app's other files.
  - Export → Read-only page fetches those two files from the program and writes the page in the browser, which saves it; the program writes nothing. `visual-anything export <folder> --format page [--view <id>] [--out <file>]`, a format of the export command beside SVG, PDF and the text exports, reads them from the build, opens the project with the checks of opening, and writes the page atomically to the file given, or to stdout; `--view` is the view the page opens at, the first without one. Without a built viewer, as in dev mode, both say to run `pnpm build`.
  - The Export dialog offers the PNG, the SVG, PDF and text exports, and the page, each with its size once made and what it leaves out. A PDF of a large view can take tens of seconds, so it is made when it is saved, saying so, and Stop making it drops it; the writer itself runs on, its result unused.
  - One writer, `app/src/viewer/page.ts`, serves both, in pure TypeScript with Web Crypto.
- 2026-10-25: **the project as data.** A `<script type="application/json" id="visual-anything-project">` holds format 1 of the page's data:
  - the project file, the model, the views and the scenarios, as their files hold them;
  - the packages of the project's own, their images as the core cleans them, and those cleaning refuses left out, so that what cleaning drops, such as a photo's position, never travels in a page;
  - the view state the page opens at, as a view address's fragment, and when it was made.

  Built-in packages are named by id in the project file and come with the viewer, as they come with the program. The JSON writes `<`, `>`, `&` and the line and paragraph separators as escapes, so that no text of the project can end its element.
- 2026-10-25: **the same checks as opening**: each file against its kind's schema, through validators Ajv generates when the viewer is built (standalone code, since the page's policy lets nothing compile code); the ids of packages, views and scenarios once each; the packages the project lists, none taking a built-in one's id; then the core's `checkProject`. A page of a later format says to make it again with this version, or open it with a newer one.
- 2026-10-25: **the policy, exactly:** `default-src 'none'; script-src` two hashes (the script that applies the reader's theme before the first paint, and the viewer); `style-src` one hash; `img-src data: blob:; connect-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types default`.
  - `worker-src` is `'none'`, not `blob:`, since the page runs no layout: a view draws the positions it stores, and shapes without one in the canvas's stand-in row, as the app draws them before a layout. A page that lays views out in a worker would add `blob:`.
  - The page's Trusted Types policy lets through only the empty string as HTML, and no script and no script's address.
  - The viewer's script is written so that the browser reads it exactly as written, and its hash holds: `</script` and `<!--` become `<\/script` and `<\x21--`, and a NUL and a carriage return become `\x00` and `\r`. A NUL, which the browser reads as U+FFFD, broke the hash until then.
- 2026-10-25: **what the reader gets, as built:**
  - the views from a picker;
  - panning by dragging, with one finger or the wheel, and zooming by pinching, Ctrl with the wheel, the keys or buttons;
  - selection, with what is selected written out, never edited;
  - the app's reading keys;
  - filters by component and relation type, and focus. Conditions on attributes are not offered, but a view address's apply;
  - collapse and expand, in the page's own copy of the view, kept until the page closes;
  - the app's find field and outline;
  - scenario playback, without recording;
  - view addresses in the page's fragment, followed as the app follows its own.
- 2026-10-25: **the reader's choices.** The theme and the language follow the system unless the reader chooses, kept under `visual-anything.page.theme` and `visual-anything.page.language` in the browser's storage; a page where storage is refused keeps them until it closes.
- 2026-10-25: **About** names the project, when the page was made, and each package with its version, license and attribution where its file gives them (ADR 0047), and where its images come from.
- 2026-10-25: **Size.** The sample's page is 1.6 MB, of which the viewer is 1.56 MB. The Export dialog says each page's size once it is written; past 25 MB (25,000,000 bytes) it says so, and its button reads Save the page anyway. The command line says so before writing.
- 2026-10-25: **The bundle test** (`app/src/viewer/bundle.test.ts`) builds the viewer in a process of its own. It checks the modules the script holds against a list, which the page must not hold:
  - the live connection, the session token and joining a session;
  - the app's shell and header;
  - the canvas's editing gestures, menus and dialogs, and layout;
  - recording, history and the export dialog;
  - the inspector, its controls and the component editor;
  - the core's commands and history;
  - Ajv, and the app's own Trusted Types policy.

  It also checks that the script holds none of the strings by which a page could reach a program, a session or the network.
- 2026-10-25: **package code (ADR 0054) stays out of the page,** as its code and as data:
  - the page's data leaves out each package's `code` and `capabilities`, so a package's code never travels in a page, though nothing in a page could run it;
  - the page shows the attributes the model stores, and no value or drawing package code computes; the Export dialog says so when a package of the project holds code;
  - the bundle test adds the code worker, its interpreter and the core's code commands to the modules the page must not hold, and `WebAssembly.` to what its script must not say.

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25: **Stopping a PDF stops its writer** (W41; this replaces "the writer itself runs on, its result unused" above).
  - `exportView` and the PDF writer take an `AbortSignal`. The PDF has one page, so the writer stops between pieces of its drawing: it draws the SVG in pieces of at most 64,000 characters each, the canvas's color first, then each layer's parts in order, each piece holding only the pictures it uses, and lets the page do what waits between two. Once the signal is aborted it draws no further piece and rejects with the signal's reason, an `AbortError`. The text exports, written at once, check it before and after.
  - Stop making it, and closing the dialog, abort the writer's signal. The dialog takes a writer that ends so, or that throws an `AbortError`, as stopped: it shows no failure, and the file can be made again.
  - Drawing piece by piece also keeps the tab answering while a large view's PDF is made, so that Stop can be pressed at all. PDFKit keeps one copy of each picture, by its address, however many pieces use it.

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

- 2026-10-26 (W47): **tours travel in a page without their speaker notes** (ADR 0058's clarification of that date), as threads of comments do not travel at all (ADR 0059). The Export dialog says both.
