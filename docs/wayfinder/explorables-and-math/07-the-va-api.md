---
label: wayfinder:grilling
title: What the va API hands an explorable
status: closed
assignee: claude
blocked_by: [03-sandboxing-an-explorable.md]
---

# What the va API hands an explorable

## Question

What exactly does an explorable receive, and when: the shape of `va.data` (attributes, computed and live values, relations and neighbors, the scenario or tour step, the theme, its size, the language), the notice when something changes, the state a tour step sets, and what it may say back (only console errors and its picture)? How is the API versioned so an old explorable keeps working?

## Resolution

Grilled with the user on 2026-11-10 (Q28 to Q35); the user took every recommendation.

- **Q28, what of the model it reads.** An explorable shown by an element (through its own appearance or its component's) receives that element, with its name, component, description and attributes, their computed and live values; what it contains, one level down; and its relations, each with its type, direction and the element at the other end with that element's attributes. At most 500 elements in all.
- **Q29, attribute definitions come too:** each attribute's kind, unit, label and range beside its value, so one component's explorable can label axes for elements with different data.
- **Q30, a loose explorable may be bound to an element,** chosen in the inspector, and then reads what Q28 says; unbound, it reads only the theme, the language, its size and its parameters. The `explorable` free shape of [How explorables are kept and named by what shows them](06-explorable-files-and-what-shows-them.md) gains an optional `element`.
- **Q31, parameters are declared.** An explorable's definition lists its parameters (name, kind, range and default, such as `slope: number from -5 to 5`); a tour step sets them through a form, Claude knows what it may set, and the core checks the values. A step that sets a parameter the explorable no longer declares is a broken step, as scenario steps are. Parameters are kept by the tab, never in the model (Q14); `CONTEXT.md`'s **Parameter** now covers them.
- **Q32, a change sends everything again:** `va.on('change', data => …)` with the whole data, at most once a frame.
- **Q33, what it says back:** `va.ready()`, its still (with `va.onStill` for WebGL), its console errors, and `va.select(id)`, which selects on the canvas one of the elements it received. Selecting changes no model, so Q4's "reads, never writes" holds.
- **Q34, theme and language.** The theme's colors reach the frame as CSS variables (`--va-text`, `--va-surface`, the accents and the rest), and `va.data.theme` says light or dark; `va.data.language` is `en` or `es`.
- **Q35, versioned.** The definition declares `api: 1`, and the program keeps serving version 1's shape when later versions come; adding fields keeps the version, removing or renaming one makes a new version.
- **What the channel carries** is ticket 03's: one transferred `MessageChannel` port, plain data, every message checked and capped by the core (`core/src/explorables/messages.ts`).
