# Final design: stacking order per view, and putting shapes inside containers from the canvas

ROOT = `.claude/worktrees/m2-canvas` (branch m2-canvas, HEAD 03ed1d9). I checked every fact below against that worktree. It includes the merged keyboard-navigation and outline work (a60dcb9) and its follow-up f9690b2. In the follow-up, `[` and `]` typed with AltGr (Ctrl+Alt on Windows) step through relations, and `.` and `,` do the same on every keyboard.

Branch m2-fixes (e983c0b) is checked out in `.claude/worktrees/m2-color-code`. It is two commits ahead of m2-canvas and is not merged. It does the following:
- deletes `drawScene`, `DrawnScene` and `SceneCanvas.ts`;
- rewrites `draw.test.ts` and `carriedKeys`;
- has `createAtCommand` store its position without `pinned`;
- changes `schema/src/files.ts` (one doc comment), `model.schema.json`, `shell/inspector.css`, `shell/inspector/controls.tsx`, `AppearanceSection.tsx`, `Inspector.test.tsx`, `outlineItems.test.ts`, ADR-0019, `spec-v0.1.md` and `CLAUDE.md`.

Step 0 (§7) merges it first. Every statement below holds after that merge. Section 7 lists every file with its absolute path.

**Base.** This design takes Proposal 2's core and storage. It takes the UX from Proposal 3:
- captions;
- Alt to move only;
- an outline of the container being left;
- buttons that are disabled with a reason;
- a keyboard path through the context menu and the inspector;
- the dropped shapes staying visible while the dialog is open.

It takes the conservative scope on copies from Proposal 1. It adds the fixes all three judges asked for, and the review's fixes listed in the appendix.

One structural change from all three proposals: `Scene.shapes` stays in **containment order**, and the drawing order becomes a separate permutation, `Scene.drawing`. Several things read `scene.shapes`: the outline, keyboard navigation, relation attachment and `byElement[0]`. Most of them live in files another subagent owns. With this change none of them change meaning, and the outline never reorders when the stacking order changes.

---

## 1. The user's problem and what changes

**What happened (verified in code).**
- The user created **Calendar** from the toolbar, directly in World. Its component is `clinic.calendar`, which derives from `systems.database`: a cylinder of 180 × 80.
- The user then dragged it over **Clinic booking**. A drag only writes positions (`moveCommand` in `gestures.ts` sends `set-positions`), so Calendar stayed directly in World.
- `renderer.ts` groups element shapes by nesting depth, computed as `shape.key.split('/').length - 1`. It keeps one PixiJS container per depth and draws them in increasing depth, so every depth-0 shape is drawn under every depth-1 shape. Calendar, at depth 0, was therefore drawn under Scheduling (depth 1, opaque fill) and its contents. Within one depth, tile order follows edit history, because a rebuilt tile is appended at the end.
- `hitAt` in `hit.ts` takes the last shape in `scene.shapes` whose rectangle holds the point. Calendar was created last. So a click on Scheduling, where Calendar lies hidden underneath, selects Calendar.
- Nothing stores which overlapping shape is in front, and no gesture changes containment. `add()` in `CanvasArea.tsx` nests a new element only into a selected shape that already holds contents.

**What changes.**
1. **One drawing order, drawn and pointed at exactly.**
   - Two shapes overlap when their insides share a point. Shapes that only touch do not overlap.
   - The scene computes a drawing order: a container before its contents, its contents before its next sibling, and siblings in the view's stacking order.
   - The renderer draws that order exactly, in *bands* of shapes that do not overlap.
   - Hit testing picks the last shape in that order whose drawn outline holds the point, which is the shape drawn on top.
   - This alone draws Calendar in front of Clinic booking and everything inside it, exactly where clicks already land.
2. **Stacking order.** Each view keeps a stacking order per container, and one for World. One core command, `restack`, changes it: bring to front, bring forward, send backward, send to back. It is reached from a toolbar group, from shortcuts that work wherever the focus is outside text entry, from a shape menu and from the inspector.
3. **Containment from the canvas.** One core command, `change-container`.
   - Dropping shapes onto a container puts them inside it.
   - Dragging shapes clear of their container, to where no container is under the pointer, takes them out. While a dragged shape still overlaps its container, it stays inside and the container grows, as today.
   - A caption says what will happen before the user releases, including when the shape will land behind another.
   - Holding Alt (⌥) only moves.
   - "Add element" creates the new element inside the selected element when that element holds contents. Otherwise it creates it next to the selected element, inside the container that element sits in. `Add inside "X"…` in the shape menu and the inspector puts the next element inside any element, even an empty one.
   - The shape menu and the inspector offer Put inside, Move to and Take out from the keyboard, for shapes directly in World too.

---

## 2. Terms

### CONTEXT.md: entries to paste

Under **Canvas and views**, after **Pinned shape**:

```markdown
**Stacking order**:
The order, kept per view, in which the shapes that sit directly in one container, or directly in World, are drawn, from back to front. Every copy of a container draws its contents in the same order. A shape is drawn together with everything inside it, so a container's contents are always in front of it, and a shape is in front of or behind a whole container, never between it and its contents. Relations, then free shapes, are drawn in front of every element's shape. A new element is drawn in front of the shapes beside it, and an element put inside a container from the canvas comes in front there.
_Avoid_: layer, z-order, z-index, depth, level
```

Replace **Container** with:

```markdown
**Container**:
An element that holds other elements, its contents, through a nesting relation type. An element can have several containers.
_Avoid_: parent, group, folder
```

Replace the definition line of **Outline**, keeping its _Avoid_ line:

```markdown
The open view written out as a list, shape by shape: what sits directly in World, then what sits inside each container, in the model's order whatever the stacking order, with the relations drawn from each shape. It can be read and moved through from the keyboard, and it follows the selection.
```

Replace **Edit** with:

```markdown
**Edit**:
To change the model or the canvas: create, move, put inside or take out of a container, connect, change the stacking order, delete.
```

### Words

- **User-facing copy (exact):** Stacking order (the toolbar group's label), Bring to front, Bring forward, Send backward, Send to back, Put inside "X", Put inside…, Move into "X", Move to…, Take out of "X", Take out, Directly in World, Add inside "X"…, Moves only, Hold still to put inside "X", Cannot put inside "X", Lands behind "X", Under the pointer, Select "X".
- **"Depth" ("profundidad") gets no term.** It is containment: Container, contents, nesting relation type, sits directly in World.
- **Banned words.** These words never appear in what users or Claude read, and never in a new identifier: layer, depth, level, z-order, z-index, parent, child, children, group, node, edge, link, reparent, hierarchy, root.
  - "What users or Claude read" means UI text, project files and their fields, command fields, MCP tools, CONTEXT.md, the ADR and the spec.
  - Existing code and existing terms stay as they are. That covers the renderer's `level`, `shapeLayer`, `relationLayer`, `freeLayer` and `dragLayer`, core's `parent` in `packageUsers`, and the CONTEXT.md term Abstraction level.
  - Never call a container a "box": Box is a component, and box selection is a gesture.
- **New identifiers that would otherwise use banned words:**
  - the scene layout's `inWorld` (the indexes of the shapes directly in World) and `contents` (by scene index);
  - `PlannedTile` and `plannedTiles` in `tiles.ts`;
  - "moving shapes" for what a drag takes along (the existing `movingShapes`).
- **Internal word "band".** It appears only in `hit.ts`, `tiles.ts` and `renderer.ts`, and never reaches files or the UI. The renderer's `depthLayers` is replaced by `bands`.
- **"zIndex" stays only in the schema tests**, as the stray unknown key in `format.test.ts` and `arbitraries.ts`. It never becomes a real key.

---

## 3. File format

### packages/schema/src/files.ts

In `ViewFile`, declare the new field last, after `freeShapes`:

```ts
  positions: ShapePosition[];
  freeShapes: FreeShape[];
  /**
   * The order in which this view draws the anchored shapes that sit directly inside each container,
   * or directly in World, by the id of the container, or World's id. Each list goes from back to front:
   * the shapes it does not name are drawn in front of the ones it names, in model order, so without a
   * list every shape there is drawn in model order and a new shape comes in front. Every copy of a
   * container draws its contents in the same order. An id whose element does not sit there is ignored.
   */
  stackingOrder?: StackingOrder;
}

/**
 * Stacking lists by the id of the container whose contents they order, or World's id for the shapes
 * directly in World.
 *
 * @minProperties 1
 */
export type StackingOrder = Record<Id, StackingList>;

/**
 * Element ids, from back to front.
 *
 * @minItems 1
 * @uniqueItems true
 */
export type StackingList = Id[];
```

`ShapePosition` does not change.

**JSON example.**
- Calendar (id `calendar-k3f9q2`) was dropped onto Clinic booking.
- Then Scheduling was sent to the back inside Clinic booking.
- Then Patient was brought to the front in World.

```json
  "freeShapes": [ … ],
  "stackingOrder": {
    "clinic-booking": [
      "scheduling"
    ],
    "world": [
      "clinic-booking"
    ]
  }
```

How to read it:
- WhatsApp, Booking agent and Calendar are not listed, so they are drawn in front of Scheduling, in model order. Calendar was the newest there, so its drop wrote no list.
- Patient is not listed, so it is drawn in front of Clinic booking.

The same drop also wrote this relation in `model.vamodel`:

```json
{ "id": "is-part-of-x7p2m9", "relationType": "systems.is-part-of", "from": "calendar-k3f9q2", "to": "clinic-booking" }
```

and this position in the view:

```json
{ "element": "calendar-k3f9q2", "container": "clinic-booking", "x": 70, "y": 300, "pinned": true }
```

**Rules.**
- **Default.** When the field is absent, everything is drawn in model order, exactly today's scene order. No migration and no `schemaVersion` change are needed.
- **Key.**
  - A list's key is the container *element's* id, never a shape key, so every copy of a container shares one order (as with positions, ADR-0019).
  - World's key is `model.world.id`. That is the only way to say World, so World has one canonical key.
  - In commands, an absent container, or a container equal to World's id, means World.
- **Shortest lists, not canonical files.**
  - Each restack and each change of container writes the shortest list that gives the order it leaves (§4.2).
  - The first time an older shape comes in front of newer ones in a container, the list names every shape drawn behind it there. That happens by Bring to front, by Bring forward past a newer shape, or by putting the shape in or taking it out from the canvas. Later changes in that container add or remove single ids.
  - A delete removes only the deleted ids, and containment changes made outside `change-container` write nothing. So a list can name more ids than it needs, or stale ids, until it next changes.
  - Send to back followed by Bring to front leaves no list when the shape is the newest there. For an older shape, it leaves the list of the shapes drawn behind it.
- **Absent and empty mean the same.** `@minProperties 1` and `@minItems 1` forbid `{}` and `[]` in files. The operation layer deletes an emptied list's key, then the field (§4.1).
- **Key order.** `stackingOrder` is the last key of a view, because `files.ts` declares it last. Its own keys are free-form, so `formatFile` writes them sorted by UTF-16 code units. Lists keep their order, one id per line.
- **Generated schema.** After `pnpm build`, `schemas/view.schema.json` gains two definitions, and the regenerated file is committed:
  - `StackingOrder`: an object with `minProperties: 1`, `additionalProperties: { "$ref": "#/definitions/StackingList" }`, and `propertyNames` carrying the Id pattern. ts-json-schema-generator 2.9.0 copies an annotated key alias's annotations into `propertyNames` (`MappedTypeNodeParser`), and Ajv checks property names as strings, so strict types hold.
  - `StackingList`: an array of `Id` with `minItems: 1` and `uniqueItems: true`.
- **What the new keyword touches.** `generate.test.ts` already accepts maps (Attributes is one), and `format.ts` needs no change. The schema now uses `propertyNames` for the first time, which brings two small changes:
  - `format.test.ts` adds it to `IDLE_KEYWORDS`, the keywords that cannot change the order of keys. Without that, "use only keywords that formatFile reads or that cannot change the order of keys" fails.
  - `packages/schema/src/validate.ts` gains messages for `minProperties` (`must not be empty`) and `propertyNames` (`must have ids as its keys`).
- **Reading code** reads a list with `Object.hasOwn(order, key) ? order[key] : undefined`, because `constructor` is a valid id. It builds maps with `Object.fromEntries`.

Schema tests:
- `format.test.ts`: the view key-order test ends with `stackingOrder`; map keys are written sorted; lists keep their order.
- `validate.test.ts`: validation refuses `{}`, `[]`, a repeated id, a key that is not an id and a non-string item, each with its message.
- `test/arbitraries.ts`: the view arbitrary sometimes adds a `stackingOrder` with 1 to 3 keys and lists of 1 to 4 unique ids, never empty.

---

## 4. Core

### 4.1 Operations

File: `packages/core/src/operations.ts`

Changes:
- `Collection` gains `| { name: 'stackingOrder'; view: Id; container: Id }`, where `container` is the map key (World's id for World).
- `CollectionItems` gains `stackingOrder: Id`. Items are bare ids.
- `keyOf`: `positions` → `positionKey`; `stackingOrder` → the id itself; otherwise `item.id`.
- `itemsOf`: `const order = findView(state, view).stackingOrder; return order !== undefined && Object.hasOwn(order, container) ? order[container] : [];`
- `withItems`:
  1. `rest = Object.fromEntries(Object.entries(view.stackingOrder ?? {}).filter(([key]) => key !== container))`.
  2. `next = items.length === 0 ? rest : { ...rest, [container]: items }`.
  3. If `next` has no keys, return the view *without* the `stackingOrder` key (destructure it out). Otherwise return `{ ...view, stackingOrder: next }`.
  - The field is never set to `undefined`. That keeps exact undo intact, and so the server's "unchanged" check, which uses `isDeepStrictEqual`.
- `ViewProperties = Omit<ViewFile, 'positions' | 'freeShapes' | 'stackingOrder'>`.
- `set-view`: destructure `{ positions, freeShapes, stackingOrder, ...previous }` and rebuild as `{ ...operation.properties, positions, freeShapes, ...(stackingOrder === undefined ? {} : { stackingOrder }) }`. Without this, every update-view (a rename, for instance) would silently drop the orders.
- `describe`: `The stacking order of "${container}" in view "${view}"`.
- No new operation kind is needed:
  - `insert` into a missing list creates it.
  - `remove` of the last id deletes the key, then the field.
  - `replace-all` with `[]` does the same.
  - Every inverse is exact by construction.

In `packages/core/src/commands/views.ts`:
- `viewProperties()` also deletes `stackingOrder`.
- `upsert`'s key function gets the `stackingOrder` branch.
- `putPositions` checks containment against `nestingTypesInView(draft.state, view)` (§4.4) instead of the view's raw list. The canvas and the core then agree on which relations place a shape.
- Move `BULK = 200` to `commands/draft.ts` as an export, and import it here and in the new files.

### 4.2 Stacking helpers

New file: `packages/core/src/stacking.ts`, exported from `index.ts`.

```ts
/** The key of a stacking list: the container's id, or World's id for the shapes directly in World. */
export function stackingKey(worldId: Id, container: Id | undefined): Id;

/**
 * The elements whose shapes sit directly inside `container` in a view, or directly in World when it is
 * absent or World, in model order. Inside a container: the elements with a relation of one of the
 * view's nesting relation types (`nestingTypesInView`) to it. In World: the elements with no such
 * relation to another element.
 */
export function contentsInView(state: ProjectSnapshot, view: ViewFile, container: Id | undefined): Id[];

/** Items in stacking order, back to front: those `stored` names, in its order, then the others in the order given. */
export function orderByStacking<T>(items: readonly T[], idOf: (item: T) => Id, stored: readonly Id[] | undefined): T[];

/** The order a view draws the shapes directly in a container, or in World, back to front, with live ids only. */
export function stackingOrderOf(state: ProjectSnapshot, viewId: Id, container?: Id): Id[];

/** The list to store for an order: the shortest one that gives it. */
export function stackingListFor(order: readonly Id[], rankOf: (id: Id) => number): Id[];

/** The operations that turn a stored list into the next: single-id removes, then inserts; one replace-all above BULK changes. */
export function stackingOperations(collection: Collection, stored: readonly Id[], next: readonly Id[]): Operation[];
```

**`contentsInView`**
- It agrees exactly with `containmentTree` built with the same relation types, on every project that keeps the rules. A property test checks this.
- Inside container C:
  1. Filter `modelIndexOf(state).relationsOn(C)` to relations with `r.to === C`, a type in `nestingTypesInView(state, view)`, `r.from !== C`, and `r.from` an element other than World.
  2. Remove duplicates, then sort by model rank.
- In World: one pass over `model.relations` marks every element that has such a relation to a known element other than World or itself. The contents are the unmarked `model.elements`.
- Model ranks come from a `WeakMap<Element[], Map<Id, number>>`.
- It never calls `indexModel` with the view's own set. The index cache holds one entry per model, so a different set would evict it.

**`orderByStacking`**
- Build `Map<id, index>` from `stored`.
- Listed items go first, by index. Unlisted items follow, in the order given. Stored ids that are not among the items are skipped.
- Cost: O(items + stored).

**`stackingListFor(D)`**
- Find the smallest `k` such that `D[k..]` is strictly increasing in model rank, and return `D.slice(0, k)`.
- This is correct because unlisted contents are drawn after the listed ones in model order, so they reproduce exactly `D[k..]`.
- When an older shape moves in front of newer ones, every shape before it in D is listed. §3 and ADR-0021 say so.

**`stackingOperations(stored, next)`**
1. If the lists are equal, return `[]`.
2. Map each stored id that is in `next` to its index in `next`. The longest increasing subsequence of those indexes is the set of ids kept.
3. Changes = removes + inserts = |stored| + |next| − 2·|kept|.
4. If changes > `BULK`, return one `replace-all` with `next`.
5. Otherwise, `remove` every stored id not kept, in stored order. Then `insert` every `next[i]` not kept, at index `i`, in increasing `i`. After the removals the list holds the kept ids in `next`'s order, so each insert lands where `next` wants it.

### 4.3 Command `restack`

In `packages/core/src/commands/types.ts` (added to the `Command` union):

```ts
/** An anchored shape, by its element and the container its shape sits in; none, or World's id, when it sits directly in World. */
export interface StackedShape {
  element: Id;
  container?: Id;
}

/** Where a shape goes among the shapes beside it: the front, the back, or just in front of or behind one of them. */
export type StackingPlace = 'front' | 'back' | { inFrontOf: Id } | { behind: Id };

/** Changes the order in which a view draws shapes that sit together, one move after another, as one action. */
export interface RestackCommand {
  type: 'restack';
  view: Id;
  moves: { shape: StackedShape; to: StackingPlace }[];
}
```

Implement it in a new file, `packages/core/src/commands/stacking.ts`, and dispatch `case 'restack'` from `commands/index.ts`.

**Validation.** All or nothing, with existing problem codes only.

| Check | Code | Message |
|---|---|---|
| The view exists | `unknown-view` | (draft.view) |
| `moves` is a non-empty list | `invalid-command` | No moves were given. |
| The element exists | `unknown-element` | (draft.element) |
| The element is not World | `world-not-allowed` | World has no shape; it is the canvas itself. |
| A `container` other than World is an element | `unknown-element` | (draft.element) |
| The element sits directly there (`contentsInView`, memoized per key) | `unknown-position` | "X" does not sit inside "C" in the view "V". / "X" does not sit directly in World in the view "V". |
| The (key, element) pair is not repeated | `invalid-command` | "X" is moved twice. |
| `to` has one of the four forms | `invalid-command` | A move goes to "front", "back", { inFrontOf } or { behind }. |
| The reference is not the element itself | `invalid-command` | "X" cannot go in front of or behind itself. |
| The reference sits in the same place | `unknown-position` | "Y" does not sit inside "C" in the view "V". |

**Semantics.** For each key, in order of first appearance:

```
D      = orderByStacking(contentsInView(key), id, stored(key))  // live ids only
before = D
for each move on this key, in command order:
    remove the element from D; then
    front → push; back → unshift; inFrontOf y → insert right after y; behind y → insert right before y
if D equals before: nothing for this key
else: operations += stackingOperations({ name: 'stackingOrder', view, container: key }, stored(key), stackingListFor(D))
```

- When nothing changes, the command emits no operations, and the server records nothing (ADR-0020).
- A rewritten list drops stale ids, because the new list holds live ids only.
- The command uses no geometry, so Claude can call it by id in M4.

**Labels.**

One move:
- `Bring "X" to the front in "V"`
- `Send "X" to the back in "V"`
- `Bring "X" in front of "Y" in "V"`
- `Send "X" behind "Y" in "V"`

Several moves:
- all `front`: `Bring N shapes to the front in "V"`
- all `back`: `Send N shapes to the back in "V"`
- all `inFrontOf`: `Bring N shapes forward in "V"`
- all `behind`: `Send N shapes backward in "V"`
- otherwise: `Change the stacking order of N shapes in "V"`

### 4.4 Command `change-container`

In `types.ts`:

```ts
/**
 * Puts elements inside a container in a view, or takes them out of the containers their shapes sit in,
 * as one action. Each element whose shape leaves a container loses the relations of the view's nesting
 * relation types from it to that container, with the relations that end on them. It then sits inside
 * `to` through one relation of a nesting relation type, unless it already does, and comes to the front
 * of the stacking order there. A shape whose `from` equals `to` only gets its position.
 */
export interface ChangeContainerCommand {
  type: 'change-container';
  view: Id;
  /** The container the shapes go into; absent, or World's id, to take them out to World. */
  to?: Id;
  /**
   * The nesting relation type that puts them inside `to`. By default, for each element: the type of
   * the relations that placed it where it was, when they are all of one type, however many; otherwise
   * the view's first nesting relation type.
   */
  relationType?: Id;
  shapes: {
    element: Id;
    /** The container its shape sits in now; absent, or World's id, when it sits directly in World. */
    from?: Id;
    /**
     * Where its shape goes, relative to the shape of `to`, or to the canvas in World; kept as a pinned
     * position. Without it, a position stored there before is used, or layout places the shape.
     */
    at?: { x: number; y: number; width?: number; height?: number };
  }[];
}
```

The implementation goes in a new file, `packages/core/src/commands/containers.ts`, with `case 'change-container'` in the dispatcher. That file also exports the preview:

```ts
/** What a change of container deletes, and whether the core would refuse it. */
export interface ContainerChangePreview extends DeletePreview {
  /** The nesting relations it deletes. */
  leaving: Id[];
  /** Those of them that have a name, a description or attributes of their own. */
  withData: Id[];
}
export function previewChangeContainer(state: ProjectSnapshot, command: ChangeContainerCommand): ContainerChangePreview;
```

`previewChangeContainer` runs `changeContainer` on a throwaway `Draft`, with `randomIds()` and the state left untouched. It catches `Rejection`, and catches `TypeError` as `invalid-command`, exactly as `executeCommand` does, and takes the problems from there. So the preview and the command can never disagree, cycles included. It computes `leaving` with `leavingRelations` on the given state, for every shape whose `from` differs from `to`. It returns `{ ...previewDelete(state, { relations: leaving }), leaving, withData, problems }`, merging the problems of both. Running the command directly on a `Draft` avoids an import cycle through `executeCommand`.

The rules for which types arrange a view, which relations a shape leaves, and the default type live in a new file, `packages/core/src/containers.ts`, exported:

```ts
/**
 * The nesting relation types a view is arranged by: those it lists that a package in use defines and
 * that nest, in its order. The others, which checkProject reports as warnings, arrange nothing.
 */
export function nestingTypesInView(state: ProjectSnapshot, view: ViewFile): Id[];

/** The relations of the view's nesting relation types that place an element inside `from`; none for World. */
export function leavingRelations(state: ProjectSnapshot, view: ViewFile, element: Id, from: Id | undefined): Relation[];

/**
 * The nesting relation type that puts an element inside a new container: the type of `leaving` when
 * they are all of one type, otherwise the view's first nesting relation type; undefined when the view
 * has none.
 */
export function nestingTypeFor(state: ProjectSnapshot, view: ViewFile, leaving: readonly Relation[]): Id | undefined;
```

`nestingTypesInView` is the one rule for every consumer: `contentsInView`, `putPositions`, `buildScene` (§5.1), `createAtCommand` and `createInsideCommand` (§6.6), and the drop plan (§6.4). The view's types are therefore always a subset of the model's nesting relation types. Containment never forms a cycle across all of those (ADR-0019), so the model-wide cycle check covers every view.

**Validation, in order.**

| Check | Code | Message |
|---|---|---|
| The view exists | `unknown-view` | (draft.view) |
| `shapes` is a non-empty list | `invalid-command` | No shapes were given. |
| `to` (when not World) is an element | `unknown-element` | (draft.element) |
| A given `relationType` is defined (`draft.relationType`) | `unknown-relation-type` | (draft.relationType) |
| It nests | `not-nesting` | The relation type "T" does not nest. |
| It is one of `nestingTypesInView` | `not-nesting` | The view "V" is not arranged by "T". |
| Each element exists | `unknown-element` | (draft.element) |
| No element is World | `world-not-allowed` | World has no shape; it is the canvas itself. |
| A `from` other than World is an element | `unknown-element` | (draft.element) |
| The element sits directly in `from` (`contentsInView`) | `unknown-position` | "X" does not sit inside "A" in the view "V". / "X" does not sit directly in World in the view "V". |
| The (element, from) pair is not repeated | `invalid-command` | "X" is given twice from "A". |
| No element is given `at` twice | `invalid-command` | The position of "X" is given twice. |
| `at` coordinates are finite; width and height positive | `invalid-command` | (requireNumber) |
| No element is given `to` equal to itself | `containment-cycle` | "X" cannot go inside itself. |
| When some element enters an element `to`, `nestingTypesInView` is not empty | `not-nesting` | The view "V" is arranged by no relation type that nests, so nothing can be put inside anything in it. |

**Steps, on one draft.** The model index is built three times in total, whatever the number of shapes: before the deletes, after them, and after the inserts (for the positions).
0. **Elements.**
   - Take the shapes by element, in order of first appearance.
   - An element *enters* when one of its shapes has a `from` that differs from `to`.
   - Its *leaving relations* are the union of `leavingRelations` over those shapes. There are several when two of the view's types, or two of its containers, place it there.
1. **Leave.** If any leaving relations were collected, run the deletion that `delete { relations: leaving }` runs: `previewDelete` on the draft, then the removals. Cascades happen and broken steps are kept. Extract that part of `deleteTargets` in `commands/model.ts` into `applyDeletion(draft, preview)`, so both commands share it.
2. **Merge or check cycles.** When `to` is an element, read `draft.index` once, after the deletes. For each entering element E:
   - If E already sits inside `to` under one of `nestingTypesInView`, it needs no new relation.
   - Otherwise, if `wouldFormCycle(index, E, to)` holds, refuse with `containment-cycle` and subjects [E, T]. `wouldFormCycle` follows every relation type that nests, and the view's types are among them. The message is `"E" cannot go inside "T", which is inside "E" in the model through "is part of".`, naming the type of the first relation on the way from T up to E. When that type is not one of the view's, the message ends `…through "is part of", which the view "V" does not show.`
   - Checking each element against the model after the deletes is enough. Every new relation ends on T, so a cycle would need a way from T back to E through the old relations.
3. **Enter.** One relation per entering element that needs one, however many shapes it had.
   - Its type is `command.relationType`, or else `nestingTypeFor(state, view, leaving(E))`. Resolve it with `draft.relationType`, and refuse with `not-nesting` (`The relation type "T" does not nest.`) when it does not nest. The default comes from `nestingTypesInView`, so the check only matters for a given type, but it is one code path.
   - Generate every new relation id first, with `draft.newId(slug(typeName, 'relation'), (id) => generatedHere.has(id))`.
   - Then insert the relations at the end of `model.relations`, in element order, and push each id to `draft.created` in the same order. The local program's `created`, and Claude's in M4, then name them.
   - Warnings: `limitWarnings(relation, index, definitions)`, with the index read in step 2. Limits only warn.
4. **Positions.**
   - When `to` is an element, make one `putPositions` call for the shapes with `at`, as `{ element, container: to, x, y, width?, height?, pinned: true }`.
   - When `to` is World, write absolute positions, and only for elements that now sit directly in World in this view. If an element keeps other containers, a World position would never be read, so none is written.
   - Old positions stay (ADR-0019).
5. **Front.** The entering elements move to the end of D for `to`'s key, in the order given, and the list is written as in §4.3. When `to` is an element, that is all of them. For World, it is those that now sit directly in World. This puts an old element in front too, not only the newest. For an older element, it lists the shapes drawn behind it there (§3).
6. **Staying.** A shape whose `from` equals `to` only gets its position, and keeps its place in the stacking order.

**Labels** (they count elements):
- One element, from World to T: `Put "E" inside "T"`
- One element, from A to T: `Move "E" from "A" into "T"`; from several containers: `Move "E" into "T"`
- One element, from A to World: `Take "E" out of "A"`; from several: `Take "E" out of its containers`
- Only positions (every `from` equals `to`): `Move "E" in "V"` / `Move N elements in "V"`
- Several elements to T: `Put N elements inside "T"` when all come from World; otherwise `Move N elements into "T"`
- Several elements to World: `Take N elements out of "A"` when they all come from A; otherwise `Take N elements out of their containers`

**Why delete and create, rather than changing the relation's `to` end.** What was said about the old membership must never silently become true of the new one (ADR-0010). That covers:
- the relations that end on it;
- its name, description and attributes;
- the scenario steps that use it.

The app asks first whenever something would be lost (§6.5).

### 4.5 Deletes

File: `packages/core/src/rules.ts`

`DeletePreview` gains `stacking: { view: Id; container: Id; element: Id }[]`. It lists each entry a delete takes out of a stacking list, once:
- every id of a list whose key is a deleted element (the whole list goes);
- the id of every deleted element in every other list.

So deleting both K and X, where K's list holds X, lists `{ view, container: K, element: X }` once.

In `applyDeletion` (extracted from `deleteTargets` in `commands/model.ts`), after the position removals and before the relations:
- A list whose key is deleted gets one `replace-all` with `[]`, which drops the key.
- Any other list gets single-id `remove`s, or one `replace-all` of the filtered list above `BULK`.

Other rules:
- Deleting a relation, nesting or not, and changing a view's nesting relation types never touch stacking, just as positions stay.
- `delete-view` removes the whole view, and its undo restores the lists.
- `DeleteDialog` shows nothing about stacking.

### 4.6 checkProject

File: `packages/core/src/check.ts`, in the views loop. All three problems name `[view.id]` as their subjects, as the position warnings do. `locateProblems` (server `project.ts`) looks up model ids first, so a subject that is an element id would point at `model.vamodel` instead of the view file that holds the list.
- **Warning `unknown-element`:** a key that is neither World's id nor an element: `The view "V" keeps a stacking order for "k", which is no element of the model; it is ignored.`
- **Warning `unknown-element`, one per list:** ids that name no element, or name World: `The stacking order of "C" in the view "V" names "x", which is no element of the model; it is ignored.`
- **Error `id-taken`:** an id repeated in one list: `The stacking order of "C" in the view "V" names "x" more than once.` Call `repeated(…, [view.id])` explicitly. The schema already refuses this in files; the check covers states built in memory.
- Ids that no longer sit in that container are not reported, as for positions.

### 4.7 Protocol, exports and server

- **Protocol** (`packages/core/src/protocol.ts`): `PROTOCOL_VERSION = 2`.
  - Reason, recorded in the doc comment: the operations the protocol carries gain a collection.
  - Effect: an app and a local program from builds on either side of this change fail on the first message, on the existing "different versions" screen (`App.tsx`, `unreadable`), with "Protocol version 2 is not 1." Without the bump, they would fail later, on the first stacking operation, with an unrelated TypeError.
  - The bump does not make a tab reload.
- **Exports** from `packages/core/src/index.ts`:
  - `stackingKey`, `contentsInView`, `orderByStacking`, `stackingOrderOf`, `stackingListFor`, `stackingOperations`;
  - `nestingTypesInView`, `leavingRelations`, `nestingTypeFor`, `previewChangeContainer`, and the type `ContainerChangePreview`;
  - `StackedShape`, `StackingPlace`, `RestackCommand` and `ChangeContainerCommand` come through `export type * from './commands/types'`.
- **Server** (`packages/server/src/file-plan.ts`):
  - Add `case 'stackingOrder':` next to `positions` and `freeShapes`.
  - Add `default: { const unreachable: never = collection; throw new Error(...) }`, so that a future collection can no longer go silently unsaved.
  - A restack writes only the view file. A change-container writes the model file and the view file. Nothing else changes in the server.
  - `project.test.ts` checks that the three stacking problems are reported against the `.vaview` file.
- **MCP (M4), fixed now:** the read tool returns, for World and for each container in the view, `stackingOrderOf` (back to front, live ids only), never the stored map. Claude changes the order only through `restack` and `change-container`.

### 4.8 Core tests (written first)

- **operations.test**
  - Inserting into a missing list creates the map and the key. Removing the last id deletes the key, then the field. Check with `isDeepStrictEqual`.
  - `replace-all []` deletes the key.
  - Inserting an id twice throws `OperationError`.
  - `set-view` keeps `stackingOrder`, and so does `update-view` (a rename).
  - `keyOf` returns the id.
- **stacking.test** (fast-check)
  - `contentsInView` equals `containmentTree` with `nestingTypesInView`, on random projects that keep the rules, for every container and World.
  - `orderByStacking` returns a permutation; listed ids keep the list's order; unlisted ids keep their order and come after; stale ids are ignored.
  - `stackingListFor(D)` reproduces D, and no shorter list does.
  - Applying `stackingOperations(stored, next)` gives `next`: in exactly |stored| + |next| − 2·LIS operations when that is at most 200, and in exactly one replace-all otherwise.
- **containers.test**
  - `nestingTypesInView` drops a listed type that no package defines, and one that no longer nests, and keeps the view's order.
  - `leavingRelations` finds both relations when two of the view's types place an element in A.
  - `nestingTypeFor` gives the leaving type when all are of one type (two relations of one type included). Otherwise it gives the view's first type, and `undefined` when the view has none.
- **commands.test, restack**
  - Front, back, inFrontOf and behind.
  - Bring to front of the newest shape emits no operations.
  - Send to back of an unlisted shape writes one id.
  - Send to back then Bring to front of the newest sibling leaves no `stackingOrder`. For an older sibling, it leaves the list of the siblings drawn behind it.
  - Stale ids are dropped on rewrite.
  - One command can change two containers.
  - World's id works as a container.
  - More than 200 changes give one replace-all.
  - Every refusal and every label.
- **commands.test, change-container**
  - From World into C: a relation of the view's first type, a pinned position, the front, and the relation's id in `created`.
  - From A into C: the old relation is deleted, the new one has the same type, and the old position is kept.
  - From C to World: a World position only when the element has no other container.
  - Merge when the element is already inside.
  - Two of the view's types placing it in A: both relations are deleted, and the view's first type is used.
  - The same element given from A and from B: one relation to T, of the leaving type when both are of one type; the label counts one element.
  - `containment-cycle` through a nesting type the view does not use (the message says so), and into itself.
  - `not-nesting` in every case: a given type that does not nest; a given type the view is not arranged by; a view arranged by no type that nests, including one whose only listed type had `nests` turned off. Also `unknown-relation-type` for a given type.
  - A view listing `systems.is-part-of` after the project stopped using systems: the drop's default type is the view's next type that nests, or the drop is refused with `not-nesting`. It never writes a relation of an unknown type.
  - A relation that ends on the nesting relation cascades, and a step that uses it becomes broken.
  - `previewChangeContainer` lists exactly `leaving`, `cascaded`, `brokenSteps` and `withData`. Its problems equal the command's refusal, cycles included.
  - Labels.
  - Patient moved into Clinic booking ends up in front of Scheduling (the front rule for old elements), and the list names WhatsApp, Booking agent and Scheduling.
  - A shape whose `from` equals `to` keeps its place in the stacking order.
  - A 200-shape change on the synthetic project runs in under 1 s.
- **rules.test:** `DeletePreview.stacking` covers element deletes and container deletes, with no repeated entry when both a container and an element its list names are deleted. Deleting a relation changes no list.
- **check.test:** an unknown key or id gives a warning; a repeated id gives an error; all three have subjects `[view.id]`; World's id key is accepted.
- **protocol.test:** version 2.
- **invariants.test**
  - New intents:
    - `{ kind: 'restack'; view; at; picks; place; target }` builds moves from the view's `containmentTree`.
    - `{ kind: 'change-container'; view; picks; to: number | null; at: boolean; relationType: boolean }` takes the shapes from the tree's placements. With `relationType`, it gives one of the project's relation types, which may not nest.
  - The `view` intent may also list `systems.is-part-of` while the project uses systems. The existing `packages` intent then drops systems while a view lists it (`packageUsers` ignores views), and the existing `toggle-nests` intent turns `nests` off on a listed type. `expectRulesKept` (no `checkProject` errors) therefore catches any relation of an unknown type.
  - Add `'restack'` and `'change-container'` to `COMMAND_TYPES`.
  - `expectRulesKept` asserts that every view either lacks `stackingOrder` or holds a non-empty map of non-empty lists without repeats, whose keys are World or elements and whose ids are elements.
  - `expectDeletedExactly` asserts that no list names a deleted element, that no key is a deleted element, and that the removals equal `preview.stacking`, compared as sets.
  - After every undo, `isDeepStrictEqual(undone.state.views, before.views)` holds.
  - The cycle property also tries `change-container`.
- **file-plan.test:** `stackingOrder` operations touch only the view file.
- **session.test:** a restack that changes nothing is not recorded; a restack saves only the view file, and undo restores its bytes.

---

## 5. Scene, renderer and hit testing

### 5.1 Scene

File: `packages/app/src/canvas/scene.ts`

**Contract.**

```ts
/** Everything a view draws. */
export interface Scene {
  /**
   * The anchored shapes of elements in containment order: World's contents, and each container's
   * contents, in model order, a container before its contents. The outline, the keys, relations and an
   * element's first shape follow this order, whatever the stacking order.
   */
  shapes: ElementShape[];
  /**
   * The indexes of `shapes` in drawing order, back to front: a container before its contents, its
   * contents before its next sibling, siblings in the view's stacking order. Absent: as `shapes`.
   */
  drawing?: readonly number[];
  relations: RelationLine[]; // drawn in front of every element shape, in model order
  notes: NoteShape[];
  arrows: ArrowShape[];
  bounds: Rect | undefined;
}
```

- `drawing` is optional, so the hand-built scenes in the owned test files still typecheck. `buildScene` always sets it.
- `ElementShape` gains a required `extent: Rect`: "The rectangle holding this shape and everything inside it; larger than `rect` only when contents stick out of its left or top edge." Only `scene.ts` builds ElementShapes, so the new required field breaks nothing.
- Export `CONTENTS_ORIGIN = { x: CONTAINER_PADDING, y: CONTAINER_HEADER }`, which is (24, 48).
- **Nesting.** `buildScene` nests by `nestingTypesInView(project, view)`, not by the raw `view.nestingRelationTypes`. A listed type that no package defines, or that no longer nests, arranges nothing. Its relations are drawn as relations, so the view's containment is always part of the model's. No existing fixture lists such a type.

**Drawing order.**
- `place()` records `inWorld: number[]` (the World-level indexes) and `contents: number[][]` (by scene index). It sets each shape's `extent` once its contents are placed: the union of its `rect` and their extents.
- `drawingOrder(layout, view, worldId)` walks `inWorld`. At each level it sorts with `orderByStacking(contents, (at) => shapes[at].element, list)`, where `list` is the list under the container element's id, or World's id. The walk is pre-order.
- When the view stores no `stackingOrder`, it returns the identity array kept with the layout.
- `measure`, `arrangeContents`, `layOutRow` and `drawRelations` keep model order. A restack therefore never moves a shape without a position, never moves a relation onto another copy, and never reaches M3's ELK input.

**Layout cache.** This is the restack fast path, and it needs no Shell.tsx change.
- `buildScene` keeps the layout in a `WeakMap<ViewFile['positions'], Layout>`. The layout holds shapes, `inWorld`, `contents`, identity, relations, notes, arrows and bounds.
- **Reuse rule.** The cached layout is reused only when all of these hold:
  - the view id is the same;
  - `project.model` and `project.packages` are the same objects;
  - every other field of the view holds the same value by `Object.is`, with the same set of keys. The three exceptions are `stackingOrder`, `name` and `description`, the only fields a restack or a rename touches.
- `buildScene` takes no other input today. Any input added later, such as M3's collapse and filters, joins this comparison. A new view field therefore rebuilds the layout until someone decides otherwise.
- `applyOperations` shares everything a stacking operation does not touch. So after a restack, or a view rename, `buildScene` only redoes the drawing walk and returns a new `Scene` that reuses the same arrays.

### 5.2 Overlap, bands and the index

Files:
- `packages/app/src/canvas/hit.ts`
- `packages/app/src/canvas/spatial.ts`

```ts
export interface IndexedScene {
  scene: Scene;
  /** The element shapes by their index in `scene.shapes`, inserted in drawing order: a query lists them back to front. */
  shapes: SpatialIndex<number>;
  relations: SpatialIndex<number>;
  notes: SpatialIndex<number>;
  arrows: SpatialIndex<number>;
  byKey: ReadonlyMap<string, ElementShape>;
  /** Each shape's index in `scene.shapes`, by its key. */
  indexOfKey: ReadonlyMap<string, number>;
  /** Each element's shapes in containment order: [0] is its first copy in the model's order, whatever the stacking order. */
  byElement: ReadonlyMap<string, readonly ElementShape[]>;
  /** The shapes that sit directly in each container shape, by its key, and directly in World under '', in containment order. */
  contentsOf: ReadonlyMap<string, readonly ElementShape[]>;
  /**
   * A spatial index over the shapes that sit directly in one container shape (key '' for World), each
   * entered with its extent. Built the first time it is asked for, and shared by every IndexedScene of
   * the same `scene.shapes`.
   */
  contentsIndex(containerShape: string): SpatialIndex<ElementShape>;
  /** `scene.drawing`, or the order of `scene.shapes`. */
  drawing: readonly number[];
  /** Each shape's place in `drawing`, by its index in `scene.shapes`. */
  rankOf: Int32Array;
  /**
   * Each shape's band, by its index in `scene.shapes`: one more than the highest band of the shapes
   * drawn before it that it overlaps, or 0. Shapes that overlap are in different bands, the later one
   * higher, so drawing the bands in order draws every overlapping pair in drawing order.
   */
  bands: Int32Array;
}
```

**Overlap.**
- `overlaps(a, b)` is exported from `spatial.ts`, next to `meets`. Two rectangles overlap when their insides share a point: `a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height`. Shapes that only touch do not overlap, unlike with `meets`.
- Bands, the stacking planner, the landing check and the inspector's lists all use this one rule.
- Where the outlines of two touching shapes meet, a strip one stroke wide may be drawn in either order. That is 1.5 units for outlines, and 6 units for container blocks below 25% zoom, which is under 1.5 px on screen. Labels stay inside their shapes (§5.4), so nothing else is affected.
- `outlying(indexed, shape)`, exported from `hit.ts`, gives the shapes inside `shape`, directly or not, whose rectangle is not within its rectangle.
  - It finds them by going only into contents whose extent is not within it. The result is cached per shape in a `WeakMap`.
  - It is empty unless a content sits at a negative offset. Contents never stick out of the right or bottom edge, because a container grows to hold them.
- `overlapWithContents(indexed, a, b)`, exported from `hit.ts`, tells whether a shape and everything inside it overlaps another shape and everything inside it. It does so when some shape of {a} ∪ outlying(a) overlaps some shape of {b} ∪ outlying(b). Without outlying shapes, it is `overlaps(a.rect, b.rect)`.

**Band pass, fused with the insert in `indexScene`.**

```
for r in 0..drawing.length: s = drawing[r]
    rankOf[s] = r
    bands[s]  = shapes.highest(scene.shapes[s].rect, (at) => bands[at]) + 1   // −1 when nothing overlaps
    shapes.insert(s, scene.shapes[s].rect)
```

- Bands are computed over the whole scene, dragged shapes included. Hiding the carried shapes during a drag therefore changes no band.
- `SpatialIndex` changes:
  - Cell keys become numbers, `column * 1_048_576 + row`. A collision only adds candidates that the rectangle test drops.
  - New `highest(rect, score): number` walks the cells covering the rectangle. It returns the maximum `score(item)` over the items that overlap it (strictly), or −1. It allocates nothing; duplicates do not matter for a maximum.
  - `query` and `at` keep their contract.
- **Caches, keyed by identity in WeakMaps:**
  - `indexScene(scene)` returns the same `IndexedScene` for the same `Scene` object, so the canvas and the inspector share it.
  - The relation, note and arrow indexes are cached by `scene.relations`, `scene.notes` and `scene.arrows`.
  - `byKey`, `indexOfKey`, `byElement`, `contentsOf` and the contents indexes are cached by `scene.shapes`. Containment and extents do not change in a restack.
  - On a restack, only the shape index and the bands are rebuilt. Rebuilding the relation index is the dominant part of `indexScene` at 10,000 elements: the review measured about 0.66 s of 0.7 to 0.9 s.

### 5.3 Tiles, band containers and order

New pure module: `packages/app/src/canvas/tiles.ts`

```ts
export const MAX_BANDS = 32;
/** How many shapes beyond the bands one tile draws, at most. */
export const MAX_RUN = 64;
export interface PlannedTile {
  key: string;            // `shapes ${band} ${cell}`, or `shapes over ${first shape's key}`
  band: number;           // 0..31, or MAX_BANDS for the overflow
  cell: string;
  signature: string;
  shapes: ElementShape[];
  rank: number;           // drawing rank of its first shape; orders the overflow
}
export function plannedTiles(indexed: IndexedScene, hidden: ReadonlySet<string>): PlannedTile[];
export interface TilePlan {
  keep: string[];
  move: { from: string; to: string }[];
  make: PlannedTile[];
  drop: string[];
}
export function planTiles(previous: ReadonlyMap<string, { cell: string; signature: string }>, planned: readonly PlannedTile[]): TilePlan;
```

**Planning (`plannedTiles`).**
- A shape with a band below 32 joins the tile `(band, cell of its center)`, with the existing 1024-unit cell. Its shapes are sorted by key, and its signature is their per-shape signatures joined, so **it does not depend on order**. Per-shape signatures are cached in a `WeakMap<ElementShape, string>`.
- Shapes with band 32 or more form the overflow, drawn in **runs**. Walk them in drawing order. A run goes on while the next shape's center is in the same cell and the run holds fewer than 64 shapes. Each run is one tile, with its shapes and its signature in drawing order. Order matters inside a run.
- Shapes in one band never overlap, so the order of band tiles, and of the shapes inside one, is invisible.

**Reuse (`planTiles`).**
1. Keep every planned tile whose key exists with the same signature.
2. All other previous tiles become spares, indexed by `${cell}|${signature}`.
3. Each remaining planned tile claims a spare with its cell and signature: that is a *move*. Failing that, it is a *make*.
4. Unclaimed spares are dropped.

This reuses tiles when a whole subtree shifts band, and when two overlapping subtrees in shared cells swap.

**Renderer.** File: `packages/app/src/canvas/renderer.ts`
- `depthLayers` becomes `bands: Container[]`: up to 32 PixiJS containers, created on demand in increasing order inside `shapeLayer`. Then comes one `overflowBand` container, kept last in `shapeLayer`.
- `Tile` gains `band` and `cell`. The renderer keeps `tileOfShape: Map<string, Tile>`, rebuilt with each plan.
- **Applying a plan:**
  - Kept tiles get the planned tile's fresh `shapes`. Equal signatures mean the same sorted set, so `labelled` still counts the same shapes.
  - Moved tiles are re-keyed, get the new band and fresh `shapes`, and are re-parented with `bands[band].addChild(tile.container)`. Pixi removes a child from its old parent first. The tile keeps its full drawing, labels, `level` and `labelled`.
  - Made tiles are created as today. When every shape in a made tile was, before the rebuild, in a tile that showed its full drawing with all its labels at the wanted level, the new tile also gets its full drawing and its labels in the same rebuild, outside the per-frame budget. This goes on until 200 shapes have been drawn this way in that rebuild; the rest start as blocks, as today.
    - This covers restacks whose band shifts split or merge tiles, and it covers the start and end of a drag, which also rebuild.
    - Example: Send to back on Calendar while it is still directly in World splits {Patient, Clinic booking} and {Calendar} into {Calendar, Patient} and {Clinic booking}. All three are drawn fully and named in the same frame.
  - Dropped tiles are destroyed.
- **Overflow.** When any overflow tile is made, moved or dropped, or the overflow order changes, `overflowBand` re-adds its children in drawing-rank order.
  - Order stays exact. Suppose a shape below the cap overlaps an overflow shape. If it came later in drawing order, its band would exceed the overflow shape's band, so it would be in the overflow too. Hence it is drawn earlier, and drawing the overflow above every band is correct.
  - Runs are consecutive in drawing order and drawn in that order, so they keep the order among overflow shapes.
  - A content therefore never falls into or below its container's band.
- **Frame budget.** `FULL_DRAWINGS_PER_FRAME = 1` (one tile, whatever its size) becomes `FULL_SHAPES_PER_FRAME = 200`. A frame takes on full drawings until they hold 200 shapes or relations in all, and always at least one tile. Labels then go on within the existing 6 ms clock and 32 labels. Small tiles no longer take a frame each.
- **`showsOutline(key): boolean`** says whether the shape's tile now shows its full drawing. It is false below 25% zoom, while the tile still shows blocks, and for a shape being dragged. Hit testing reads it (§5.6).
- **Labels in tests.** The renderer takes an optional text factory (default `bitmapText`), so `renderer.test.ts` can count labels in jsdom.
- **Fast paths.** When `scene.relations` and the hidden relation set are unchanged, relation grouping is skipped and relation tiles are kept. When `scene.notes` and `scene.arrows` are unchanged, the free tile is kept.
- **Unchanged layers.**
  - `relationLayer`, `freeLayer`, `dragLayer`, `selectionMarks` and `gestureMarks` stay above `shapeLayer`, in that order.
  - Relations are drawn in front of every element shape, and free shapes in front of relations.
  - Selection and hover marks are drawn on top, so a covered selected shape still shows its outline.
  - Nothing uses `zIndex` or `sortableChildren`.
- **Drag layer.** `startDrag` draws the carried shapes band by band, in increasing band: one Graphics with that band's outlines, then that band's labels. Overflow shapes follow in drawing order. The preview keeps painter's order and stays above everything during the drag, by design. The caption says when the drop will land behind another shape (§6.4).
- **Header comment, exact text:** "Element shapes are drawn in the scene's drawing order, in bands of shapes that do not overlap: every pair that overlaps is drawn in order whatever tiles the shapes fall in, and shapes that do not overlap, touching ones included, share tiles. Relations, then free shapes, are drawn in front of every element shape."

### 5.4 Labels stay inside their shapes

Files:
- `packages/app/src/canvas/draw.ts`
- `packages/app/src/canvas/labels.ts`

- `TextFactory` becomes `(options, kind, room?: number) => Container | undefined`. `writeShapeLabels` skips `undefined`.
- `writeShapeText` passes the room, the height a label may take within the shape, with the anchors drawn today:
  - **Container:** the name gets `min(20, height − 12)`, one line in the 48-unit header. The component name gets `min(16, height − 32)`, and is left out when that is not positive.
  - **Content** (label area A from `labelArea`): the name gets `A.height / 2`, anchored at the bottom on the center line. The component name gets `A.height / 2 − 6`.
  - Widths are already bounded by `wordWrapWidth` with `breakWords`.
- `bitmapText` fits each label:
  1. Make the label.
  2. If `text.height > room`, set `text.text = full.slice(0, keep).trimEnd() + '…'` with `keep = floor(len × room / height) − 1`. If it is still too tall, retry once with `keep × 0.7`.
  3. If it is still too tall, destroy it and return `undefined`.
  - That is at most two extra layouts, and only for labels that do not fit. The renderer's 6 ms label clock accounts for the time. `…` is already among the font's characters.
- `canvasText`, the default factory that tests use, ignores `room`. After the m2-fixes merge, `drawScene` no longer exists.
- With labels inside their shape's rectangle, a shape's rectangle bounds all of its ink apart from the stroke strip of §5.2. Bands are therefore exact for labels too, and a covered shape's name never shows through the shape in front.

### 5.5 Culling

Culling does not change. Tiles are culled one by one, overflow runs included. Band containers are not cullable, and culling does not depend on order.

### 5.6 Hit testing

Files: `hit.ts`, plus `packages/app/src/canvas/geometry.ts`

- **`geometry.ts` exports**, which `draw.ts` uses too:
  - `cylinderCap(rect)` and `personHead(rect)`, moved from `draw.ts` (`capHeight`, `headRadius`);
  - `grow(rect, by)`, moved from `renderer.ts`;
  - `holdsPoint(kind, rect, point)`:
    - rectangle and rounded rectangle: the rectangle;
    - ellipse: (dx / rx)² + (dy / ry)² ≤ 1;
    - cylinder: the body rectangle between the caps, or either cap ellipse;
    - person: the body's rounded rectangle from y + 1.6·head, or the head circle.
- **`hitAt(indexed, point, tolerance, exact: (shape: ElementShape) => boolean = () => true)`.**
  - Free shapes and relations are unchanged.
  - For element shapes, walk `indexed.shapes.at(point)` from the end. Return the first shape whose outline holds the point (`holdsPoint`) when `exact(shape)`, or whose rectangle holds it otherwise.
  - The index is in drawing order and overlapping shapes are in increasing bands, so this is exactly the shape drawn on top. The code comment changes from "innermost" to "drawn on top".
  - The controller passes `(shape) => renderer.showsOutline(shape.key)`. So rectangles count wherever the canvas draws them: below 25% zoom, and on a tile that still shows blocks after a zoom-in.
- **`shapesAt(indexed, point, exact = () => true): ElementShape[]`.** The element shapes under the point by the same rule, topmost first, ignoring notes and relations. The shape menu's "Under the pointer" list uses it. Drops use their own rule (§6.4), which counts every shape that holds contents by its rectangle.
- **Box selection.** `enclosedBy` keeps rectangles, so a covered shape can be box-selected, and reached with the arrow keys and the outline.

### 5.7 Cost at 10,000 shapes

- **Frames.**
  - Wherever only containment overlaps, or shapes only touch, band equals nesting depth: 0, 1 and 2 in the sample, 0 and 1 in the benchmark. An edge-to-edge grid is all band 0. The tile and draw-call counts therefore stay what they are today. `synthetic.test` asserts that the band planning yields exactly as many tiles as a planning by (containers above the shape, cell), in the default mode and in the grid.
  - Truly overlapping layouts add one tile per extra band per cell, up to 32 bands. After that, overflow shapes are drawn in runs of up to 64 consecutive shapes per cell.
  - Nothing new happens per frame, except that full drawings are budgeted in shapes.
- **Band pass.** One allocation-free probe per shape over the cells its rectangle covers, usually 1 to 4 cells of 256 units: O(n·k). The review measured an equivalent pass at about 5 ms for 10,000 shapes, against about 40 ms through `query`.
- **Restack.**
  - There is no measuring, routing or relation re-indexing. The cost is the drawing walk (O(n)), the shape-index insert and band pass, and the renderer's planning with cached signatures. Tiles whose content is unchanged are kept or moved; made tiles drawn at once are capped at 200 shapes.
  - Budget: p95 ≤ 100 ms at 10,000 elements, in a new benchmark phase (§6.9).
  - The benchmark bypasses React. In the app, `drawnRelations` and `outlineOf` recompute in O(n) per scene, as they do for every edit today.
- **Selection change.**
  - Stacking states are computed only for selections of at most 50 element shapes.
  - For each selected shape, the planner makes one query of its container's contents index, shared by the four moves. It never queries the shape index, so selecting a container that holds 9,000 shapes reads only the shapes beside it, never its contents.
  - The outside-cover hint adds one contents-index query per container level above the shape, and only for a disabled move (§6.3).
- **Drag.**
  - Each pointer move costs one point query plus set lookups. Overlay and caption text change only when the aim changes, and the caption's position is one style write per move. The blocked set is computed once per drag.
  - The landing check (`Lands behind`) runs at most once per frame, for the grabbed shape only: one contents-index query per container level above it (§6.4).

### 5.8 Scene, renderer and hit-testing tests

- **scene.test**
  - `drawing` follows the stored order in World and inside a container, with unlisted shapes after the listed ones in model order.
  - Copies of a container share the order (fixture from lines 403-430).
  - `shapes`, rects, offsets of placed shapes and relation routes are identical with and without a stacking order.
  - A project differing only in `stackingOrder`, `name` or `description` reuses the same `shapes` and `relations` arrays (cache hit). Changing any other view field, such as `perspective`, `nestingRelationTypes`, `freeShapes` or an extra key, rebuilds the layout.
  - A view listing a type that no longer nests draws no containment through it, and draws its relations as lines.
  - `extent` grows for a content at a negative offset.
  - Lines 196-208 (containers before their contents) still pass.
- **hit.test**
  - fast-check over random rectangles in random order:
    - for every pair that overlaps (strictly), i < j, `bands[i] < bands[j]`;
    - no two shapes in one band overlap;
    - each band is minimal;
    - shapes that only touch may share a band.
  - A 10 × 10 edge-to-edge grid has one band.
  - Sample bands, in containment order: 0, 0, 1, 1, 1, 2, 2, 2.
  - The Calendar case: a World shape added after Clinic booking, over Scheduling and overlapping the Appointments API, gets band 3 and is hit there. Once it is sent to the back, it is hit only where nothing covers it.
  - A point in a cylinder's corner hits the shape behind it. With `exact` false for that shape, as while its tile shows blocks, the cylinder's rectangle counts.
  - `shapesAt` lists topmost first.
  - `SpatialIndex.highest` equals the maximum over `query` filtered by `overlaps` (fast-check), with negative coordinates.
  - `contentsIndex` holds only the shapes directly in that container shape. `outlying` finds a content at a negative offset, and is empty otherwise.
  - The L-shaped case: container S at (0,0), 400 × 300, holding c at offset (−300, −200), 180 × 80, and a World sibling Y at (−250, 100), 180 × 80. `overlapWithContents(S, Y)` is false.
  - Rename the test "finds the innermost shape" to "finds the shape drawn on top". Its expectations still hold.
- **tiles.test**
  - Keys by (band, cell).
  - 40 stacked shapes in one cell give 32 band tiles plus one overflow run of 8. Runs split at a change of cell and at 64 shapes, and their order follows drawing order.
  - Band-tile signatures do not depend on order; run signatures follow drawing order.
  - `planTiles`: keep, move, make, drop. A swap of two overlapping subtrees in shared cells moves every tile and makes none.
- **draw.test:** rooms per shape kind. A fake factory that measures by characters cuts a long name with "…" to fit, and leaves short names alone.
- **geometry.test:** `holdsPoint` for every kind.
- **renderer.test** (new, with FakeApplication and a counting text factory):
  - Band containers are in increasing order.
  - A restack that only shifts bands keeps the same tile container objects.
  - A band shift that splits a tile draws every affected shape fully, with its labels, in the next frame.
  - `showsOutline` is false until a tile is drawn fully, and true after.
  - 300 one-shape tiles on screen are drawn fully within two frames.

---

## 6. Canvas gestures and UI

### 6.1 Toolbar

File: `packages/app/src/canvas/CanvasToolbar.tsx`

New optional props:
- `addPlace?: { option: string; label: string; title: string }`, which CanvasArea fills from the add rule (§6.6);
- `stacking?: Record<StackingMove, { enabled: boolean; description: string }>`;
- `onRestack?: (move: StackingMove) => void`.

Without them, the toolbar renders as today.

- After Arrow comes `<div role="group" aria-label="Stacking order">` with four buttons: Bring to front, Bring forward, Send backward, Send to back.
  - Each has an inline 16 px SVG (`aria-hidden`), visually hidden text, `title` set to the description, and `aria-keyshortcuts`.
  - A button that would change nothing is `aria-disabled="true"`, not `disabled`. It stays focusable and readable, and a press announces its reason (phase b).
- With `addPlace`, the "Add element…" select's first option reads `addPlace.option`, its hidden label reads `addPlace.label`, and its title reads `addPlace.title`. Without it, the select shows `Add element…`, with the title `With nothing selected, elements are added directly in World.`

### 6.2 Shortcuts

New file: `packages/app/src/canvas/stacking.ts`

```ts
export function stackingShortcut(keys: ShortcutKeys & { altGraph: boolean }): StackingMove | undefined
```

Rules, applied in order:
1. Ctrl or ⌘ must be held; otherwise the press is not a stacking key.
2. If `altGraph` is held, it is not one either. Since f9690b2, AltGr with `[` and `]` steps through relations. Windows reports AltGr as Ctrl+Alt, so on keyboards that type brackets with AltGr (Spain, Germany, France…), Ctrl+[ cannot be told apart from it.
3. `ArrowUp` and `ArrowDown`, without Alt, mean forward and backward; with Shift, front and back. This works on every keyboard, as `.` and `,` do for relations.
4. ⌘ with Alt (⌥) on `code` BracketRight or BracketLeft, without Shift, means front or back. On macOS, Option changes the typed character, and ⌘⇧[ and ⌘⇧] switch tabs (the Figma convention).
5. Any other press with Alt is left alone.
6. ⌘ with Shift is left alone, so tab switching stays the browser's.
7. Otherwise the typed character decides: `]` forward, `[` backward, `}` front, `{` back.
   - When the typed key is a single letter of a non-Latin script (`/\p{L}/u` and not `/\p{Script=Latin}/u`, as on Russian or Greek layouts), use `code` instead: BracketRight → `]` (`}` with Shift), BracketLeft → `[` (`{` with Shift).
   - Latin layouts are never matched by position. On Spanish and Latin American keyboards, BracketRight is the `+` key, and Ctrl and + must stay the browser's zoom.

What this gives:

| Layout | Forward / backward | Front / back |
|---|---|---|
| US, Windows | Ctrl+] / Ctrl+[ | Ctrl+Shift+] / Ctrl+Shift+[ |
| Latin American | Ctrl+Shift+} key / Ctrl+Shift+{ key | Ctrl+} / Ctrl+{ |
| Spain | Ctrl+↑ / Ctrl+↓ | Ctrl+Shift+↑ / Ctrl+Shift+↓ |
| macOS | ⌘] / ⌘[, ⌘↑ / ⌘↓ | ⌥⌘] / ⌥⌘[, ⌘⇧↑ / ⌘⇧↓ |

**Where the keys work (phase b).** CanvasArea registers one `keydown` listener on `window`, with the same guards as Header.tsx's undo and redo (lines 83-90). It ignores events already handled (`defaultPrevented`), events during composition, and events aimed at text entry (`isTextEntry`).
- It calls `preventDefault` on every press that matches, wherever the focus is: canvas, toolbar, shape menu, inspector or model panel. So ⌘[ and ⌘] never go Back or Forward while the app is open, even after a click has left the focus on a toolbar button.
- It restacks when the selection holds element shapes in the open view and no dialog or menu of the canvas is open. Otherwise it announces why nothing changed, or stays silent while a dialog is open.
- The controller's host handler already returns, without preventing anything, for Ctrl and ⌘ with `[`, `]` (when not AltGraph) and the arrow keys. So the press reaches the window, and the controller needs no stacking hook.
- The model panel's tree prevents Ctrl+↑ and Ctrl+↓, which it uses to move its own focus, so they keep that meaning there.
- Keys typed in text entry never reach the listener, because of `isTextEntry`. The inline editor also stops propagation.

**Labels** shown in tooltips, `aria-keyshortcuts` and the keyboard help lead with the arrow keys, which need the same key on every keyboard. `IS_APPLE` lives in the new `packages/app/src/live/platform.ts`, with the same test as Header.tsx:44.

### 6.3 Building a restack

In `stacking.ts`:

```ts
export type StackingMove = 'front' | 'forward' | 'backward' | 'back';
export const EAGER_LIMIT = 50;
export function restackCommand(indexed, project, viewId, selection, move): { command?: RestackCommand; reason?: string; done?: string };
export function stackingActions(indexed, project, viewId, selection): Record<StackingMove, { enabled: boolean; description: string }>;
```

How `restackCommand` works:
1. **Shapes.** Take every shape of every selected element, all copies. If there are none, the reason is `Select shapes of elements to change their stacking order. Relations, notes and arrows are always drawn in front of them.`
2. **Sorting by container.** Sort the shapes by container element (`container ?? world`), using the first copy of each container in `byElement` order. Every copy shares the order and the inner layout, and therefore the overlaps.
3. **Overlap candidates**, computed once per selection and shared by the four moves. For a selected shape s whose container shape has key P (`''` for World):
   - Query `indexed.contentsIndex(P)` with `s.extent`. Each hit t ≠ s is a candidate.
   - Keep t when `overlapWithContents(indexed, s, t)`. The extent alone would also catch a sibling inside the L-shaped gap that overlaps nothing (§5.8).
   - Order the kept candidates by `rankOf`.
   - This reads only the shapes beside s, never what is inside s, and never the shape index.
4. **Moves.**
   - **forward:** selected shapes in descending rank. Each goes `{ inFrontOf }` the lowest-ranked unselected candidate above it, if any.
   - **backward:** selected shapes in ascending rank. Each goes `{ behind }` the highest-ranked unselected candidate below it, if any.
   - **front:** enabled when some selected shape has an unselected candidate above it. Then every selected shape in each such container, in ascending rank, goes `'front'`. The selection keeps its relative order.
   - **back:** the mirror image, in descending rank, each `'back'`.
   - Every press that is enabled changes something visible.
   - All moves go in **one** `restack` command, however many containers are involved: one action.
5. **Reasons, exact:**
   - Forward and front: `"E" is already in front of everything it overlaps inside "C".` (`directly in World` for World). For several shapes: `The selection is already in front of everything it overlaps.`
   - Backward and back: the mirror wording (`behind`).
   - **The cover comes from outside.** For one shape, walk up from s. At each container shape A on the way out to World, query the contents index of A's own container for shapes drawn after A that overlap s's rectangle, by their shape or an outlying shape inside it. The topmost such shape B, across all levels, adds ` "B" is drawn in front of "A", which holds it.`
   - **It sits over a container it is not in.** When s sits beside a shape T that holds contents, is drawn behind s, and whose rectangle holds s's whole rectangle, every text about s ends with ` It sits over "T" without being inside it; Put inside "T" orders it among the shapes there.`
   - Not editable: `The project cannot be changed now.`
6. **Done text**, announced after success:
   - `"E" is now in front of "Y".`
   - `"E" is now behind "Y".`, or `"E" is now behind "Y", which hides it.` when Y's rectangle holds E's whole rectangle.
   - `"E" is now at the front.`
   - `"E" is now at the back.`, plus ` "Y" hides it.` for the first shape beside it, now drawn after it, whose rectangle holds its whole rectangle.
   - `The selection is now in front.` / `The selection is now behind.`
   - The "sits over" hint of step 5 is appended when it applies.

`stackingActions` evaluates the four moves from the shared candidates when the selection has at most 50 element shapes. Above that, all four are enabled with generic descriptions ("Bring the selection forward (Ctrl+↑)"), and the work happens on press. When enabled, the descriptions read:
- `Bring forward, in front of "Scheduling" (Ctrl+↑)`
- `Bring to front, inside "Clinic booking" (Ctrl+Shift+↑)`
- `Send backward, behind "WhatsApp channel" (Ctrl+↓)`, or `Send backward, behind "Clinic booking", which hides it (Ctrl+↓)` when that shape's rectangle holds the selected shape's whole rectangle
- `Send to back, directly in World (Ctrl+Shift+↓)`, or `Send to back, directly in World; "Clinic booking" then hides it (Ctrl+Shift+↓)`

### 6.4 Dropping into and out of containers

New file: `packages/app/src/canvas/drop.ts`. It is pure; the controller adds a few hooks in phase b.

**Plan, made once per drag:** `planDrop(indexed, project, viewId, selection, grabbed: ElementShape): DropPlan | undefined`.
- It returns `undefined` (a plain move, as today) when `nestingTypesInView` is empty, or when the press did not hit an element shape.
- `moving` is the moving shapes (`movingShapes`), each with `from = shape.container` and `fromShape = shape.containerShape`. Copies of one element inside copies of one container count once, through the grabbed copy when it is one of them, else the first.
- `grabbedShape` is the moving shape that is, or carries, the grabbed shape.
- `carried` is `carriedKeys`.
- `blocked` is the moving shapes' elements plus everything inside them through **every** nesting relation type, following `modelIndexOf(project).contentsOf` transitively. These are exactly the cycles the core would refuse.
- `onlyMoves` counts memberships, not shapes: the distinct `container` values among the element's shapes in `byElement`, with World as one value.
  - When some moving element sits in more than one container in this view, the plan holds the reason `"E" sits in N containers in this view`.
  - An element with one membership whose container has copies is not affected.
  - Until M3's "Nesting with several containers" task settles which membership a dragged copy changes, such elements only move.
- `armable` holds when every moving shape holds no contents in this view, **or** the grabbed shape's rectangle is no larger than a given leaf in both width and height (checked per leaf).

**Aim, on each pointer move:** `dropAimAt(indexed, plan, point, delta, armed: string | undefined, exact)`, with

```ts
type DropAim =
  | { kind: 'stay' }
  | { kind: 'into'; target: ElementShape }
  | { kind: 'out' }
  | { kind: 'pending'; leaf: ElementShape; fallback: DropAim }
  | { kind: 'refused'; target: ElementShape; reason: string }
  | { kind: 'only-moves'; reason?: string };
```

Rules:
1. Alt held, or `plan.onlyMoves` set: `only-moves`.
2. Walk `indexed.shapes.at(point)` from the top. A shape counts as under the pointer in one of two ways:
   - when it holds contents and its *rectangle* holds the point, because contents are laid out in the rectangle, whatever the drawn outline;
   - when it holds nothing and it is hit by the rule of §5.6 with `exact`.

   For each shape S under the pointer:
   - S carried: skip it. It is not drawn there during the drag.
   - S holds no contents:
     - armed, armable and not blocked: return `into S`;
     - armable, not blocked and not yet armed: remember it as the pending leaf (the topmost one only);
     - then continue to the shape below.
   - S's element is blocked: `refused`. **Stop.** A refused container never lets the drop fall through to the one below it. The reason names the containment in the model, from the first relation on the way from T up to E:
     - `"T" is part of "E" in the model through "is part of"`;
     - with `, which this view does not show` appended when that relation type is not one of `nestingTypesInView`.
   - S's element equals the grabbed shape's `from`: `stay`. Stop.
   - S holds contents: `into S`. Stop.
3. When the walk finds nothing:
   - `stay` if the grabbed shape's `from` is World;
   - `out` when the grabbed shape's rectangle at the drop (`rect + delta`) no longer overlaps its `fromShape`'s rectangle;
   - otherwise `stay`. While a dragged shape still overlaps its container, it stays and the container grows, as today. Turning a row of two Services into a column inside a 448 × 144 System never takes the second one out.
4. When a pending leaf was remembered and the result is not `into` that leaf: return `{ kind: 'pending', leaf, fallback: result }`.

**Resting to arm (controller, phase b).**
- `REST_TO_ARM = 500` ms and `REST_TOLERANCE = 8` screen px.
- The timer starts when the pending leaf changes. It restarts whenever the pointer moves more than 8 px from where it started, so only holding still arms.
- When it fires, `armed = leaf.key` and the aim is recomputed.
- Leaving the leaf, Alt, Escape or the drop clears it.

**Landing check:** `landingCover(indexed, plan, aim, delta): ElementShape | undefined`. It finds the topmost shape, not carried, that is drawn after the place where the grabbed shape lands and overlaps its rectangle there (`overlapWithContents` against the landing rectangle).
- `into S`: the place is the front of S's contents. The covers are the shapes beside S drawn after S, and the shapes beside each container shape above S drawn after it.
- `stay`, `refused` and `only-moves`: the place is the grabbed shape's own. The covers are the shapes beside it drawn after it, and beside each container shape above it, drawn after that container.
- `out`: the front of World, so there is never a cover.
- `pending`: as its fallback.
- Each level costs one contents-index query. The check runs on each aim change and at most once per frame while the aim stays, for the grabbed shape only.

**Feedback.** Recomputed only when the aim or the landing cover changes.

The overlay (`renderer.ts`) gains:

```ts
drop?: {
  into?: Rect;      // light SELECTED fill and a 2× stroke
  copies?: Rect[];  // the target's other copies, SELECTED stroke
  leaving?: Rect;   // HOVERED stroke at 1.5×
  pending?: Rect;   // HOVERED stroke
  refused?: Rect;   // REFUSED stroke, '#DC2626'
};
ghost?: Rect[];     // §6.5
```

`dropOverlay(indexed, plan, aim)` sets:
- `into`: `into`, `copies` and `leaving` (when `from` is a container);
- `out`: `leaving`;
- `pending`: `pending` and `leaving`;
- `refused`: `refused`;
- otherwise nothing.

The **caption** comes from `dropCaption(project, plan, aim, cover)`, which returns `{ text, detail? }`:
- It is a `<div class="canvas-drop-caption" aria-hidden="true">` rendered by CanvasArea. The controller fills and positions it imperatively, through `textContent` and `style.transform`, 16 px right of and 20 px below the pointer, kept inside the frame. It never goes through React state.
- Styles go in a new `packages/app/src/canvas/drop.css`.
- `detail` joins these parts with ` · `:
  - the aim's own detail;
  - `Lands behind "X"` when there is a cover;
  - the nesting relation type's name, from `nestingTypeFor`, when the view has more than one;
  - `Alt: move only` (`⌥: move only` on macOS), for `into`, `out` and `pending` only.

| Aim | text | aim's detail |
|---|---|---|
| into, all from World | `Put inside "T"` / `Put N elements inside "T"` | — |
| into, all from A | `Move into "T"` / `Move N elements into "T"` | `Out of "A"` |
| into, from several containers | `Move N elements into "T"` | `Out of their containers` |
| out | `Take out of "A"` / `Take N elements out of "A"` / `Take N elements out of their containers` | — |
| pending | `Hold still to put inside "L"` | `Release now: ` followed by the fallback's text with only its first character lowered (`Release now: put inside "Clinic booking"`), or `move only` |
| refused | `Cannot put inside "T"` | the reason of rule 2 |
| only-moves (copies) | `Moves only` | `"E" sits in N containers in this view` |
| only-moves (Alt) | `Moves only` | — |
| stay | no caption, or `Lands behind "X"` when there is a cover | — |

**Alt (phase b).** The controller reads `event.altKey` on every pointer move. On Alt keydown and keyup during a drag, it calls `preventDefault` (so Firefox on Windows shows no menu bar) and recomputes the aim. On press, Alt is not additive: Shift, Ctrl and ⌘ stay the selection toggles, so the two never collide.

**Drop command:** `dropCommand(indexed, project, viewId, selection, plan, aim, delta)` returns `{ command, change?, label }`. It is used for `into` and `out`; every other aim sends `moveCommand`.
- **into T:**
  - The change is `{ type: 'change-container', view, to: T.element, shapes }`, with one entry per moving element, each with its own `from`. A selection spanning containers goes inside entirely, and the caption counts it all.
  - Each `at` is `round(rect + delta − target copy's rect origin)`, relative to the copy under the pointer, keeping `storedSize`.
  - The whole set then shifts by `(max(0, 24 − min x), max(0, 48 − min y))`. It keeps its arrangement, lands inside the content area below the container's name, and never sticks out at the left or top. The container grows to the right and down to hold it.
  - A moving element that already sits directly in T only gets its position (core step 6).
- **out:**
  - The change takes the moving shapes whose landing rectangle no longer overlaps their own `fromShape`'s rectangle, with `to` absent and an absolute `at` of `round(rect + delta)`, not clamped.
  - The other moving shapes stay where they are, moved as `moveCommand` moves them.
- `moveCommand(indexed, project, viewId, selection, delta, except?)` gains `except`, the elements the change already places, and moves everything else, free shapes included.
- When the change is the only command, it is sent alone and keeps the core's label. Otherwise everything goes in one batch, labelled with the change's label plus `, and move N other shapes`.
- Shapes coming into a container land at its front (core step 5). The drag preview is drawn above everything, so the caption's `Lands behind "X"` says when a shape drawn after that container will still cover the landing place.

**`takeOutCommand(indexed, project, viewId, shape)`**, for the shape menu and the inspector:
- It takes the shape out of the container A its shape sits in, one level up: into A's own container through A's first copy, or directly in World.
- `at = (A.offset.x + A.rect.width + 40, A.offset.y)` with `storedSize`, clamped to at least (24, 48) when the destination is a container.

**`putInsideTarget(indexed, project, viewId, shape): ElementShape | undefined`**, for the shape menu's direct item. It is the topmost shape in drawing order that meets all of these:
- it holds contents;
- its rectangle holds `shape`'s centre;
- it is neither `shape`, nor anything inside it, nor the container `shape` sits in;
- its element is not blocked.

Its change carries `at` = the shape's current place relative to the target, clamped as a drop is.

**`moveCommand`** (`packages/app/src/canvas/gestures.ts`) dedupes positions by `positionKey`. This fixes today's refusal ("given twice") when dragging the contents of a container shown in several copies.

### 6.5 Confirmation: the delete-preview case

- When some shape leaves a container, the controller computes `previewChangeContainer(project, change)` before sending the change. It also computes it for every change from the shape menu, the chooser and the inspector.
- When `preview.problems` is not empty, nothing is sent. The drag ends, the shapes go back, and the first problem's message is announced. The drop plan's blocked set already prevents cycles for drags, so this mostly catches changes made elsewhere in the meantime.
- When `cascaded`, `brokenSteps` or `withData` is not empty:
  1. The drag **ends** (`renderer.endDrag()`). There is no held-drag state, and `update()` keeps its rule.
  2. The controller stores `confirming = { ghost, command, sent: false }`. `ghost` is the dragged shapes' rectangles plus `delta`. While `confirming` exists, `refreshMarks` adds `ghost` to the idle overlay.
  3. It calls `callbacks.confirmChange({ command, preview, title: label + '?', confirmLabel })`. `confirmLabel` is `Take out` for World, `Put inside` from World, and `Move` otherwise.
- **`DeleteDialog`** (`packages/app/src/canvas/DeleteDialog.tsx`) gains `action?: { title; confirmLabel; leaving: readonly Id[]; withData: readonly Id[] }`. With an action:
  - The title is `action.title`.
  - The first line reads `This takes away the relation "WhatsApp channel → Clinic booking".` In the plural it reads `This takes away the N relations that place the shapes where they are:` followed by a list.
  - When `withData` is not empty: `It has a name, a description or attributes of its own, which go with it.`
  - The cascade sentence becomes `These N relations end on it, so they go too:`.
  - Broken steps are listed as today.
  - Then come `You can undo this.`, Cancel, and the confirm button labelled `action.confirmLabel`.
- **While the dialog is open,** CanvasArea recomputes the preview from the current project on each render, so a change from Claude updates the lists.
- **Confirm** calls `controller.resolveChange(true)`: `sent = true`, then the command is sent. `update()` clears `confirming` once `sent` is set and the new scene arrives. A refusal clears it and shows the usual notice.
- **Cancel** calls `resolveChange(false)`: `confirming` is cleared and nothing changes.
- Changes from the shape menu, the chooser and the inspector go through the same preview and dialog, without a ghost.
- The host, or the control that started the change, takes the focus back either way.

### 6.6 Creating inside or next to the selected element

In `gestures.ts`:

```ts
createInsideCommand(project, viewId, componentId, container: Id): Command | undefined
```

- It returns `create-element` with `containers: [{ container, relationType }]` and **no positions**. The relation type is the first of `nestingTypesInView`.
- It returns `undefined` when the view has no such type or the container is World.
- `createAtCommand` also takes its type from `nestingTypesInView`. After the m2-fixes merge it stores its position without `pinned`.

**The add rule, in `add()` (phase b).** The target is chosen in this order:
1. **A one-shot target X**, set by `Add inside "X"…` in the shape menu. It lasts until an element is added, the selection changes, the select loses the focus, or Escape. The new element goes inside X, whatever X holds. Option: `Add inside "X"…`.
2. **Exactly one element X selected, and nothing else, whose first shape holds contents:** inside X, as today. Option: `Add inside "X"…`; title `Adds the element inside "X". With nothing selected, elements are added directly in World.`
3. **Exactly one element X selected whose first shape holds nothing and sits in container C:** inside C, next to X. Option: `Add inside "C"…`; title `Adds the element inside "C", where "X" sits. To add inside "X" itself, use Add inside "X"… in its menu or in the inspector.`
4. **Otherwise**, including a selected leaf directly in World: directly in World at the canvas center (`createAtCommand`). Option: `Add element…`.

Adding elements one after another therefore makes siblings. The element just created is a leaf, so the next add goes into its container, never inside it.

- Rules 1 to 3 use `createInsideCommand`. The stand-in row places the new shape (ELK in M3): at (24, 48) in a container with no positioned contents, below the positioned ones otherwise. It never lands over contents or over the container's name.
- The new element is the newest and unlisted, so it is drawn in front.
- Then the new element is selected, its first shape is revealed (`controller.reveal(key)` once drawn), and the inline editor opens, as today.

The relation menu's "is part of" path is unchanged: it adds a membership and writes no position.

### 6.7 Shape menu, chooser, inspector, keyboard help and announcements

- **ShapeMenu** (`packages/app/src/canvas/ShapeMenu.tsx`, new, styled like `RelationMenu`). It is a `role="menu"` with these items:
  - The four stacking items, with the toolbar's `aria-disabled` states and reasons.
  - After a separator, when exactly one element is selected and the view has a nesting relation type, the containment items:
    - `Put inside "T"` (from World) or `Move into "T"` (from a container), when `putInsideTarget` finds T;
    - `Put inside…` (when the shape sits directly in World) or `Move to…` (otherwise), which opens the ContainerChooser;
    - `Take out of "A"`, when the element sits in exactly one container A in this view (memberships, not shapes);
    - `Add inside "X"…`, which sets the one-shot add target and moves the focus to the toolbar's select (calling `showPicker()` where the browser allows it).
  - After a separator, when the menu was opened with the pointer, **Under the pointer**: up to 8 `Select "S"` items for the other shapes under the pointer (`shapesAt`), topmost first. A covered shape can then be selected and brought forward.
  - Up and Down move, Home and End jump, Enter activates, Escape closes.
- **Opening the menu (phase b, controller).**
  - **Secondary press.** A pointerdown with button 2, or on Apple platforms button 0 with Ctrl and without ⌘, is a secondary press. It records `{ point, time }`, selects the hit shape unless it is already selected, and neither toggles nor drags. On Apple platforms, Ctrl stops being additive with button 0; ⌘ and Shift stay additive.
  - **Keyboard.** Shift+F10 and the ContextMenu key on the host call `preventDefault`, open the menu for the current shape at its center, and record the time.
  - **`contextmenu` on the host** always calls `preventDefault`:
    - within 500 ms of such a key press, it does nothing more;
    - within 1,000 ms of a secondary press, it opens the menu at that press;
    - otherwise it comes from the keyboard, and opens the menu for the current shape. It never hit-tests the event's coordinates.
- **ContainerChooser** (`packages/app/src/canvas/ContainerChooser.tsx`, new). A dialog titled `Put "E" inside…` or `Move "E" to…`, with a combobox: a text input listing up to 20 elements whose names contain the typed text, ignoring case, in model order.
  - It excludes E, everything inside E through any nesting relation type, and the containers E sits in directly in this view.
  - `Move to…` lists `Directly in World` first.
  - Enter chooses and Escape cancels. Choosing sends `change-container` without `at`, through the confirmation of §6.5.
  - The inspector uses the same component.
- **Inspector** (phase b, in files subagent A owns). A new section, `ViewSection.tsx`, titled "In this view", shown for an element with shapes in the open view. `PlacesSection` keeps listing the model's containers, unchanged.
  - **Where it sits.** Each membership in this view gets one row:
    - `In "Clinic booking"` with `Take out` (`takeOutCommand`) and `Move to…` (the chooser);
    - or `Directly in World` with `Put inside…` (the chooser without `Directly in World`). This row shows whatever the element's model containers are, so Calendar gets `Directly in World [Put inside…]`.
  - **Stacking order.** For each membership:
    - `In "Clinic booking": 3rd of 4, from the back`, as an `aria-live="polite"` line;
    - `In front of it: "Scheduling"` and `Behind it: "WhatsApp channel"`, listing up to 3 overlapping shapes beside it, from the shared candidates (§6.3);
    - the four buttons, with the toolbar's states and reasons.
  - **`Add inside "X"…`.** A select listing the palette. Choosing a component sends `createInsideCommand` and selects the new element.
  - A view arranged by no relation type that nests shows `This view puts nothing inside containers: it is arranged by no relation type that nests.` and none of the containment controls.
  - Changes go through `previewChangeContainer` and the same DeleteDialog with `action`. The section reads `indexScene(scene)` from the editor context; the WeakMap makes that the same object CanvasArea uses.
- **Keyboard help** (`keys.ts`, phase b): add these rows to `CANVAS_KEYS`.
  - `Ctrl+↑ and Ctrl+↓ (⌘ on macOS), or Ctrl+] and Ctrl+[`: Bring the selection forward or send it backward, past the next shape it overlaps; these keys work wherever the focus is, except while typing
  - `Ctrl+Shift+↑ and Ctrl+Shift+↓, or Ctrl+} and Ctrl+{ (⌥⌘] and ⌥⌘[ on macOS)`: Bring the selection to the front or send it to the back of its container
  - `Shift+F10 or the menu key`: Open the selected shape's menu: stacking order, putting it inside a container or taking it out, adding inside it
  - `Alt while dragging (⌥ on macOS)`: Move without putting shapes inside a container or taking them out
  - `CANVAS_KEYS_HINT` gains `, and Shift+F10 opens the selected shape's menu`.
- **Announcements** go through the canvas's existing live region:
  - a restack shortcut or button that changes nothing says its reason;
  - one that works says its done text;
  - a change of container says its label, as in `Put "Calendar" inside "Clinic booking".`
- **Covered shapes** stay reachable with the arrow keys, the outline, Alt+Up/Down, box selection and the shape menu's "Under the pointer" list. Their selection marks are drawn above everything.

### 6.8 The user's case, end to end

1. The renderer change alone draws Calendar, the newest shape in World, in front of Clinic booking and its contents, where clicks already land.
2. The user drags Calendar over Clinic booking, outside Scheduling. Clinic booking lights up, and the caption says `Put inside "Clinic booking"` with `Alt: move only`.
3. On release, one action, `Put "Calendar" inside "Clinic booking"`, creates the relation and writes the pinned position. Calendar now sits inside Clinic booking, drawn in front of Scheduling.
4. Over Scheduling, the caption would have said `Put inside "Scheduling"` instead.
5. When Calendar overlaps Scheduling, Ctrl+↓ (or Ctrl+[) sends it behind Scheduling and its contents, still in front of Clinic booking.
6. Without dragging: the shape menu (right-click, or Shift+F10) offers `Put inside "Clinic booking"`, because Calendar's centre lies over it. The inspector's "In this view" section offers `Directly in World [Put inside…]`.
7. Had the user pressed Send backward while Calendar still sat directly in World, Calendar would have gone behind the whole box. The canvas would have said `"Calendar" is now behind "Clinic booking", which hides it. It sits over "Clinic booking" without being inside it; Put inside "Clinic booking" orders it among the shapes there.`
8. Had the user then pressed Add element, the new element would have gone inside Clinic booking, next to Calendar, not inside Calendar.

### 6.9 Gesture and UI tests

- **stacking.test (app)**
  - On the sample and on fixtures, forward and backward skip siblings that do not overlap. Touching siblings count as not overlapping.
  - The L-shaped extent case gives no candidate and no "Behind it" entry.
  - Front and back keep the selection's order.
  - Several containers give one command, which `executeCommand` accepts, with its label.
  - Disabled reasons, including the outside-cover hint, the "sits over" hint, and the "hides it" descriptions and done texts.
  - Above 50 selected shapes, the work is deferred.
  - On `syntheticProject({ elements: 10_000, perSystem: 9_000 })`, `stackingActions` for the big system never calls `indexed.shapes.query` (spy), and builds each contents index once per `scene.shapes`.
  - `stackingShortcut` table:
    - US: Ctrl+] / Ctrl+[ / Ctrl+} / Ctrl+{;
    - Latin American: Ctrl+} and the Ctrl+Shift+} key;
    - Spain: AltGr rejected; Ctrl+↑ and Ctrl+Shift+↓ work;
    - macOS: ⌘], ⌥⌘] by code, ⌘⇧] rejected;
    - Russian: Ctrl+х by code;
    - not matched: Ctrl and + on a Spanish layout, Ctrl+ü, and Ctrl+Alt without AltGraph.
- **drop.test**
  - The plan, on the sample.
  - Patient over Clinic booking: `into`, and `executeCommand` accepts `Put "Patient" inside "Clinic booking"`.
  - WhatsApp dragged clear of Clinic booking onto empty canvas: `out`; `whatsapp-in-clinic` is deleted; the old position is kept.
  - WhatsApp dragged onto empty canvas while it still overlaps Clinic booking: `stay`.
  - Row to column: two Services added inside an empty System (448 × 144), the second dragged below the first with the pointer below the container: `stay`. The same inside an ellipse container with the pointer in the rectangle's corner: `stay`.
  - WhatsApp over Scheduling: `Move "WhatsApp channel" from "Clinic booking" into "Scheduling"`.
  - Over a sibling leaf: `pending` with a `stay` fallback, and `into` once armed. Not armable when the dragged shape holds contents and is larger than the leaf.
  - A blocked container gives `refused`, with no fall-through to the container below. The reason names the relation type, and adds "which this view does not show" for a type the view does not use.
  - Carried shapes are skipped.
  - Alt gives `only-moves`. An element with two memberships gives `only-moves` with "sits in 2 containers". An element with one membership whose container has two copies is not only-moves, and its drop out works.
  - No plan for a view arranged by no relation type that nests, including one whose only listed type no longer nests.
  - The clamp keeps the arrangement, and offsets are relative to the target copy.
  - Patient (World) and WhatsApp (in Clinic booking) dragged together onto Scheduling both go inside, and the caption reads `Move 2 elements into "Scheduling"`.
  - A fixture with a relation that ends on the nesting relation, and one with relation attributes: confirmation required.
  - Landing:
    - Calendar directly in World over Scheduling, and WhatsApp dropped into Scheduling under it: `Lands behind "Calendar"`;
    - a plain move of WhatsApp over Scheduling, with the pointer outside Scheduling: `Lands behind "Scheduling"`;
    - out to World: no cover.
  - Caption texts; the pending detail lowers only its first character.
  - `takeOutCommand` goes one level up. `putInsideTarget` finds Clinic booking for Calendar, and nothing for a shape whose centre lies over its own container.
- **gestures.test:**
  - `moveCommand` dedupes copies, and leaves out `except`.
  - `createInsideCommand` writes no position, `executeCommand` accepts it, and the shape lands at (24, 48) in an empty container.
  - Both `createAtCommand` and `createInsideCommand` take the first of `nestingTypesInView`.
- **DeleteDialog.test:** action title, confirm label, leaving sentence, data note.
- **CanvasToolbar.test:** `addPlace` option, label and title; `aria-disabled` titles; `onRestack`.
- **ShapeMenu.test:** keyboard and disabled items; containment items per case; "Under the pointer" only when opened with the pointer.
- **ContainerChooser.test:** exclusions, `Directly in World` only for Move to…, keyboard.
- **synthetic.test**
  - The default project's maximum band is 1. Its band planning has as many tiles as the planning by (containers above, cell).
  - The edge-to-edge grid has maximum band 0 and 50 shape tiles.
  - The cascade has 32 band tiles at its start and fewer than 100 overflow runs.
  - Every mode still builds and indexes in under 5 s, and reports its bands.
- **Benchmark** (`bench/synthetic.ts`, `bench/main.ts`)
  - `?overlap=stairs`: in every system, contents in staircases of 4, each 40 right and 16 down from the previous. Every tenth system's last content is placed directly in World over the system's center, without its nesting relation. Same element count.
  - `?overlap=grid`: 10,000 Services stored at 100 × 50, directly in World, edge to edge, 100 by 100, created row by row.
  - `?overlap=cascade`: 8,000 elements in systems as by default, plus 2,000 Services directly in World below them, in one cascade, each 24 right and 12 down from the previous.
  - The report adds the maximum band, a band histogram, the shape tile count and the overflow runs.
  - New **Restack** phase, in the default mode and in `stairs`:
    - 20 alternating Send to back and Bring to front of random World-level systems;
    - timed from `executeCommand` through `applyOperations`, `buildScene`, `indexScene` and `controller.update` to the end of `renderNow(true)`;
    - it reports p50 and p95, and the largest stacking list written;
    - its pass mark is p95 ≤ 100 ms at 10,000 elements. That mark must pass before the feature merges, and it does not change the fps verdict.
  - Every fps phase must pass in every mode.
- **Phase b**
  - **CanvasArea.test:**
    - dragging Patient onto Clinic booking sends `change-container`;
    - an Alt drag sends only `set-positions`;
    - dragging WhatsApp clear of Clinic booking sends `change-container` to World;
    - rearranging contents inside a container sends only `set-positions`;
    - the confirmation path shows the ghost, and Cancel changes nothing;
    - adding with an empty System selected adds next to it (in World), and `Add inside "System"…` from its menu sends `create-element` with containers and no positions;
    - add, type a name, Enter, add again makes two siblings;
    - Ctrl+↑ sends `restack` and the event is prevented;
    - ⌘[ with the focus on a toolbar button is prevented and restacks;
    - typing `[` in the inline editor is never prevented.
  - **keyboard.test:** the test "leaves Ctrl, ⌘ and Alt with [ and ] alone" becomes "Ctrl and ⌘ with [ and ] change the stacking order; Alt with them is left alone".
  - **Controller tests** (in CanvasArea.test):
    - on Apple platforms, Ctrl+click opens the menu without toggling the selection;
    - a keyboard contextmenu opens the menu for the current shape, once.
  - **Inspector.test:** `Directly in World [Put inside…]` for Calendar, Take out, Move to…, stacking lines and buttons, and `Add inside "X"…`.

---

## 7. Build order

### Step 0, plan mode (main session)

1. **Merge m2-fixes first.** Merge m2-fixes (e983c0b) into m2-canvas, with the user's OK, after confirming with both app subagents that their work is in it or rebased on it.
   - It edits files builder A (`draw.ts`, `draw.test.ts`), builder B (`gestures.ts`, `gestures.test.ts`) and phase (b) (`shell/inspector.css`, `controller.ts`) touch.
   - Every later step branches from that merge.
2. **Approvals.** The user must approve these, in plan mode, before any code:
   - the CONTEXT.md entries (§2);
   - ADR-0021 (§8);
   - the spec edits below;
   - the interaction rules:
     - drop targets: immediate for shapes that hold contents, after resting 500 ms for leaves;
     - taking out only once the dragged shape no longer overlaps its container;
     - the add rule: inside the selected container, next to a selected leaf, and `Add inside "X"…` for any element;
     - the stacking keys taken wherever the focus is outside text entry.

**Spec edits** in `docs/spec-v0.1.md`:
- **Scope table, Views row:** `One perspective each, nesting chosen per view, stacking order, collapse and expand, filters, focus mode`.
- **Project files, replacing line 134:** `Positions and stacking orders live only in view files, so moving shapes or changing which is drawn in front never touches the model; dropping a shape into or out of a container changes its containment, which is part of the model.`
- **Canvas, Edit bullet:** `create from the component palette, directly in World, inside the selected container or next to the selected element, or inside any element from its menu; connect; move, putting shapes inside a container by dropping them on it and taking them out by dragging them clear of it (hold Alt to move only), or from the shape menu and the inspector; bring to front, bring forward, send backward and send to back; rename inline; edit attributes and particularities in the inspector; and delete with a preview of what cascades; undo and redo.`
- **MCP table:**
  - Read row: `… read a view, with its positions and the order it draws the shapes in each container, or a scenario`.
  - Model row: append `; put elements inside containers and take them out`.
  - Views row: `Create views; set the perspective, nesting relation types and stacking order; collapse, expand and filter; run layout`.
- **M2 tasks:** `- [ ] Stacking order per view, drawn and pointed at in the same order; put shapes inside containers and take them out from the canvas, the shape menu and the inspector; create inside the selected container, next to the selected element, or inside any element`. M2's "Done when" is unchanged and must still hold. M2 is not tagged yet, and this fixes an M2 drawing bug.
- **Last updated:** `2026-10-24 · Ivan`.

### (a) After step 0: touches no file the two subagents own

Commit after each step. Interfaces are fixed by §3 to §6.

**1. Docs**
- `CONTEXT.md`
- `docs/adr/0021-stacking-order-and-changing-containers.md` (new)
- `docs/spec-v0.1.md`

**2. Schema** (main session). Run `pnpm build` and commit the schemas.
- `packages/schema/src/files.ts`
- `packages/schema/schemas/view.schema.json` (regenerated)
- `packages/schema/src/validate.ts`
- `packages/schema/src/test/arbitraries.ts`
- `packages/schema/src/format.test.ts`
- `packages/schema/src/validate.test.ts`

**3. Core** (main session, test-first)
- `packages/core/src/operations.ts`
- `packages/core/src/stacking.ts` (new)
- `packages/core/src/containers.ts` (new)
- `packages/core/src/commands/types.ts`
- `packages/core/src/commands/stacking.ts` (new)
- `packages/core/src/commands/containers.ts` (new)
- `packages/core/src/commands/index.ts`
- `packages/core/src/commands/views.ts`
- `packages/core/src/commands/model.ts`
- `packages/core/src/commands/draft.ts`
- `packages/core/src/rules.ts`
- `packages/core/src/check.ts`
- `packages/core/src/protocol.ts`
- `packages/core/src/index.ts`
- Tests, all in `packages/core/src/`: `operations.test.ts`, `stacking.test.ts` (new), `containers.test.ts` (new), `commands.test.ts`, `rules.test.ts`, `check.test.ts`, `protocol.test.ts` and `invariants.test.ts`.

**4. Server** (main session)
- `packages/server/src/file-plan.ts`, plus `file-plan.test.ts`, `session.test.ts` and `project.test.ts` beside it.
- Then commit, so the task-builders branch from it.

**5. Two task-builders in parallel**, each in its own worktree.

**A, drawing.** All under `packages/app/src/canvas/` unless stated:
- `scene.ts`, `hit.ts`, `spatial.ts`, `tiles.ts` (new), `renderer.ts`, `draw.ts`, `labels.ts`, `geometry.ts`;
- `packages/app/src/bench/synthetic.ts`
- `packages/app/src/bench/main.ts`
- tests: `scene.test.ts`, `hit.test.ts`, `tiles.test.ts` (new), `renderer.test.ts` (new), `draw.test.ts`, `geometry.test.ts`, and `packages/app/src/bench/synthetic.test.ts`.
- Landing A fixes the user's visible bug on its own.

**B, gestures and controls**, in the same `canvas/` folder unless stated:
- `gestures.ts`, `stacking.ts` (new), `drop.ts` (new), `drop.css` (new), `DeleteDialog.tsx`, `CanvasToolbar.tsx`, `ShapeMenu.tsx` (new), `ContainerChooser.tsx` (new);
- `packages/app/src/live/platform.ts` (new)
- tests: `gestures.test.ts`, `stacking.test.ts`, `drop.test.ts`, `DeleteDialog.test.tsx`, `CanvasToolbar.test.tsx`, `ShapeMenu.test.tsx`, `ContainerChooser.test.tsx` (all new except `gestures.test.ts`).
- B codes against A's interfaces exactly as specified:
  - from the scene: `Scene.drawing?`, `ElementShape.extent`, `CONTENTS_ORIGIN`;
  - from the index: `IndexedScene.drawing`, `rankOf`, `bands`, `indexOfKey`, `contentsOf`, `contentsIndex`, and the memoized `indexScene`;
  - from hit testing: `outlying`, `overlapWithContents`, `hitAt(…, exact?)`, `shapesAt`;
  - from geometry and the renderer: `overlaps`, `holdsPoint`, `Overlay.drop`/`ghost`.
- Until A lands, B may stub the contents index with one built from `scene.shapes`, and `shapesAt` with `indexed.shapes.at`.

**6. Main session.** Merge A and B; run `pnpm typecheck`, `pnpm lint` and `pnpm test`; run the benchmark in every mode.

### (b) After both subagents' branches are merged

At HEAD 03ed1d9, tasks (d) at 372f034 and (e) at a60dcb9 are merged, and step 0 merged m2-fixes. Confirm that neither subagent has commits left unmerged before starting. Files:
- `packages/app/src/canvas/controller.ts`
  - `ControllerCallbacks` gains optional `confirmChange` and `menu(at, shape, under)`.
  - Constructor option `{ caption?: HTMLElement }`.
  - The `drag` gesture gains `plan`, `aim`, `alt`, `cover` and the last pointer position.
  - The drop flow: the plan at drag start; the aim per move; the landing check at most once per frame; overlay and caption on change; the rest timer; Alt handling; the drop through `dropCommand`; the preview, confirmation with ghost, and `resolveChange`.
  - Secondary presses (button 2, and Apple Ctrl+click without ⌘, no longer additive), `contextmenu`, Shift+F10 and the ContextMenu key, as in §6.7.
  - `hitAt(…, (shape) => this.renderer.showsOutline(shape.key))`, in every call.
  - `cancel()` clears the timer and the caption.
  - The `onArrow` comment becomes "Ctrl and ⌘ with ↑ and ↓ are the stacking order's, which the canvas area handles for the whole window; with ← and → they are left alone".
- `packages/app/src/canvas/CanvasArea.tsx`:
  - the window keydown listener for the stacking keys (§6.2);
  - the caption element and the `drop.css` import;
  - toolbar props (`stackingActions` in a `useMemo`, `addPlace`, `onRestack`);
  - the add rule with the one-shot target and reveal;
  - `changing` state with the DeleteDialog `action`;
  - ShapeMenu and ContainerChooser;
  - announcements.
- `packages/app/src/canvas/navigation.ts`: `nearestTo` breaks ties with `indexed.rankOf[at]`. `drawnRelations` stays as it is, in containment order.
- `packages/app/src/canvas/keys.ts`: the new `CANVAS_KEYS` rows and hint.
- The inspector:
  - `packages/app/src/shell/inspector/ElementInspector.tsx`, which adds the section;
  - a new `packages/app/src/shell/inspector/ViewSection.tsx`;
  - `packages/app/src/shell/inspector.css`.
- Tests: `CanvasArea.test.tsx` and `keyboard.test.tsx` in `canvas/`, and `packages/app/src/shell/Inspector.test.tsx`.
- **No change** to `Shell.tsx`, `ModelPanel.tsx`, `outlineItems.ts`, `Outline.tsx`, `announce.ts`, `KeyboardHelp.tsx` or `Header.tsx`. `scene.shapes` keeps its order, the layout cache lives inside `buildScene`, `indexScene` is memoized per scene, and the stacking keys live in CanvasArea.
- Then run typecheck, lint and tests, the benchmark (M2's "Done when" and the restack mark), and `spec-reviewer`.

---

## 8. ADR-0021: full text

File: `docs/adr/0021-stacking-order-and-changing-containers.md`

```markdown
---
status: accepted
---

# Stacking order per view, drawn exactly, and changing containers from the canvas

Each view keeps a stacking order: for each container, and for World, the order in which the anchored shapes directly inside it are drawn, from back to front. These choices extend the file format of ADR-0019 without changing anything already stored:

- **Stored per container.** A view file holds an optional `stackingOrder`, written after `freeShapes`: a map from a container's id, or World's id for the shapes directly in World, to element ids from back to front. It is keyed by the container element, like positions, so every copy of a container draws its contents in the same order.
- **Only what differs from the default.** The shapes a list does not name are drawn in front of the ones it names, in model order; a view without the field draws everything in model order. A new element is last in model order, so it comes in front with nothing written. Each change writes the shortest list that gives the order it leaves. The first time an older shape comes in front of newer ones in a container, whether by Bring to front, by Bring forward past a newer one or by coming into the container from the canvas, the list names every shape drawn behind it there, up to all of that container's contents; later changes there add or remove single ids.
- **What it orders.** Only shapes that sit directly in the same container. A shape is drawn with everything inside it, so a container never hides its contents, and a shape is in front of or behind a whole container, never between it and its contents. Relations are drawn in front of every element's shape, and free shapes in front of relations.
- **Lifecycle.** A deleted element leaves every list, and a deleted container's list goes. Leaving a container, or a view no longer nesting by a relation type, changes no list: an id whose element no longer sits there is ignored, and goes the next time that list changes. A list can therefore name more than it needs until it next changes.
- **Which relation types arrange a view.** A view is arranged by the nesting relation types it lists that a package in use defines and that nest. The canvas and the core ignore the others, which checking a project reports as warnings, so a view's containment is always part of the model's, which never forms a cycle (ADR-0019).
- **Drawn exactly.** Two shapes overlap when their insides share a point; shapes that only touch do not. The canvas draws the shapes in the stacking order and points at them in the same order. Each shape goes in the lowest band above every earlier shape it overlaps, the bands are drawn in order, and the shape under the pointer is the last one in that order whose drawn outline holds the point, which is the one drawn on top; while a shape is drawn as a plain block, its rectangle counts. Where shapes overlap only through containment, or only touch, the shapes directly in World share the first band, their contents the second, and so on, so the canvas draws as many tiles as before. Where the outlines of two touching shapes meet, a strip one stroke wide may be drawn in either order. A label never leaves its shape; a name too long for it ends in "…".
- **Two commands, without geometry.** `restack` brings shapes to the front, sends them to the back, or puts them just in front of or behind another shape beside them; the canvas works out "forward" and "backward" as the next shape that overlaps. `change-container` puts elements inside a container or takes them out to World. For each element, it deletes the relations of the view's nesting relation types that placed its shapes where they were, with the relations that end on them; it creates one relation to the new container, of the type of the relations it deleted when they are all of one type, or else of the view's first nesting relation type; it sets the positions given; and it brings the element to the front there. A shape that stays in its container only gets its position. Claude uses the same two commands, and reads each container's order as the canvas draws it, back to front, with live ids only.
- **From the canvas.** Dropping shapes onto a shape that holds contents puts them inside it. Dragging them clear of their container, onto no other container, takes them out; a shape that still overlaps its container stays in it, and the container grows. A shape that holds nothing becomes a target once the pointer rests on it for half a second. A container that would form a cycle is refused, and the drop only moves; holding Alt only moves. The canvas says what a drop will do before it is released, and when the shape will land behind another: the drag is drawn above everything, but a drop keeps the stacking order, except that shapes coming into a container come to its front. The delete preview comes first when relations end on a relation that goes, a scenario step uses one, or one has a name, a description or attributes of its own. Until nesting with several containers settles how copies behave (M3), an element that sits in several containers in the view only moves when dragged; the shape menu and the inspector change one membership at a time, and put an element that sits directly in World inside a container from the keyboard. Add element creates the new element inside the selected element when it holds contents, and next to a selected element otherwise, so adding one after another makes shapes side by side; Add inside "X"… puts the next one inside any element.

We chose this because a shape that looks inside a container without being part of it, or that is drawn behind what a click goes to, misleads whoever reads the model; because stacking, like positions, is each view's own choice (ADR-0009); because keying it like positions keeps copies consistent (ADR-0007, ADR-0019); because lists of ids read one per line in a diff, and changes after the first one in a container add or remove single ids, as the history stores them (ADR-0017); and because deleting and recreating a nesting relation keeps what was said about the old membership from silently becoming true of the new one (ADR-0010).

## Considered options

- **The order in the model, an attribute or an appearance**: rejected. The model is shared by every view, and the same element sits differently in each (ADR-0009).
- **An order field on positions, or the order of the positions list**: rejected. Layout and forgetting positions rewrite them, and shapes placed by layout have none.
- **Keyed by the path of containers down to the shape**: rejected. Copies of a container would disagree, and the path changes whenever containment does.
- **One entry per shape with a rank**: rejected. Ranks need renumbering and read poorly in a diff.
- **Entries anchored to a shape beside them, such as "x in front of y"**: rejected. Each restack would write one entry, but every delete and containment change would have to move the entries anchored on what left, and a file would depend on how its order was reached unless a tie-broken longest increasing subsequence chose the entries. The lists cost one listing per container, once.
- **Unlisted shapes behind the listed ones**: rejected. A new shape would appear behind what is already there.
- **Drawing all shapes directly in World first, then all their contents, and so on, then by tile**: rejected. Every shape directly in World was drawn under every shape inside a container, related or not, and drawing disagreed with what a click selected.
- **Counting shapes that only touch, or come within a stroke of each other, as overlapping**: rejected. A row or grid of touching shapes would chain into hundreds of bands and draw one tile per shape.
- **PixiJS's own sorting of what it draws**: rejected. It orders the objects inside one PixiJS display object only, so it cannot order shapes across tiles.
- **Changing the `to` end of the nesting relation to move an element**: rejected. The relations that end on it, its attributes and the steps that use it would come to mean the new container.
- **Dragging never changes containment**: rejected. It leaves shapes that look inside a container without being part of it.
- **Taking a shape out as soon as the pointer leaves its container**: rejected. Arranging the contents of a container that sizes itself to them would take them out of it.
- **Relations, notes and arrows inside the stacking order of element shapes**: rejected for v0.1. A relation hidden under a shape could no longer be followed.

## Consequences

- A drag can change the model, and so every view that nests by that relation type; the history names it, as in `Put "Calendar" inside "Clinic booking"`.
- A chain of overlapping shapes needs one band per shape in it, up to 32 bands; beyond that, shapes are drawn in runs of consecutive shapes that share a cell, still in order.
- The first time an older shape comes in front of newer ones in a container, the list names every shape there drawn behind it, up to all of that container's contents, such as 399 ids in a World of 400 shapes; later changes add or remove single ids.
- A view that lists a relation type that no package defines, or that no longer nests, draws no containment through it.
- Builds older than this refuse view files that hold `stackingOrder`, and the live protocol version is 2.
```

---

## 9. Risks, and the tests that cover them

| Risk | Mitigation and test |
|---|---|
| `set-view` or `viewProperties` drops `stackingOrder` on a rename | Carried over in `set-view`; tests in operations.test and commands.test ("update-view keeps it"); invariants assert lists survive. |
| An emptied list leaves `{}`, `[]` or `undefined`, breaking exact undo or the server's "unchanged" check | `withItems` deletes the key, then the field; the schema forbids empty values; operations.test checks with `isDeepStrictEqual`; invariants check views after every undo with `isDeepStrictEqual`. |
| `file-plan.ts` silently skips the new collection | The new case plus an exhaustive `never` default; file-plan.test. |
| The schema's first `propertyNames` breaks a schema test or gives a raw message | `IDLE_KEYWORDS` gains it; `validate.ts` gains its message; validate.test. |
| World gets two keys | Only World's id can name it; commands normalize an absent container or World's id; check.test and stacking.test. |
| A drop writes a relation of an unknown or non-nesting type, and the project stops opening | `nestingTypesInView` everywhere; types resolved with `draft.relationType` and checked for `nests`; commands.test; invariant intents that list `systems.is-part-of`, drop systems, and toggle `nests`, caught by `expectRulesKept`. |
| An element given twice gets two memberships | One relation per element; commands.test. |
| Preview and command disagree | The preview runs the command on a throwaway draft; commands.test compares their problems. |
| Large first lists in a diff | Documented in §3 and ADR-0021; the Restack phase reports the largest list; later changes are single ids. |
| Stacking problems reported against the model file | Subjects `[view.id]`; check.test and project.test. |
| Touching shapes chain into hundreds of bands and tiles | Strict overlap; the `grid` benchmark mode; synthetic.test asserts band 0 and 50 tiles. |
| A content falls into or below its container's band beyond the cap | Exact overflow order (proof in §5.3); tiles.test with 40 stacked shapes; hit.test's band property. |
| Long overlapping chains make one tile per shape | Overflow runs of up to 64; the `cascade` benchmark mode; synthetic.test bounds the runs; fps phases in every mode. |
| One full drawing per frame leaves small tiles as blocks for seconds | Budget in shapes (200 per frame, at least one tile); renderer.test with 300 one-shape tiles. |
| Labels bleed across shapes in one band | Labels fitted to their room; draw.test; the hit.test property covers rectangles. |
| Tile churn or block flashes on restack, drag start or drag end | Order-free signatures; reuse by (cell, signature); tiles made from fully drawn ones drawn at once (up to 200 shapes); tiles.test swap case; renderer.test split case. |
| Clicks in a shape's corners go behind it while its tile shows blocks | `showsOutline` per shape; hit.test with `exact` false; renderer.test. |
| Restack latency at 10,000 elements | Layout cache, index caches, fast paths; the benchmark's Restack phase (p95 ≤ 100 ms). |
| Selecting a big container stalls | Contents indexes, shared candidates, no shape-index queries; stacking.test spy. |
| The default benchmark regresses | synthetic.test asserts maximum band 1 and as many tiles as the containment planning; M2's fps phases rerun. |
| Old elements entering a container land behind | Core step 5 puts entering elements in front; commands.test (Patient into Clinic booking ends in front of Scheduling). |
| A drop lands behind a shape although the preview showed it on top | `Lands behind "X"` in the caption; selection marks on top; drop.test landing cases; ADR-0021 states the rule. |
| A relation's own data is lost silently | `withData` triggers the dialog; containers.test and drop.test. |
| Accidental nesting into a leaf | Rest-to-arm (500 ms, 8 px); size and contents bound; pending caption and outline; Alt; one undoable action; drop.test with fake timers. |
| Rearranging contents takes them out of their container | `out` only once the dragged shape no longer overlaps its container; containers tested by their rectangle; drop.test row-to-column and ellipse cases; CanvasArea.test. |
| Repeated adds nest each new element inside the last | Add rule (§6.6): leaves get siblings; explicit `Add inside "X"…`; CanvasArea.test add-name-add. |
| No keyboard path to put a World element inside | Shape menu `Put inside "T"` and `Put inside…`; inspector `Directly in World [Put inside…]`; ShapeMenu.test and Inspector.test. |
| Send backward hides a shape behind a container it only sits over, without saying why | "Hides it" descriptions and done texts; "sits over" hint; shape menu's direct `Put inside`; stacking.test. |
| A refused container lets the drop fall through | The walk stops with `refused`; drop.test. |
| A refusal reads as false for a containment the view does not show | The reason names the relation type and says the view does not show it; drop.test and commands.test. |
| Cycles through nesting types the view does not show | `blocked` covers every type; the core re-checks; commands.test and the invariants' cycle property. |
| Copies: which membership changes | Only-moves for elements with several memberships in the view, said in the caption; memberships counted, not shapes; drop.test; the inspector is explicit per container. |
| A selection spanning containers half-enters | Every moving shape goes inside; the caption counts them all; drop.test. |
| `moveCommand` refused for copies | Dedupe by `positionKey`; gestures.test. |
| Shortcut conflicts (AltGr relation keys, Ctrl and + zoom, ⌘⇧ tab switching, Back/Forward) | The rules in §6.2; the window-level listener prevents every match outside text entry; stacking.test table; CanvasArea.test with the focus on a toolbar button. Residual: the Spain layout uses Ctrl+↑/↓ for forward/backward; on a Spanish Mac, ⌥⌘ with the bracket key gives front/back rather than forward/backward (documented). |
| macOS Ctrl+click toggles the selection before the menu opens; keyboard context menus open twice or hit-test the wrong place | Apple Ctrl+click is a secondary press; the menu opens from one path; CanvasArea.test. |
| Alt reactions in browsers (the Firefox menu bar) or window managers | `preventDefault` on Alt keydown and keyup during drags; manual check in Firefox, Chrome and Edge on Windows; the inspector and undo as fallbacks. |
| Concurrent change while the confirmation dialog is open | Preview recomputed on render; the core re-checks on confirm; a refusal clears the ghost with a notice; CanvasArea.test. |
| The outline or keys follow the drawing order | `scene.shapes` stays in containment order; existing outline and navigation tests unchanged; scene.test asserts `shapes` is identical with and without stacking. |
| The layout cache serves a stale scene once M3 adds inputs | Reuse only when every view field but `stackingOrder`, `name` and `description` is identical; scene.test changes each other field. |
| Unmerged m2-fixes conflicts with the builders | Step 0 merges it first; builders branch after it. |
| Older builds and mixed tabs | Schema extension plus protocol version 2, which gives a clear "different versions" message; protocol.test. |
| M3 interplay | Bands are computed before filters and collapse apply. ELK reads containment and model order only. Animated layout computes bands from final positions. Dropping on a collapsed container sends `change-container` without `at`. The layout cache compares every view field. These are noted in ADR-0021 and checked by the M3 spec-reviewer pass. |
| Scope: this is new M2 scope | Step 0 needs the user's OK on the term, the ADR, the spec edits and the interaction rules before any code (CLAUDE.md workflow). |

---

## Appendix: review findings

**Rejected outright: none.** Every claim about existing code held against m2-canvas@03ed1d9 and m2-fixes@e983c0b, line references included. Two pairs of findings describe one problem each, and got one fix each: the add-inside chain, and landing behind a shape after a drop.

**Fixes that differ from the one proposed, and why:**
- **Unknown or non-nesting default type (high).**
  - *Proposed:* make the cycle check follow the model's nesting types plus the view's listed types.
  - *Done instead:* the canvas and the core ignore listed types that no package defines or that no longer nest (`nestingTypesInView`). Every view's containment is then part of the model's, so the existing model-wide check is enough, and the scene stops showing containment the core does not know.
  - *Not done:* refusing `update-project` and `define-relation-type` while a view lists the type. `checkProject` already warns, and the views then draw no containment through it.
  - *Already there:* the "turn off nests on a listed type" intent exists (`toggle-nests`). Only the variant that lists `systems.is-part-of` before dropping systems is new.
- **Prefix-list size (medium).** The finding's second option is taken: keep the lists and say plainly what they cost. Anchored entries are rejected in ADR-0021's considered options: deletes and containment changes would have to re-anchor entries, and a canonical form would need a tie-broken LIS.
- **Canonical-list claims (low).**
  - *Done:* the claims and the test are corrected.
  - *Not done:* recomputing the shortest list for every list a delete touches. It would need the containment of each touched list during a delete, for no visible change.
- **"Never set" wording (low).**
  - *Done:* CONTEXT.md and ADR-0021 are reworded.
  - *Not done:* applying the front rule in every view that nests by a new relation's type. A drop in one view would then rewrite other views' stacking.
- **⌘[ leaves the app (medium).**
  - *Done:* the keys are handled for the whole window, with Header's guards, rather than only on the canvas frame and the inspector section. That also covers the model panel and anywhere else the focus can be.
  - *Not done:* dropping the bracket keys on macOS. The keys are reserved for the stacking order.
- **Made tiles flash (medium).** The immediate full drawing is capped at 200 shapes per rebuild. Uncapped, a large restack or drag start could stall a frame. Beyond the cap, tiles start as blocks, as today.
- **Plain move lands behind (low).**
  - *Done:* the caption warns (`Lands behind "X"`).
  - *Not done:* adding a Bring to front to the move's batch. Ordinary moves would then write stacking lists, often long ones (§3).
- **Landing check cost (low).** The check runs for the grabbed shape only, at most once per frame, through the contents indexes rather than the shape index. A dragged container never makes it read its own contents.
- **Banned words (low).** Both remedies are taken: the ban is limited to what users and Claude read and to new identifiers, and the new identifiers are renamed anyway (`contents`, `inWorld`, `PlannedTile`). The m2-fixes merge already renames `linked` in a test.

**Found while verifying, not in the findings, and fixed above:**
- The schema's first `propertyNames` would fail `format.test.ts`'s keyword test, and needs a message in `validate.ts` (§3).
- `change-container` builds the model index three times, not twice. `putPositions` runs after the inserts (§4.4).
- The inspector needs the same `IndexedScene` as the canvas, so `indexScene` is memoized per scene (§5.2).