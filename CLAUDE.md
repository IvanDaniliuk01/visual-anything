# CLAUDE.md

## What this is

Visual Anything: an open-source, local-first tool to make any concept or system visual and explore it interactively (data science, physical AI, neuroscience, data modeling, systems architecture). Solo project, private for now. Everything in this repository is written in English.

## Read before working

- `CONTEXT.md`: the domain glossary. Use its terms exactly in code, files, UI and docs, and never the words listed under "Avoid".
- `docs/adr/`: decisions. Follow every ADR whose status is `accepted`. If a change would contradict one, stop and propose a new ADR that supersedes it; do not implement it until the user agrees.
- `docs/spec-v0.1.md`: scope, quality bar, milestones and tasks for v0.1, and the milestones after it. Work only on the current milestone; anything listed as "Later" or "After v0.1" is out of scope until its milestone starts.
- `docs/playbook.md`: the loop every milestone follows and which of its tasks run in parallel. Read it when you start a milestone.
- `docs/designs/`: the detailed designs a milestone or track builds from. Read the one for the current milestone when you plan it, and check it against the code.

## Architecture

- `packages/core`: model, commands, invariants and the undo history. Pure TypeScript with no I/O, so it runs in Node and in the browser.
- `packages/schema`: project file types and the JSON Schema generated from them.
- `packages/server`: the local Node program. It owns the model and its history (ADR-0016), serves the app on 127.0.0.1, reads and writes the project folder, and exposes the MCP server and the WebSocket for live updates and guidance.
- `packages/app`: React UI. The canvas is drawn with PixiJS (ADR-0014) and ELK layout runs in a Web Worker (ADR-0015). The app sends commands and renders what comes back.

Each package is named `@visual-anything/<folder>`, such as `@visual-anything/core`. The packages export their TypeScript source, so nothing needs building before dev or tests.

## Rules

- Only `core` changes the model, and only through commands. Every command is undoable and records its author: the user or Claude.
- Enforce and test these invariants in `core`: every element comes from exactly one component; components and relation types derive from exactly one parent, up to Essence and "relates to"; containment never forms a cycle; deleting a relation also deletes the relations that end on it, after a preview; relation-type limits only warn; scenario steps whose relation is deleted become broken steps and are never deleted.
- Project files are JSON with the extensions `.vaproject`, `.vamodel`, `.vapackage`, `.vaview` and `.vascenario`. Validate them on open, write them with a stable key order, write atomically (temporary file, then rename), and never store code that runs.
- The server binds to 127.0.0.1 only, checks the Origin and Host of every request, and requires a per-session token on the WebSocket. `core` has no network access.
- Performance budget: a view with 10,000 elements pans, zooms and selects at a 60 fps target; layout never blocks the main thread.

## Workflow

- Start each milestone in plan mode and wait for the user's OK before writing code.
- Build `core` test-first, with property tests for the invariants.
- Use subagents where they pay off: `task-builder` for parallel tasks whose interfaces are already fixed (it works in its own git worktree, branched from the last commit, so commit before launching it), Explore for research that would flood the main context, and `spec-reviewer` at the end of every milestone. Build the foundational `core` types and commands in the main session.
- When the docs do not answer a design question, stop and ask. Record the answer in `CONTEXT.md` (terms) or in a new ADR (hard-to-reverse decisions).
- A milestone is done only when its "Done when" line in the spec holds. Check it, then commit and tag `m<N>`.

## Commands

Run them at the repository root, with Node 22.13 or later and the pnpm version pinned in `package.json`.

- Install: `pnpm install`
- Dev: `pnpm dev` serves `examples/my-systems` with hot reload and opens the browser.
- Start: `pnpm start` builds, then serves `examples/my-systems` and opens the browser.
- Test: `pnpm test` runs Vitest in every package.
- Lint: `pnpm lint` runs ESLint, then the Prettier check; `pnpm format` fixes formatting.
- Typecheck: `pnpm typecheck`
- Build: `pnpm build` regenerates the JSON Schema in `packages/schema/schemas/` and builds the app. After changing `packages/schema/src/files.ts`, run it and commit the schemas.
- Benchmark: run `pnpm dev`, then open `/bench.html?elements=10000` at the address it prints; no token is needed. It times the work of each frame, GPU included, while a 10,000-element view pans, zooms and selects; `?mode=frames` times frames as shown, which needs the window in front. Run it with the machine otherwise idle.
- Open another project: `pnpm exec tsx packages/server/src/cli.ts <folder> [--port <n>] [--no-open] [--dev]`
