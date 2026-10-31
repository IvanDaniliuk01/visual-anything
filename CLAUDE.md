# CLAUDE.md

## What this is

Visual Anything: an open-source, local-first tool to make any concept or system visual and explore it interactively (data science, physical AI, neuroscience, data modeling, systems architecture). Solo project, private for now. Everything in this repository is written in English, with American spelling (color, behavior).

## Read before working

- `CONTEXT.md`: the domain glossary. Use its terms exactly in code, files, UI and docs, and never the words listed under "Avoid".
- `docs/adr/`: decisions. Follow every ADR whose status is `accepted`. If a change would contradict one, stop and propose a new ADR that supersedes it; do not implement it until the user agrees.
- `docs/spec-v0.1.md`: scope, quality bar, milestones and tasks for v0.1, and the milestones after it. Work only on the milestones under way; anything listed as "Later" or "After v0.1" is out of scope until its milestone starts.
- `docs/playbook.md`: the loop every milestone follows and which of its tasks run in parallel. Read it when you start a milestone.
- `docs/designs/`: the detailed designs a milestone or track builds from. Read the one for the current milestone when you plan it, and check it against the code.

## Architecture

- `packages/core`: model, commands, invariants and the undo history. Pure TypeScript with no I/O, so it runs in Node and in the browser.
- `packages/schema`: project file types and the JSON Schema generated from them.
- `packages/server`: the local Node program. It owns the model and its history (ADR-0016), serves the app on 127.0.0.1, reads and writes the project folder, keeps each person's preferences outside every project (ADR-0032), and exposes the MCP server and the WebSocket for live updates and guidance.
- `packages/app`: React UI. The canvas is drawn with PixiJS (ADR-0014) and ELK layout runs in a Web Worker (ADR-0015). The app sends commands and renders what comes back.

Each package is named `@visual-anything/<folder>`, such as `@visual-anything/core`. The packages export their TypeScript source, so nothing needs building before dev or tests.

## Rules

- Only `core` changes the model, and only through commands. Every command is undoable and records its author: the user or Claude.
- Enforce and test these invariants in `core`: every element comes from exactly one component; components and relation types derive from exactly one parent, up to Essence and "relates to"; containment never forms a cycle; deleting a relation also deletes the relations that end on it, after a preview; relation-type limits only warn; scenario steps whose relation is deleted become broken steps and are never deleted, in any alternative of a decision too.
- Project files are JSON with the extensions `.vaproject`, `.vamodel`, `.vapackage`, `.vaview` and `.vascenario`, and, from M11, `.vatour` and `.vacomment`. Validate them on open, write them with a stable key order, write atomically (temporary file, then rename). Nothing in them runs, except package code the person has approved by its hash, sandboxed (ADR 0054). The one kind of file that is not JSON is a solid (M9, ADR 0075): a glTF file the local program cleaned, kept as `solids/<sha256>.glb` beside the project and named by its package; it is validated when first read, never changed once written except to restore it from its kept copy, and never run. A project file may hold `conflicts` that a git merge left in it, as data; it still validates and opens (ADR 0072).
- The server binds to 127.0.0.1 only, checks the Origin and Host of every request, and requires a per-session token on the WebSocket. `core` has no network access.
- What leaves the app never carries a token: an exported read-only page connects nowhere (ADR 0041). What enters is read strictly and nothing in it runs (ADR 0042).
- Git is read, never written: the program runs the person's own git by its absolute path, with arguments and never a shell, only the read-only subcommands ADR 0071 lists, and only on the commit ids it listed itself, never on paths or refs that a file, a page or a message gave. The merge driver runs nothing and loads nothing from the repository, and keeps conflicts as data in a file that still validates (ADR 0072); only `merge-driver --install`, which the person runs, writes git config. Run from the sources, the program keeps the TypeScript loader on its own configuration (`TSX_TSCONFIG_PATH`, ADR 0029).
- Performance budget: a view with 10,000 elements pans, zooms and selects at a 60 fps target; a theme switch never stalls a frame; layout never blocks the main thread. From M8, a model of 100,000 elements opens with its containers collapsed and reads at 60 fps while fewer than 10,000 shapes show.

## Workflow

- Milestones run in parallel, as the user asked on 2026-10-24: the main session lands the seams the tasks share (types, interfaces, stubs) and commits them, then launches every task whose interfaces are fixed, across milestones, each owning its files. Tasks merge into the `develop` branch as they finish; the main session resolves what they share. The user has delegated design decisions: record them in ADRs and say what was decided, rather than waiting in plan mode.
- Build `core` test-first, with property tests for the invariants.
- Use subagents where they pay off: `task-builder` for parallel tasks whose interfaces are already fixed (it works in its own git worktree, branched from the last commit, so commit before launching it), Explore for research that would flood the main context, and `spec-reviewer` at the end of every milestone. A task may own `core` work when no other running task changes the same core files.
- When the docs do not answer a design question, decide it, as the user has delegated, and say so. Record the answer in `CONTEXT.md` (terms) or in a new ADR (hard-to-reverse decisions).
- A milestone is done only when its "Done when" line in the spec holds. Check it, then commit and tag `m<N>`.

## Commands

Run them at the repository root, with Node 22.13 or later and the pnpm version pinned in `package.json`.

- Install: `pnpm install`. It also links the agent skills that `pnpm-workspace.yaml` grants, today PixiJS's, into `.claude/skills`; read them again when that dependency is upgraded.
- Dev: `pnpm dev` serves `examples/my-systems` with hot reload and opens the browser.
- Start: `pnpm start` builds, then serves `examples/my-systems` and opens the browser.
- Test: `pnpm test` runs Vitest in every package.
- Lint: `pnpm lint` runs ESLint, then the Prettier check; `pnpm format` fixes formatting.
- Typecheck: `pnpm typecheck`
- Build: `pnpm build` regenerates the JSON Schema in `packages/schema/schemas/` and builds the app. After changing `packages/schema/src/files.ts`, run it and commit the schemas.
- Theme tokens: after changing `packages/app/src/theme/themes.ts` or `scale.ts`, run `pnpm exec tsx packages/app/src/theme/generate.ts` and commit `tokens.css`; a test fails while they differ.
- Benchmark: `pnpm bench` builds the benchmark pages for production and serves them on 127.0.0.1:47707; no token is needed, and official numbers come from this build. `/bench.html?elements=10000` drives the canvas alone and times the work of each frame, GPU included, so it is valid even in a window behind others; `?mode=frames` times frames as shown instead. `/app-bench.html?elements=10000` drives the whole app, React included: it times clicks, selecting everything, a keyboard move and one edit, and judges pan and zoom on frames as shown, so its window must stay in front at 60 Hz. `pnpm dev` serves the same pages for quick checks, but React's development build more than doubles what the app page measures. Run them with the machine otherwise idle.
- Package: `pnpm package` builds the app and writes this system's single executable to `dist-exe/` (ADR 0037); `pnpm smoke [--browser]` smoke-tests it with no Node.js on its search path.
- Open another project: `pnpm exec tsx packages/server/src/cli.ts <folder> [--port <n>] [--no-open] [--dev]`
