# Changelog

## Unreleased

### Views

- **Show views side by side** (#12). Press Beside on a view in the view list, or beside a destination that opens a view in the inspector, and the canvas splits into panes, up to three: a story beside the view of how its data is stored, or two cases to compare. Each pane keeps its own camera, filters and focus; drag the border between two panes, or move it with the arrow keys, and change or close a pane from its header. One pane is active, shown by its border: the inspector, the outline, search, export, Copy address, scenarios, tours and Claude's guidance follow it, and selecting an element highlights it in every pane that draws it. The panes come back when the tab reloads, and closing all but one gives you the single canvas again (ADR 0102).
- **File views in folders** (#11). The view list shows view folders you make, nested as deep as you want, in the order you choose: New folder… beside New view…, drag views and folders where they go, or move them from their settings. Folders open and close, and each person's browser remembers which are closed; a view no folder holds shows after them. Claude files views too, with `organize_views` (ADR 0101).
- **Give World's tree more room:** drag the divider under it in the Model tab, or move it with the arrow keys; double-click it to give the tree its own height again. Your browser remembers the height.

### The canvas

- **Copy and paste elements between views, and duplicate them** (#13). Ctrl+C copies the selection, from the canvas or the Outline; Ctrl+V shows the same elements in the open view, where the pointer is, adding them to its scope when it leaves them out, so renaming one renames it everywhere; when the view shows them already, they are selected and the canvas says so. Ctrl+Shift+V, or Paste as duplicates in the canvas's menu, makes new elements instead, with everything they hold and the relations among them, inside the container under the pointer; Ctrl+D, or Duplicate in the shape's menu, does it beside the selection. Notes, arrows and pictures are pasted as copies. Pasting what another project copied is refused, for now. Claude duplicates with `duplicate_elements` (ADR 0103).
- **Dragging an element that sits in several containers moves only the copy you grabbed** (#10). Each copy keeps its own place, so you can arrange them one by one; selecting it still highlights every copy, and moving it from the keyboard still moves them all (ADR 0007).

### Claude

- **Commands refuse what they do not take, and say what they take** (#14). A command Claude sends through `run_commands` with a key it does not take, such as a scope in `update-view`'s changes or `ids` in a delete, is refused, naming the keys it takes and, when another command sets it, which one, instead of doing the rest and dropping the key; so is a field left out or a value of the wrong kind. `update-free-shape` takes changes part by part, such as only a note's height, and no malformed command answers in JavaScript's words any more. The new `describe_command` gives each command's fields, which it needs, what each means and an example (ADR 0104).

## 0.1.2

### Pictures

- **Pictures and animated GIFs sit on the canvas like notes.** Drop a PNG, JPEG, WebP, GIF or SVG on the canvas, paste one with Ctrl+V, or press Picture… on the canvas toolbar. Move, align, resize and delete it as you would a note; resizing keeps its proportions unless you hold Shift (ADR 0098).
- **Its file is kept beside the project**, in `media/`, cleaned once and named by its content, so the same picture used twice is one file and git never conflicts on it. The inspector lists the files no picture names and removes them when you ask.
- **GIFs play** while they are on screen, and show their first frame under reduced motion until you point at them.
- **Exports carry them:** SVG, PDF and PNG show a GIF at its first frame, and the read-only page plays it. Claude adds pictures with `add_picture`.

### Tours

- **A step can mark what it explains in its own style** instead of with a halo on top (#9). A marked line gets twice as wide, in the highlight color, with a larger arrowhead and its dash kept, and its dash flows from its start to its end so its direction reads at a glance; its name is bold on a solid back. A marked shape gets a stronger border in its own color and a soft shadow, and breathes once as it arrives, keeping its fill and face in sight. Choose it for a whole tour or for one step; tours that don't choose keep their halos (ADR 0100).

### Restarts and new addresses

- **A tab rejoins by itself after the program restarts** on the same folder and port, without a new address, and says so. The session is kept in a record only your account can read, for a day without running at most (ADR 0099).
- **A new address is one command away:** `visual-anything address`, or `docker exec visual-anything visual-anything address` in Docker.
- **No more piles of tabs:** when Claude opens the app while a tab is connected, that tab is asked to come forward instead of another one opening.

### The side panel

- Every tab of the side panel scrolls sideways when it is narrow, and the outline and World's tree scroll to their longest name instead of cutting it.

### Docker

- The account the container runs as now comes from `VISUAL_ANYTHING_UID` and `VISUAL_ANYTHING_GID`: bash keeps `UID` read-only, so the old command failed (#7).
- The image names its commit and version in its labels, and is published as `v0.1.2` and `sha-<commit>` beside `latest` (#6).

### Worth knowing

- Views that hold pictures, and tours that choose an emphasis, open only in 0.1.2 and later. The live connection's version goes from 9 to 10.

## 0.1.1

### Tours

- **Each caption is placed where it reads best.** While a tour plays, drag a step's caption anywhere on the screen, and drag its sides or corners to make it wider, taller or both. The step keeps its place and size as proportions of the screen, so it fits other screens too (ADR 0095, ADR 0096).
- **Captions take a look of their own**, written in the same HTML and CSS subset as a component's face: `{{name}}` is the title, `{{text}}` the text, and `{{step}}` and `{{steps}}` say where the step is. A tour can give every caption one look, and each step can have its own (ADR 0096).
- **A caption's line to what it explains** can be straight, have one right-angled turn or curve. It can end in a dot, an arrow or nothing, and leave the caption from any of its sides (ADR 0097).
- **The tours panel** scrolls, and offers the caption's corner, look, size and line under each step.

### Lines

- A route drawn by hand no longer folds back over itself, and bend points that no longer turn the line lose their handles. This includes bend points a fraction of a unit away from where the line enters a shape (ADR 0039).

### Docker

- **An image runs the program in a container**, with your projects in a folder of your own and its port open only to this computer (ADR 0094). The README's "Run it in Docker" says how.

### Worth knowing

- Tours that use a caption's new place, size, look or line open only in 0.1.1 and later. The live connection's version goes from 8 to 9.

## 0.1.0 — the first public version

Visual Anything turns a model of a concept or a system into views you can explore. It runs on your own computer: a local program serves the app on 127.0.0.1 and keeps your project as plain JSON files in a folder you can put under git. Claude works on the same model through MCP.

### What it does

- **A model first, views after.** Elements come from components, and relations from relation types, in packages. Each view shows part of the model and arranges it automatically. A shape you move by hand stays pinned.
- **A canvas made for large models.** It pans, zooms and selects at 60 fps with 10,000 elements in a view. Containers collapse and expand, and the canvas shows less detail as you zoom out. Lines go around shapes, and you can route any line by hand.
- **Built-in worlds, each with a sample project:**
  - systems architecture and C4;
  - data science and machine learning;
  - data modeling, with whole databases and SQL DDL export;
  - processes;
  - physical AI, with robot arms, joints and motion;
  - healthcare;
  - finance.
- **Scenarios and tours.**
  - Scenarios play a sequence of steps over a view, with decisions between alternatives.
  - Tours guide a viewer through views step by step, with captions and shapes gliding to their new places.
- **Simulation.** A programmable component simulates its behavior tick by tick, in a sandbox, within limits it cannot exceed.
- **Physical space.** A component can draw a 3D solid inside its shape. A panel beside the canvas shows elements where they really are, and turning a joint moves everything it carries.
- **Packages that extend the app.** Packages add actions, importers, exporters and panels. Their code runs sandboxed in QuickJS, and only after you approve it by its hash.
- **The format panel.** Style, Text and Arrange tabs set colors, gradients, borders, fonts, rotation and more, for one shape or many.
- **Versions.**
  - Compare a view between git commits, in the app or for a pull request.
  - Review Claude's changes before they apply.
  - A git merge driver merges project files by id and keeps conflicts as data.
- **Exports.** SVG, PDF, PNG, Mermaid, Structurizr and a read-only HTML page that connects nowhere. Imports read draw.io, LikeC4 and Structurizr files.
- **English and Spanish**, light and dark themes, and full keyboard use.

### Worth knowing if you used an earlier build

- **A shape's text block now sits in its middle by default** (ADR 0082). The block is the name together with the detail. A component can still place it at the top or the bottom ("Where its text sits").
- **Clean is the look of every project that sets no drawing defaults** (ADR 0086). It has thin neutral lines, small arrowheads, 1-wide borders, rounded corners and no shadows. A project can choose another look in its drawing defaults.

### Known limits

- Layout of a view with 10,000 elements takes longer than its 20-second budget.
- A few benchmarks were recorded but do not meet their marks on modest machines.
- Lines and automatic layout are next in line for polish (ADR 0092).
