---
label: wayfinder:task
title: Write the Explorables ADR and milestone
status: open
assignee:
blocked_by: [03-sandboxing-an-explorable.md, 04-libraries-beside-the-project.md, 05-capturing-an-explorable.md, 06-explorable-files-and-what-shows-them.md, 07-the-va-api.md, 08-approving-an-explorable.md, 12-prove-the-explorable-frame-in-browsers.md]
---

# Write the Explorables ADR and milestone

## Question

Write the Explorables ADR, superseding the spec's "Not planned" line on HTML with scripts and amending ADRs 0068 and 0089 where they say nothing runs or touches the page; update `CLAUDE.md`'s rule that nothing in project files runs; write the milestone in the spec with tasks whose interfaces are fixed.

Note for whoever writes it: the Spanish catalog's test (`app/src/i18n/catalog.test.ts`, `AVOIDED`) refuses "biblioteca", since "library" is avoided for a package. Q27 chose "biblioteca" for a script library, so the Spanish term is "biblioteca de JavaScript" (plural "bibliotecas de JavaScript"), admitted by an `unless` as other terms are.
