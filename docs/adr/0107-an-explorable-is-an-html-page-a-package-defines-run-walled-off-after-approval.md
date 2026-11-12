---
status: accepted
---

<!-- Decided with the user on 2026-11-10 in the wayfinder map docs/wayfinder/explorables-and-math/ (Q1 to Q42, and the export simplified after the browser proof), from its research and its proofs on branches research/* and prototype/explorable-frame. The details the user did not decide were decided by Claude under the user's standing delegation. -->

# An explorable is an HTML page a package defines, run walled off in a frame of its own after the person approves it, and still everywhere it is exported

The user explains mathematical modules with Visual Anything and asked for a viewer of HTML, CSS and JavaScript "con gráficos y demás", besides the physical-space panel: a function's graph with sliders, an algorithm stepping through its data. Nothing in a project runs today but package code, in QuickJS, with no page to touch (ADR 0054, 0089); imported HTML is cleaned into a drawing and never run (ADR 0068); and the spec's "Not planned" kept HTML with scripts out of projects. This decision lets one kind of page run, under the person's approval, in a frame walled off from the app, and supersedes that part of "Not planned".

## Decision

### What an explorable is

- **An explorable** is a page of HTML, CSS and JavaScript that explains something by letting a person play with it. It is **one file**, `explorables/<name>.html` beside the project, holding its own CSS and JavaScript, with pictures inside it as `data:` addresses. The file is named, not hashed, so the person edits it in their own editor and the app reloads it (Q16, Q22, Q23).
- **A package defines it,** as it defines images and solids (ADR 0027, 0075), so a package shared between projects (ADR 0051) carries a component's explorable with it. `PackageFile.explorables` lists `ExplorableDefinition`s:
  - `id`, which starts with the package's id; `name`; `description`;
  - `file`, the file's name inside `explorables/`;
  - `scriptLibraries`, the ids of the script libraries it uses;
  - `parameters`, each with a name, a kind (number, integer, boolean or one of listed strings), a range or the strings, and a default;
  - `api`, the version of the `va` API it was written for, `1` today;
  - `hash`, the SHA-256 of the text the program last read.
- **What shows it** (Q19, Q25):
  - an element or every element of a component, by `explorable` in its appearance, as `solid` is; an element's own appearance wins over its component's;
  - loose on the canvas, as a free shape of a new kind, `{ kind: 'explorable', id, x, y, width, height, explorable, element?, name? }`, beside the note, the arrow and the picture (ADR 0098); `element` binds it to an element, chosen in the inspector (Q30);
  - a tour step, by `explorable: { id, parameters }`, which shows it live in the explorable panel while the step plays and sets its parameters (Q13, Q31).
- **Caps.** An explorable's text is at most 512 KiB; past that it is kept, warned about and never run. A package defines at most 64 explorables.

### Where it is live

- **The explorable panel,** beside the canvas, shows the explorable of the selected element live. It can be open together with the physical-space panel, one above the other (Q20), and is resized and kept per tab as that panel is (ADR 0076). "Open beside" shows an explorable in a pane of the split view (ADR 0102).
- **On the canvas,** an explorable's shape draws its **still picture**. Double-click or Explore makes it live in place; one is live on the canvas at a time, and it turns still again when another is explored, when it scrolls off screen, or with Escape (Q11).
- **In a tour step,** live in the explorable panel.
- **Everywhere it is exported,** only its still picture: the read-only page, the SVG, the PDF and the PNG. No explorable runs outside the app, so ADR 0041's page keeps its policy unchanged. The user chose this after the browser proof found that a looping page freezes Firefox's tab, which the watchdog cannot stop (Q17 as amended).

### The frame

- **One frame document, built by one pure function of the core** (`core/src/explorables/frame.ts`): the `va` runtime, the explorable's script libraries inlined as globals, and the explorable's text. The builder turns CR and CRLF into LF and escapes NUL, then hashes every inline script and style, since the browser hashes what it reads after rewriting them. A script the builder did not put in has no hash and does not run.
- **Its policy:** scripts and styles only by those hashes, no `eval`, `connect-src 'none'`, no workers, no nested frames, `img-src data: blob:`, `font-src data:`, `sandbox allow-scripts` and nothing else, so its origin is opaque, and `frame-ancestors` naming the app.
- **A second listener of the local program serves it.** It binds to 127.0.0.1 only, on a port of its own, and is reached as `http://<label>.localhost:<port>/`, with a fresh random label for each frame. So the frame is another site from the app: Chrome and Firefox run it in another process, and a frame that loops never slows the next, which on a shared host it did (the proof: the next frame hung twice in two runs; on a fresh label it answered in 103 ms). Its path holds a nonce made for the session, which is not the session token. It refuses any request that carries an `Origin` header and any `Host` that is not a loopback label of its port, which stops DNS rebinding. The app's own policy allows frames from `http://*.localhost:<port>` and nothing else.
- **Messages.** On the frame's `load`, the app posts `{ kind: 'va/hello', api: 1 }` with one `MessageChannel` port; after that it listens only on that port. Every message either way is plain data, checked and capped by the core (`core/src/explorables/messages.ts`), at most 1 MiB, and a message that fails its check is dropped whole.
- **The watchdog.** The app pings the frame every second; a frame silent for 3 s is removed and its shape shows its card with "Stopped: it stopped answering". A mark in the tab's `sessionStorage` keeps an explorable that hung the tab from starting by itself again after a reload.
- **What no policy stops.** No browser lets a policy block WebRTC, and the proof saw Chrome send STUN packets from inside the frame. An approved explorable could send data out that way; the person's approval is the real line, and the approval dialog says so.

### The `va` API, version 1 (Q28 to Q35)

- **`va.data`** holds, for an explorable shown by an element:
  - the element: id, name, component, description, and its attributes with their values, computed values and live values, each beside its definition's kind, unit, label and range;
  - what it contains, one level down, and its relations, each with its type, its direction and the element at the other end with that element's attributes;
  - at most 500 elements in all, the rest counted;
  - for every explorable: `parameters`, the values set (a tour step's, else the defaults); `theme`, `light` or `dark`; `language`, `en` or `es`; `size`, its width and height in pixels; and the scenario or tour step under way.
- **`va.on('change', data => …)`** gives the whole data again when any of it changes, at most once a frame.
- **The theme's colors** reach the frame as CSS variables, `--va-text`, `--va-surface`, the accents and the rest, so a page that uses them changes theme by itself.
- **What it says back:** `va.ready()` when it has drawn; `va.select(id)`, which selects on the canvas one of the elements it received and changes no model; its console errors, at most 50 kept; and its still picture. `va.onStill(() => …)` lets a WebGL page draw again just before its still is taken.
- **Versions.** An explorable declares `api: 1`, and the program keeps serving version 1's shape. Adding a field keeps the version; removing or renaming one makes a new one.

### Still pictures (ticket 05)

- **The frame draws its own still:** a copy of html-to-image built into the runtime (MIT, about 5 KB gzipped) turns the page into an SVG `data:` address and then a PNG, which the frame posts. The app takes it only from that frame's port and rebuilds it through the core's bitmap reader (`core/src/images/bitmap.ts`), the cleaner every picture passes through.
- **When:** only for an approved explorable, only when a still is needed, in one hidden frame at a time, at size buckets of 256, 512 or 1,024 pixels, while the canvas is at rest. It waits for `va.ready()` or two frames after load, and for `document.fonts.ready` at most 2 s (Firefox did not settle it in three runs of four), and gives up after 5 s.
- **Kept for the session,** in the canvas's image store, by a hash of the file, its script libraries, the data it was given, the theme, its parameters and the bucket. Nothing is written into the project.
- **An explorable not approved, stopped, failed, or with no app to draw it** (the command line's exports) shows a **card** drawn from data alone: its name, its description, the script libraries it asks for, and why it is not running, such as "Not approved yet: Approve to run".

### Approval (Q9, Q18, Q36 to Q42)

- **Every explorable asks the person before it runs,** including those Claude writes. The dialog shows its name and description, who wrote it (Claude in this session, or "came from outside": an import, git, the person's editor), its script libraries with version, license and size, its code behind "Show code", and one plain sentence: it runs walled off and cannot see the person's files, session or the network, and the one thing no browser lets us block fully is sending data out over WebRTC, so approve it if you trust whoever wrote it.
- **Kept as package code's approvals are** (ADR 0060): a preference outside every project (ADR 0032), `explorableApprovals`, newest first, at most 1,024, each `{ hash, explorable, by }`, where the hash is of the frame's inputs: the explorable's text and its script libraries' hashes. It holds in any project that holds the same explorable.
- **Claude's changes continue an approval.** When Claude writes through `write_explorable` to an explorable whose current text is approved, the program approves the new hash in the person's name with `by: 'claude'`. A restart keeps it; undo returns to a text already approved; a text from the person's editor or from git is a hash Claude did not write, and asks; a new explorable Claude makes asks the first time.
- **Claude never approves.** It can ask whether an explorable is approved, and its tools answer `not-approved` for one that is not.
- **Revoking.** Approved explorables are listed beside package code's approvals and can be removed; one removed shows its card again.

### Script libraries (tickets 04 and 12)

- **A script library** is a JavaScript library an explorable uses, kept beside the project. It comes **only from the npm registry**, at one exact version: the program reads the version's document and its tarball, checks the tarball against the registry's SHA-512 `integrity`, runs no install script, and keeps the chosen file. Files that a CDN builds on request (jsDelivr's `+esm`, esm.sh) are refused, since no registry hash covers them.
- **Version 1 takes a single-file build that sets a global** (UMD or IIFE), which D3, Plotly, function-plot, JSXGraph, Chart.js, KaTeX and mathjs ship. The frame inlines it as a script; import maps cannot work in the frame. A package with no such build, such as three.js, is refused for now with that reason.
- **Where it is kept.** The file is `script-libraries/<sha256>.js`, written once, atomically, and checked as `media/` and `solids/` files are; the tarball's license text is kept beside it. The package lists `scriptLibraries`: id, npm package, version, tarball address, integrity, SPDX license, and the file's hash and global. A project keeps one version per id. A license outside ADR 0047's list is warned about, never refused.
- **Downloading asks first.** Before any byte is fetched, the person sees who asks (Claude or themselves), the package, the exact version and the registry's addresses; afterwards, what was kept and its size. The fetch shares the address checks of `server/src/live-fetch.ts`, within 64 MiB and 120 s. Once downloaded with that consent, Claude adding the library to an approved explorable runs under the approval Claude continues.
- **Caps.** A script library's file is at most 16 MiB, and a project keeps at most 128 MiB of them.
- **No `eval`.** Libraries that compile strings into code fail in the frame: function-plot's formulas as strings, JSXGraph's string terms, `d3.csvParse`. Functions work, and `d3.csvParseRows` does; the guidance Claude reads says so.

### Writing and changing the file

- **Claude writes through `write_explorable`,** never the file directly: it defines the explorable when new and writes its text, one undoable action whose history keeps the previous text, up to 512 KiB per explorable. Claude editing the file with its own file tools counts as a change from outside.
- **The program watches `explorables/`.** When a file's text no longer hashes to its definition's `hash`, the program reads it, records the new hash in an action of the person's, "The file of <name> changed", and the frame reloads; the new text asks for approval unless Claude wrote it. Undo does not write the person's file back.
- **Importing.** Import… takes an `.html` file as an explorable when the person picks "As an explorable" rather than "As a drawing" (ADR 0068), and pasting does the same.
- **Claude's tools:** `write_explorable`, `request_script_library` (which asks the person), `capture_explorable` (its still and console errors, within ADR 0081's deadlines), and `get_item` reading an element's explorable and its parameters.

## Considered options

- **Exporting explorables live in the read-only page:** dropped by the user after the proof. It needed `srcdoc` frames, `style-src 'unsafe-inline'`, a new Trusted Types policy and `font-src data:` in ADR 0041's page, and in Firefox a looping explorable froze the reader's whole tab. The still picture says enough on a shared page.
- **`srcdoc` frames in the app:** rejected. A `srcdoc` frame inherits the app's policy and would put hostile code beside the origin whose `sessionStorage` holds the token.
- **One `localhost` host for every frame:** rejected; a looping frame kept its process busy and hung the next.
- **Import maps and modules served by the listener:** rejected; serving modules to an opaque origin needs `Origin: null` accepted, against refusing every `Origin`.
- **A headless browser in the local program for stills:** rejected, as ADR 0068 rejected it for imported HTML: it would run pages outside the person's browser and weigh 280 MB. The browser's own capture APIs ask the person every time and exist only in Chrome.
- **Declarative charts only, no code:** rejected by the user (Q2), who wants Claude to write real interactive pages.
- **Why ADR 0068 still holds.** Imported HTML that the person did not mean to run stays a cleaned drawing; an explorable is different because the person chose it, approved it by its hash, and it runs walled off in a frame of its own.

## Consequences

- The spec's "Not planned" no longer excludes HTML with scripts in a project: an approved explorable is planned (milestone A10). An iframe for each element stays out: one explorable is live on the canvas at a time.
- ADR 0089's "package code never touches the page" holds for package code; explorables are not package code.
- CLAUDE.md's rule that nothing in project files runs names explorables beside package code, and its files list `explorables/` and `script-libraries/`.
- The program gains a second loopback listener, a file watcher on `explorables/` and a reader of npm tarballs; the protocol's version goes up when the first stage lands.
- The Spanish for script library is "biblioteca de JavaScript", which the catalog's test admits by an `unless`, since "biblioteca" alone is avoided.
- Not proven and left to the milestone or later: Safari, which the proof could not run; flattening ESM-only libraries such as three.js into one file; tests in headless browsers must turn back on the frame isolation that puppeteer turns off by default.

## Clarifications

- 2026-11-12, A10.0's core, decided by Claude under the user's delegation:
  - **How the explorable's own scripts are hashed.** The builder reads the explorable's text with the HTML tokenizer's own rules, as the proof's builder scanned its output: comments ending at the first `-->` or `--!>`, raw text and RCDATA elements, attributes whose quoted values hold `>`, a script's escaped and double-escaped states, and SVG and MathML by namespace (`foreignObject`, `desc` and `title` are integration points only in SVG; `mi`, `mo`, `mn`, `ms`, `mtext` and `annotation-xml` with an HTML encoding only in MathML; the breakout tags end both). It hashes each `<script>` without `src` and each `<style>` it finds where HTML reads one, and an SVG script or style whose text holds no `<` and no `&`, so that it reads as written. Where it cannot be sure, it hashes nothing: every hash is of the author's own text, so a reading that differs from the browser's only ever stops the author's code, never runs anything else. The tests use parse5, which follows the HTML standard's parser, as the browser's stand-in. The scan is linear in the text's length, tested at the 512 KiB cap with adversarial runs.
  - **NUL.** Inside scripts it is written `\x00`, JavaScript's escape, as the proof did; elsewhere U+FFFD, as the parser itself makes it. CR and CRLF become LF everywhere first.
  - **`http-equiv` is renamed wherever it stands.** Every `http-equiv`, in any case, anywhere in the text (markup, comments, raw text, scripts), becomes `data-va-http-equiv`. A `<meta>` the browser honors must spell that attribute's name out, so no reading of the page, right or wrong, leaves one that refreshes the frame or does anything else; in a script it stays the same JavaScript.
  - **The policy, word for word:** `default-src 'none'; script-src 'report-sample' <hashes>; style-src 'report-sample' <hashes>` (or `'none'` without styles)`; img-src data: blob:; font-src data:; connect-src 'none'; worker-src 'none'; child-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors <the app's origin>; sandbox allow-scripts`. `'report-sample'` allows nothing; it lets the runtime tell the author what was blocked. There is no `'unsafe-hashes'`, so `style="…"` attributes and event handlers never apply, and a style a library injects as a `<style>` element is blocked: pages set styles through the CSSOM (`element.style`, `sheet.insertRule`) or in their own `<style>`. The proof ran its frames with `style-src 'unsafe-inline'`, so A10.2's browser tests must confirm Plotly and KaTeX under hash-only styles, and a later clarification may relax `style-src` if they need it.
  - **The text lives in the project, and the history keeps it.** `ProjectSnapshot.explorableTexts` holds each explorable's text, `{ id, text, read? }`, beside its definition, whose `hash` is the SHA-256 of that text's UTF-8. The local program reads the files into it when the project opens and writes `explorables/<file>` after each action that changes a text (`explorableFileWrites`). `write-explorable` replaces the text and the hash in one action, so undo gives the previous text back and writes it. `record-explorable-file`, the action "The file of … changed", records a text the program read (`read: true`): undoing or redoing it never writes the file, as the ADR says, while undoing Claude's write over such a text writes the person's text back. It takes the whole text and no hash: the core works the hash out from the text, so no sender can make a definition claim the hash of an approved text. A file past 512 KiB is recorded with its text's hash and the text is dropped, so it never runs. A text that goes with its explorable is never deleted from disk.
  - **Commands.** `define-explorable` (with its text; its file is made from its name when left out, and no two explorables of a project share a file), `write-explorable`, `record-explorable-file`, `update-explorable` (name, description, script libraries, parameters), `remove-explorable`, `define-script-library` (only the program sends it; replacing an id changes its version), `remove-script-library`. An explorable uses only its own package's script libraries. Removing an explorable an appearance or an explorable shape shows, or a script library an explorable uses, is refused (`in-use`), with its package too; a tour step that names a removed explorable, a parameter no longer declared or a value its parameter no longer takes is a broken step, kept and played without it, and no new explorable takes an id a step still names. The project's 128 MiB of script libraries counts each file once, by its hash.
  - **Parameters** of kind `integer` were missing from the seam's union and are in it now.
  - **`va.data`.** Attribute definitions have no label or range, so each attribute carries its definition's `kind` (its type), `unit`, `description` and `choices`; `label`, `min` and `max` stay in the type for later. Computed, live and simulated values come from the caller (`sources`), read as everything else reads them. Relations include nesting ones, beside the contents; a relation that ends on a relation is left out. Past 500 elements, or past what one 1 MiB message carries, the rest are counted in `omitted`.
  - **Messages.** A frame's console error is at most 2,000 characters, which the runtime cuts to; a still is a PNG of at most 1 MiB less 1 KiB, the whole of its buffer, at a width of 256, 512 or 1,024. A message nests at most 64 deep.
  - **Approvals.** The hash approved is the SHA-256 of `["explorable", textHash, libraryHashes]` as JSON, so the app works it out from definitions alone. Claude's write continues an approval when the text it wrote over was approved, by anyone, for any explorable with the same hash.
  - **The protocol, version 13.** `explorables/listen` and its answer `explorables/listening` give the listener's port and the session's nonce, which is not the token; the app makes a fresh 16-to-32-character label per frame and builds `http://<label>.localhost:<port>/<nonce>/frame/<explorable>/<approval hash>`, and the listener serves only that approved frame. `script-library/consent` (Claude asks) and `script-library/consented`, or `script-library/fetch` (the person asks), then `script-library/kept` or `script-library/refused`. The consent names the registry's two addresses, worked out from the package and version before any byte is fetched (`registryAddresses`); the program refuses a tarball elsewhere. The text needs no message, since it travels in the project; approvals travel as the preference `explorableApprovals`; a file changed outside comes as its action.
  - **Commands only the program runs.** `record-explorable-file` and `define-script-library` are taken only when the local program itself runs them, for a file it read or fetched and checked: the command's context carries `program: true`, which the program never sets for a command that came from an app, Claude's tools or package code, inside a batch or not; any other sender is refused with `program-only`. This is the core's own check, beside the program's admission of `define-solid` for files it holds (ADR 0075).
  - **The listener trusts no definition's hash.** A definition's `hash` says what the program last read, and a package brought in from elsewhere may say anything. The frame listener (A10.1) hashes the exact text it serves and the exact bytes of each script library file it inlines, works the approval hash out from those (`approvalHashOf`), and serves the frame only when that hash is approved and equals the one the frame's address names. It never takes `definition.hash`, or a library definition's `hash`, as the hash of what it serves.
