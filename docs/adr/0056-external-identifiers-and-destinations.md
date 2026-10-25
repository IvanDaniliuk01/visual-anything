---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# External identifiers name what an element stands for elsewhere; destinations open a view, a project or a web address

M8 brings two kinds of reference out of the project:
- external identifiers (benchmark R13), which say what an element is in someone else's catalog, such as `UBERON:0002135` for the mitral valve;
- destinations (R40), values that open something when followed.

## External identifiers

- **Where they live.** Elements, components and relation types gain an optional `ids` map from a scheme to an identifier, such as `{ "uberon": "UBERON:0002135", "fma": "FMA:7235" }`.
  - Schemes are short lowercase names.
  - Identifiers are text of at most 200 characters.
  - They are data, never followed.
- **What they are for:**
  - search finds by them (R25);
  - Claude's `find_elements` takes `id:<scheme>` (as `id:uberon`);
  - importers match by them, so that importing again updates, as ADR-0042's key does;
  - the read-only page shows them.
- **Crosswalks** are tables that map one scheme to another, shipped with starter packages as data under ADR-0047's licenses, and used by importers to fill in the schemes a file lacks.

## Destinations

- **A new attribute type, `destination`.** Its value is one of:
  - **a view of this project:** `{ "view": "<id>", "focus": ["<id>"] }`. Ids are kept, so it survives renames, and it opens in the open tab, focused, as Structurizr opens a view on double-click.
  - **a view of another project:** `{ "project": "<relative path>", "view": "<id>" }`.
    - The local program resolves the path against the project folder, and refuses one outside the folder's parent.
    - It opens that project in a tab of its own program (ADR-0044), with the view state.
    - The tab asks first, naming the folder.
  - **a web address:** `{ "url": "https://…" }`, only `https:`.
    - It is shown as text with its host.
    - It opens only on a click, after a confirmation that names the host, in a new tab with `noopener` and `noreferrer`.
    - Nothing ever fetches it.
- **Following one.** On the canvas, a shape with a destination attribute shows a mark. Double-click on it, or Enter on the mark, follows it. The inspector lists an element's destinations.
- **Checks.** Opening a project warns about a destination whose view or project is missing; such a destination is kept and flagged, as broken steps are.

## Considered options

- **External identifiers as ordinary string attributes** (today's convention): kept working, but a map makes search, importers and crosswalks exact, and keeps attributes for the model's own data.
- **Any URL scheme:** rejected. Only `https:` opens. `file:`, `javascript:` and custom schemes are refused when stored.
- **Opening another project in the same program:** rejected. One program owns one project's model and history (ADR-0016, ADR-0044).

## Consequences

- The schema gains `ids` and the `destination` attribute type, with their checks.
- The local program gains a request to open another project at a view state, with the path check.
- The app gains the destination mark, the confirmation and search by identifier.
- CONTEXT.md gains **External identifier**, **Crosswalk** and **Destination**.
