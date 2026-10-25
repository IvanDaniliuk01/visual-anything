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

## Clarifications

- 2026-10-25, while building identifiers, destinations and the element list (M8, W36):
  - **Identifiers.** A scheme matches `^[a-z][a-z0-9_-]{0,31}$`; an identifier is 1 to 200 characters without control characters; a thing holds identifiers in at most 32 schemes. Commands set them on a new element and on `define-component` and `define-relation-type`, and change them by scheme with `ids` in `update-element`, `update-component` and `update-relation-type`: a text sets one, `null` takes it out, and `null` for the whole takes them all out. A derived definition does not inherit them: what a component is in a catalog is not what the components derived from it are. Opening a project warns about elements that share an identifier in one scheme, which importers cannot tell apart.
  - **Search** matches an identifier, and `scheme:identifier`, ranked with ids. Claude's `find_elements` reads an attribute named `id:<scheme>` as asking for an identifier in that scheme, and `equals` as the identifier; the reads give `ids`, and `get_item` gives what each destination opens.
  - **Crosswalks** live in a package file as `crosswalks`, each `{ from, to, source?, entries }`, `entries` an object from one identifier to one, so that it diffs line by line. An importer's `matchByExternalIds` leaves out and reports what is not an identifier, fills in the schemes a file lacks forwards and, where one identifier alone maps to the one known, backwards, through as many tables as it takes, and never changes an identifier the file gives. It matches a planned element to the element of the project that shares one of its identifiers when exactly one does, each element at most once in an import, and reports the rest in the plan's `unmatched`.
  - **Which values are destinations.** The value of an attribute of type `destination`, its own or its definition's default; and the value of an attribute an element's or relation's definitions do not define, when it reads as a destination, so that one element can lead somewhere without a component of its own. The value of an attribute defined with another type never is one. Commands refuse, with `invalid-destination`, a value set on an attribute of type `destination` that is not a destination, and a default of that type that is not one; any value is read again strictly wherever it is followed.
  - **A web address** starts with `https://`, in lowercase, and has at most 2048 characters, no space, control character or backslash, and no user name or password; its host is a name of ASCII labels, or an IPv4 or IPv6 address, with an optional port. The dialog names the host in lowercase and shows the whole address as text, with Cancel taking the focus; before it opens, the browser's own `URL` must read the address as `https:` with the same host and no user name or password, so that nothing the two read differently opens. It opens with `window.open(url, '_blank', 'noopener,noreferrer')`.
  - **Another project** is named by a path relative to this project's folder, written with `/`, without `:`, a drive or a backslash, of at most 1024 characters, that never leads, through `..`, out of the folder holding this project's folder; its view is optional, and without one the project opens where it opens. The core checks the path lexically when it is stored. Live protocol 6 adds the app's `project/open-other` and the program's `other-project/opened`: the program resolves the path, follows every link with `realpath` and refuses a folder outside the one holding this project's folder, or one without a `.vaproject` file, then attaches to the program running on that folder through its Claude endpoint, as `visual-anything open` does (ADR 0044), or starts one there with `--no-open --stop-when-idle`, the executable starting itself; it checks the view there with `viewStateProblems` and asks it to open a tab at it. The dialog names the folder by its last part and the path from this project's folder.
  - **A view of this project** opens in the open tab through the view state, with the elements its destination focuses on selected and brought into sight. Focus mode is not turned on: it dims the rest, which a person reading on would have to end.
  - **The mark** is a small tab with an arrow in the bottom left corner of a shape whose element has a destination, drawn in the shape's colors with lines, so that it shows wherever the shape's body does. Rows, and shapes that draw their contents as rows, show none: their lines fill their body. Double-clicking it follows the first destination, also where the project cannot be changed; double-clicking elsewhere on the shape still edits its name. Alt+Enter on the selected shape follows the same destination, the shape's menu lists each one as Follow "…", and the inspector lists each with what it opens and Follow. "Enter on the mark" is these, since the mark is drawn on the canvas, which has no focusable parts.
  - **The checks on opening** flag, as `broken-destination`, a stored value of an attribute of type `destination` that is not one, a destination to a view the project does not have, and one that focuses on elements the model does not have, in the core; and, in the local program, a destination to a folder that holds no project, for the first 20 paths. A destination to a view of another project that it does not have is said only when it is followed: knowing it means opening that project.
  - **The element list** is a panel below the canvas, opened from the header. It lists what the open view shows, its scope included, or a component's elements, with those of the components derived from it unless Only this component is checked; World is never listed. Its columns are the name, the component when several are listed, every attribute the listed components define, in the order of the first that defines it, then the attributes only elements have, by name, then each scheme of identifiers. Pressing a column's header sorts by it, up, down, and back to the model's order; the filter keeps the rows whose cells, or one column's, hold every word typed. The grid follows the keys of a spreadsheet: the arrows, Page Up and Down, Home and End move; Enter, F2 or typing edits a cell, Enter and Tab commit and move, Escape cancels; Delete empties a cell, which takes out an element's own value or identifier; Space selects the row; Alt+Enter follows a destination. Each edit is one `update-element`; a block pasted from a spreadsheet, tab-separated, is one batch named "Paste N cells into the element list", of at most 50,000 cells, with what cannot be read said and the rest pasted; copying gives the selected rows, or the cell, as tab-separated text. Rows select their elements on the canvas and bring them into sight, and what the canvas selects is marked and brought into sight in the list. Only the rows in sight are drawn.
