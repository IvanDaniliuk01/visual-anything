# Playbook: building v0.1 with Claude Code

How v0.1 gets built: one-time setup, the loop every milestone follows, what runs in parallel, and the prompts that start each milestone.

## Set up once

1. Install git, Node.js (LTS) and Claude Code.
2. Create a private repository named `visual-anything`, copy this kit into it and make the first commit. Worktrees need at least one commit to branch from.
3. Open Claude Code at the repository root in plan mode: `claude --permission-mode plan`, or press Shift+Tab in a running session until the status bar shows plan mode.
4. Paste the M0 kickoff prompt below. When you approve the plan, choose "Yes, and use auto mode" (or "Yes, auto-accept edits" when auto mode is not offered). Subagents inherit that mode, so the parallel ones do not each stop to ask about every file.

## The loop

Every milestone runs the same five steps:

1. **Plan.** In plan mode, Claude proposes the order of the milestone's tasks, which ones go to `task-builder` subagents, and how it will check "Done when". You approve or adjust.
2. **Build.** The main session builds what everything else in the milestone depends on. Tasks whose interfaces are then fixed go to `task-builder` subagents, each in its own git worktree. Commit before launching them: their worktrees branch from the last commit, because `.claude/settings.json` sets `worktree.baseRef` to `head`.
3. **Merge.** The main session merges the subagents' branches and runs typecheck, lint and tests.
4. **Review.** The `spec-reviewer` subagent checks the milestone against the spec, the ADRs, `CONTEXT.md` and the rules in `CLAUDE.md`. Fix what it finds.
5. **Close.** Check the milestone's "Done when" line yourself, then commit and tag `m<N>`.

## What runs in parallel

| Milestone | Starts after | Main session | `task-builder` subagents |
| --- | --- | --- | --- |
| M0 · Skeleton | — | Workspace, base config, the four packages with their minimal interfaces, the sample project | Schema; server; app shell |
| M1 · Model core | M0 | Model types, commands and history, rules and invariants, test-first | Once those are merged: project I/O; the built-in Systems package |
| M2 · Canvas | M1 | PixiJS renderer, selection, pan, zoom, move and connect | Inspector with inline text editing; keyboard navigation with the outline panel; the 10,000-element benchmark |
| M3 · Views, layout and tables | M2 | The security fixes; the scene and renderer seams (incremental scenes, rows); appearance traits, commands and the Data modeling package in the schema and core; views and perspectives, nesting with several containers, collapse with aggregated relations | ELK layout worker; filters and focus mode; tables on the canvas |
| M3b · Component editor and images | M3 | Images in the schema and core; the page and worker policies; the renderer's image seam | The component editor; images on the canvas with their benchmark; the image MCP tools, after M4's entry point |
| M4 · Claude through MCP | M1 for the tools, M3 for live guidance | MCP stdio entry point, live guidance over the WebSocket, tool descriptions | Read and query tools; write tools |
| M5 · Scenarios | M3 and M4 | Scenario files, aggregated steps, broken steps | Recording and playback in the app; the scenario MCP tools |
| M6 · Dogfooding and v0.1 | M5 | Everything, together with the user | — |
| Track A · Look and feel | M2 for A1; `a1` for A2; M3's canvas tasks for A3; M4 for A4 | Core foundations: colors, preferences, protocol, dark shades; project appearances and their commands; sizes on the 8-unit step | Server preferences; app preferences and the header; shell polish; canvas theme; canvas colors; inspector color editing; grid; snapping; rulers |
| M8b · Beyond boxes | M8 | The three seams, in order: free geometry and route styles in the schema and core; named parts in the core; the scene's seam | Once the seams are merged: free geometry on the canvas; routes on outlines and automatic curves; anchored parts on the canvas; the editors; HTML as a drawing; Claude's tools; exports; the sample; the benchmark, measured after the rest is merged |
| M11c · Tours that move, and scenarios that decide | M11, M5 | The two seams: tours' new keys, `tourTransition` and the bounded camera path; decisions in the schema and the core (ADR 0077, ADR 0078) | One task at a time (since 2026-10-26): tours on the canvas; the stage; decisions in the app; Claude; view states, addresses and the sample; the benchmark |
| Track P · Visual packages | M6c, M8b | The licence list and reserved ids (ADR 0079) | One package at a time, in ADR 0079's order |
| M9 · Physical space inside components | M8b | Its two seams (ADR 0075) | One task at a time |
| M10 · A linked physical-space panel | M9 | Its two seams (ADR 0076) | One task at a time |

Since 2026-10-26 the user asked for no more parallel waves: the machine runs everything locally and the usage limits are near. Once the agents running then are merged, work goes one task at a time, in the main session or with a single builder.

M4's tools depend only on M1, so they can be built in a second Claude Code session in its own worktree while M2 is under way: `claude --worktree mcp-tools`. Do it only when you can review two streams of work at once; otherwise follow the spec's order. Once M3 is tagged, M3b can run the same way beside M4.

Track A runs in its own worktree on branch `track-a`, branched from the M2 close; its commits start with `A<n>:` and each stage is tagged `a<n>` when its Done when holds. Milestone tags are merged into `track-a`, never rebased onto. The milestones after v0.1 (M7 to M13 in the spec) get their rows here when they are planned.

## Kickoff prompt for M0

```text
Read CONTEXT.md, every ADR in docs/adr, docs/spec-v0.1.md and docs/playbook.md. We are going to build milestone M0 · Skeleton.

1. In plan mode, propose the monorepo layout (pnpm workspaces with core, schema, server and app), the tooling (TypeScript, Vite, Vitest, ESLint) and the minimal interfaces between the packages. Wait for my OK.
2. Build the shared skeleton in this session: the workspace, a base tsconfig, the four packages with their minimal interfaces, and a sample project in examples/my-systems with one file of each of the five types. Commit it.
3. Launch three task-builder subagents in parallel:
   a) schema: the project file types and the JSON Schema generated from them, with validation on open;
   b) server: the local program on 127.0.0.1 with Origin and Host checks and a per-session token, which opens the browser and loads a project folder;
   c) app: the React shell with header, model panel, canvas area and inspector, showing a static view of the sample project.
4. Merge their branches, add CI (typecheck, lint, tests), fill in the Commands section of CLAUDE.md, and check M0's "Done when".
5. Run the spec-reviewer subagent and show me its findings before committing and tagging m0.
```

## Prompt for every later milestone

```text
We are starting milestone M<N> · <name>. Read its section in docs/spec-v0.1.md and its row in docs/playbook.md. In plan mode, propose the order of its tasks, which ones go to task-builder subagents, and how you will check "Done when". Wait for my OK, then follow the loop in docs/playbook.md.
```
