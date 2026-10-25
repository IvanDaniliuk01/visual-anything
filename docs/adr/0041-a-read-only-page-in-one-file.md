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
