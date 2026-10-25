---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# Package code runs in QuickJS inside WebAssembly, through three hooks, once approved by its hash

ADR-0012 decided that code kept in packages runs in a JavaScript interpreter compiled to WebAssembly, inside a Web Worker, only with the capabilities the person approves. M7 builds it, and this ADR settles what ADR-0012 left open.

## Where the code lives and what it may do

- **Where it lives.** A package file gains an optional `code` section with one module of JavaScript, written in TypeScript or JavaScript and stored as JavaScript text. Project files hold it as data. Nothing runs it until the person approves it, and the file format never runs anything on its own (CLAUDE.md).
- **Three hooks.** The module may export any of these pure functions. Each gets a frozen copy of the data it needs and returns plain data:
  - `attributes(element, context)` answers computed attribute values, shown like stored ones with a mark, never saved, and never in the history.
  - `check(element, context)` answers problems that show as warnings, as relation type limits do.
  - `draw(element, context)` answers what to draw inside the shape, in the declarative drawing format the appearance already uses (shapes, text and images by id). The app draws it, so the code never touches the canvas.
- **What `context` holds.** The element's component, its attributes, its relations and their ends, its containers and contents (one level), and the view's scale for `draw`. Only through the capabilities its package declares can the code read more.
- **Capabilities.** A package declares what its code needs, and the person approves each:
  - `model:read`: the whole model, read-only;
  - `time`: the clock;
  - `network:<origin>`: fetching from one origin, through the local program, which checks the origin. This one is for live values (ADR 0057) and is off by default.

  Nothing else exists: no files, no page, no other origin, no timers past the call.

## How it runs

- **The interpreter is QuickJS,** compiled to WebAssembly (`quickjs-emscripten`, MIT, pinned), running in a Web Worker that the app starts only when a project uses package code.
  - Each package gets its own runtime and its own context, so packages cannot see each other.
  - The worker answers by message. The main thread never waits on it, and the canvas draws what it has until the answer comes.
- **Limits.** Each call stops past 50 ms or past 32 MiB for that package's runtime. A package whose calls stop three times in a row is turned off until the project opens again. The inspector says why.
- **Errors** are the package's: they show as a warning on the package and on the element, never as a crash.

## Approval

- **What is approved.** The person approves a package's code, and each capability it declares, by the SHA-256 of its code text and the list of its capabilities.
- **Where approvals live.** In the person's preferences (ADR-0032), never in the project, so a cloned repository cannot approve itself.
- **When it asks again.** Any change to the code or to the capabilities changes the hash, and the app asks again before the new code runs. Code Claude writes is approved the same way, by the person, in the app.
- **Without approval,** the package's declarative parts still work, and its code's hooks are simply not called.

## Considered options

- **SES or ShadowRealm in the page:** rejected, as ADR-0012 did for code in the same page.
- **A separate WebAssembly runtime per element:** rejected. One runtime per package is enough for isolation between packages, and it costs far less memory.
- **Approvals kept in the project:** rejected. Anyone who can push to the repository could approve their own code.

## Consequences

- The schema gains `PackageFile.code` and `PackageFile.capabilities`.
- The core gains the hooks' types and the checks of their answers. An answer that is not plain data within its size cap is dropped, with a warning.
- The app gains the worker, the approval dialog and the marks for computed values.
- Claude's tools can read and write a package's code, and run its hooks on an element after the person approves it.
- CLAUDE.md's file rule "never store code that runs" becomes "never run code the person has not approved".

## Clarifications

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

M7's build (W34) settled these. ADR-0060 records how the code is kept, what the hash is of and what an approval holds.

- **The interpreter.** `quickjs-emscripten-core` with its single-file release builds, pinned at 0.32.0, MIT: `@jitl/quickjs-singlefile-browser-release-sync` in the app's code worker and `@jitl/quickjs-singlefile-mjs-release-sync` in Node. Their WebAssembly is inside their JavaScript, so the worker, which may connect nowhere, fetches nothing; the full `quickjs-emscripten` package would add three builds nothing uses. Each module is warmed up on code of its own before any call is timed.
- **The code worker's policy.** Compiling WebAssembly needs `'wasm-unsafe-eval'`. Only the code worker's script gets it, in a policy of its own (`CODE_WORKER_POLICY`): no connection, no worker of its own; every other script keeps `WORKER_POLICY`.
- **Limits.** Each package's runtime has 32 MiB and a stack of 48 KiB: past about 128 KiB, native recursion such as `JSON.stringify` of a deep value reaches the engine's own stack before QuickJS's, which would fail the interpreter rather than the call. A call stops at 50 ms of wall time; a call that ends past it, in native work the interpreter cannot interrupt, counts as stopped all the same and its answer is dropped. An interpreter that fails is replaced by a new one.
- **The worker's watchdog.** Work the interpreter cannot interrupt at all, such as an allocation that drowns its garbage collector, can keep the worker busy for seconds: the app stops a worker silent for 1.5 s while it works (15 s while it starts) and starts another, and the package it was running counts a call that stopped.
- **Nothing the code made is read outside the call.** The answers, and whatever the code throws, are read inside the interpreter, under the call's deadline, by code that ran before the package's and kept the intrinsics it uses: a getter or a proxy trap that never ends stops like any loop. Errors are told apart from other thrown values with `Error.isError`, which runs no trap, and a name or message behind a getter reads as "threw something that is not an error". The app reads back strings and numbers only, and the core checks them again.
- **No code from text.** `eval` is removed, and every Function constructor throws; there is no module loader, `import()` loads nothing, and nothing awaits at a module's top. There is no clock without `time`: `Date.now()`, `new Date()` and `Date()` throw, and a date made from given parts works. A console that keeps nothing is there, so code written for a browser runs.
- **Where hooks run.** On the elements created from the package's components and from components derived from them in any package, nearest package first: for one attribute name or for the drawing, the nearest package's answer wins; every package's problems show.
- **`draw`.** Its answer is a drawing: a box of its own, at most 10,000 units either way, and at most 256 items: `rectangle`, `rounded-rectangle`, `ellipse`, `line`, `arc`, `text` (one line of at most 80 characters) and `image` (by id; drawn as its outline for now), colors written #RRGGBB, strokes and text without a color in the shape's own stroke. The canvas fits it, keeping its proportions, in the lower half of the shape, under the name, above the shapes and under the relations, from the scale names show at; shapes that hold other shapes or draw rows, and rows, draw none. `context.scale` is the zoom in steps, 0.25, 0.5, 1, 2 and 4, so that zooming asks again only when it crosses one.
- **`network:<origin>`.** It can be declared and granted, off until the person turns it on in the dialog, but no hook fetches anything yet: fetching through the local program comes with live values (ADR-0057).
- **Computed values** show in the inspector with a "computed" mark naming their package, and never in a file or the history. The canvas's detail, overlays and filters do not read them yet.
- **Claude's tools.** `read_package_code`, `write_package_code` (one undoable action of Claude's, TypeScript stripped of its types when asked) and `run_package_code`. Running asks the program, through the Claude endpoint, which of the project's current code the person approved, and runs it in Claude's own process, in the app's sandbox, never in the program, which keeps answering apps and Claude.
