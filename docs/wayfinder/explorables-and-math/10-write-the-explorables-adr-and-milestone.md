---
label: wayfinder:task
title: Write the Explorables ADR and milestone
status: closed
assignee: claude
blocked_by: [03-sandboxing-an-explorable.md, 04-libraries-beside-the-project.md, 05-capturing-an-explorable.md, 06-explorable-files-and-what-shows-them.md, 07-the-va-api.md, 08-approving-an-explorable.md, 12-prove-the-explorable-frame-in-browsers.md]
---

# Write the Explorables ADR and milestone

## Question

Write the Explorables ADR, superseding the spec's "Not planned" line on HTML with scripts and amending ADRs 0068 and 0089 where they say nothing runs or touches the page; update `CLAUDE.md`'s rule that nothing in project files runs; write the milestone in the spec with tasks whose interfaces are fixed.

Note for whoever writes it: the Spanish catalog's test (`app/src/i18n/catalog.test.ts`, `AVOIDED`) refuses "biblioteca", since "library" is avoided for a package. Q27 chose "biblioteca" for a script library, so the Spanish term is "biblioteca de JavaScript" (plural "bibliotecas de JavaScript"), admitted by an `unless` as other terms are.

## Resolution

Written on 2026-11-10 in the main session, after the user simplified exports: no explorable runs outside the app, so the read-only page, SVG, PDF and PNG hold its still picture or its card, and ADR 0041's page policy does not change.

- **[ADR 0107](../../adr/0107-an-explorable-is-an-html-page-a-package-defines-run-walled-off-after-approval.md)** gathers every decision of this map on explorables: the file and its package definition, what shows it, where it is live, the frame (the core's builder, a second loopback listener with a fresh `*.localhost` label per frame, its policy, messages and watchdog), the `va` API version 1, stills, approval with the chain Claude continues, script libraries (the npm registry only, single-file global builds in version 1, `script-libraries/`), writing and watching the file, and Claude's tools.
- **Decided by Claude under the user's delegation:** a tour step shows its explorable in the explorable panel; the one live explorable on the canvas turns still on Escape or when scrolled away; caps (512 KiB an explorable, 64 a package, 16 MiB a script library, 128 MiB a project, 1 MiB a message); a change from outside is recorded as the person's action "The file of <name> changed"; Import… and paste offer "As an explorable" beside "As a drawing"; ESM-only libraries such as three.js are refused in version 1; the Spanish "biblioteca de JavaScript".
- **Superseded and amended:** the spec's "Not planned" no longer excludes an explorable the person approves; ADR 0068 and 0089 gain a clarification; `CLAUDE.md`'s rule on project files names explorables and script libraries.
- **The milestone:** A10 · Explorables in `docs/spec-v0.1.md`, after A9, with its seam A10.0 and tasks A10.1 to A10.5.
