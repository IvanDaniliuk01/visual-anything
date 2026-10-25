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
