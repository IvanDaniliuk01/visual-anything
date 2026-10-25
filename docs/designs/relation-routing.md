# Relations routed by hand, as in draw.io

Base: `develop` at f69223a. Every path below is relative to the repository root. Task W13 builds sections 3 and 4 (the schema, the core, the server's file plan and Claude's tools); sections 5 to 7 are the contract for the canvas task that follows it, which owns `packages/app/src/canvas/scene.ts`, `renderer.ts`, `controller.ts`, `route.ts`, `hit.ts` and the menus. The decision is ADR 0039.

---

## 1. What the user asked for, and what changes

The user said: "you have to let me edit the arrows however I want, that is, have them leave from wherever I want, like draw.io". The M3 task reads: each end attached to a connection point or to any point of a shape's border, chosen by dragging it; bend points added, moved and removed; orthogonal segments dragged; straight, orthogonal or curved; Reset route goes back to the automatic route.

Where the code stands at f69223a:

- `canvas/route.ts` routes every relation orthogonally between rectangles, or to the middle of another relation; nothing about a route is stored.
- `scene.ts` draws each relation between the first shapes of its ends, offsets relations between the same ends by 24 units, and lays the whole view out again whenever any view key but `stackingOrder`, `name` and `description` changes.
- `core/src/appearance.ts` resolves `connectionPoints` per element, but nothing draws or uses them yet (the connection-points task and §3.5 of `components.md` do that). ADR 0022 keeps the choice of connection point out of the model: a relation attaches to the one facing its other end.

What changes:

| Piece | What the person gets | Where |
| --- | --- | --- |
| Storage | A view keeps, for each relation routed by hand, only what differs from the automatic route: each end's attachment, the bend points and the style | `ViewFile.routes`, view files only (ADR 0009) |
| Commands | `set-route` and `reset-route`, one undoable action each, labelled by author | `core/src/commands/routes.ts` |
| Upkeep | Deletes take routes with their relations; a removed connection point keeps the line where it was; a moved end goes back to automatic | `rules.ts`, `commands/model.ts`, `settleRoutes` |
| Resolver | `routeOf(state, view, relation)`: the ends, bend points, style and frame the scene draws | `core/src/routes.ts` |
| Drawing and gestures | Handles at ends, bend points and segment middles; snapping to connection points and borders; curves | the canvas task (sections 5 to 7) |
| Claude | `set_route` and `reset_route` | `server/src/claude/tools.ts` |

What does not change: the model. A route is drawing, like a position: it lives in the view file and never in the model, so ADR 0022's "relations store nothing about connection points" still holds.

---

## 2. Terms

These are the words used below, in code, UI and docs. CONTEXT.md does not have them yet; the main session adds them with the merge (section 10).

**Route**:
The path a relation's line takes in a view: where it attaches to each end, the points it bends at, and its style. Automatic unless chosen by hand; a view keeps only what was chosen by hand, and Reset route goes back to the automatic route.
_Avoid_: path, connector, edge route, waypoints

**Bend point**:
A point a relation's route passes through, set by hand in a view, relative to the container whose shape holds both of the relation's ends.
_Avoid_: waypoint, control point, vertex, elbow

**Route style**: `orthogonal` (the default), `straight` or `curved`, as the Style control says.

In code: `RelationRoute`, `EndAttachment` (an end attached at a `ConnectionPointAttachment` or a `BorderAttachment`), `bendPoints`, `RouteStyle`, `ResolvedRoute`. "Attach" is CONTEXT's verb for where relations meet shapes; "attachment point" stays avoided as a synonym for connection point. ELK's "port" stays inside the layout adapter.

---

## 3. File format (`packages/schema/src/files.ts`)

`ViewFile` gains one optional key, written last:

```ts
  /**
   * The relations this view routes by hand, by relation id, each with only what differs from its
   * automatic route: where its ends attach, the points it bends at, and its style. A relation it does
   * not name is routed automatically, and a route whose relation is no relation of the model is
   * ignored.
   */
  routes?: Routes;
```

```ts
/** @minProperties 1 */
export type Routes = Record<Id, RelationRoute>;

/**
 * How a view routes one relation by hand: only what differs from its automatic route. An end left
 * out attaches where the automatic route attaches it, a route without bend points runs directly
 * between its ends, and one without a style is orthogonal.
 *
 * @minProperties 1
 */
export interface RelationRoute {
  from?: EndAttachment;
  to?: EndAttachment;
  /** `straight` or `curved`; left out, orthogonal. */
  style?: 'straight' | 'curved';
  /**
   * The container whose shape the bend points are relative to: one that holds the shapes of both
   * ends, the nearest when they were set. Left out, they are relative to the canvas. While its shape
   * no longer holds both ends, the bend points are ignored, and they come back with the containment.
   */
  container?: Id;
  /** In order from the `from` end, in canvas units, relative to `container`'s shape or the canvas. @minItems 1 @maxItems 64 */
  bendPoints?: Point[];
}

/** @discriminator kind */
export type EndAttachment = ConnectionPointAttachment | BorderAttachment;

export interface ConnectionPointAttachment {
  kind: 'connection-point';
  /** One of the end's connection points. @minLength 1 @maxLength 32 */
  name: string;
}

export interface BorderAttachment {
  kind: 'border';
  side: 'top' | 'right' | 'bottom' | 'left';
  /** From 0 at the side's left or top end to 1 at its right or bottom end. @minimum 0 @maximum 1 */
  at: number;
}
```

A view file with two hand routes:

```json
  "routes": {
    "booking-calls-api-k3f9q2": {
      "from": { "kind": "connection-point", "name": "out" },
      "to": { "kind": "border", "side": "top", "at": 0.25 },
      "style": "curved",
      "container": "clinic-booking",
      "bendPoints": [{ "x": 320, "y": 96 }]
    },
    "api-reads-db-p0x7aa": { "style": "straight" }
  }
```

Why this shape:

- **Keyed by relation id**, like `stackingOrder` by container: one route per relation and view by construction, sorted keys in the file (the writer sorts free-form keys), one block per route in a diff.
- **Only what differs.** Orthogonal is the absence of `style`, an automatic end is the absence of `from` or `to`, and no bend points is the absence of the list. The schema accepts only that canonical form (`minProperties` on both levels, no `"orthogonal"` value), so a file has one spelling for each route.
- **A fixed point is `{ side, at }`**, as draw.io stores its constraints and as connection points already are, so one `at` rule serves both and survives resizing.
- **Bend points relative to a container**, stored explicitly. Moving the container moves the route; a relation inside "Clinic booking" keeps its shape wherever the booking box goes. `container` is stored, not recomputed, so a change of containment never reinterprets the numbers against another shape: they are ignored until that container holds both ends again, as positions stay when an element leaves its container (ADR 0019).
- **Every new key is optional**: format version 1 stays (ADR 0022's rule). A build without `routes` refuses view files that use it, so the schemas are regenerated and committed with the change.

`pnpm build` regenerates `packages/schema/schemas/view.schema.json`.

---

## 4. Core

### 4.1 Operations (`operations.ts`)

A new list, so the history, undo and the live connection need nothing else:

```ts
| { name: 'routes'; view: Id }          // Collection
routes: RouteEntry;                      // CollectionItems

/** A route of a view with the relation it routes: how operations carry one. */
export interface RouteEntry { relation: Id; route: RelationRoute }
```

- `keyOf` is the relation id. The list is the view's `routes` map read in key order; writing it back builds the map in list order, and an empty list removes the key, so undo gives the view back exactly (`toStrictEqual`).
- `ViewProperties` leaves out `routes` too, and `set-view` keeps the view's current routes whatever its properties carry: `viewProperties()` in `commands/views.ts` copies a whole view, so a `set-view` made from it may hold a stale copy of the map, which is ignored.
- The server's `file-plan.ts` saves the view file for the `routes` list.

### 4.2 The resolver (`routes.ts`)

```ts
export type RouteStyle = 'orthogonal' | 'straight' | 'curved';

export type ResolvedAttachment =
  | { kind: 'automatic' }
  | { kind: 'connection-point'; name: string; side: Side; at: number }
  | { kind: 'border'; side: Side; at: number };

export interface ResolvedRoute {
  relation: Id;
  from: ResolvedAttachment;
  to: ResolvedAttachment;
  style: RouteStyle;
  /** The bend points that apply, relative to the shape of `bendPointsIn`, or of the canvas; empty when none do. */
  bendPoints: readonly Point[];
  bendPointsIn?: Id;
  /** The nearest container whose shape holds both ends' shapes; absent for World. New bend points are given relative to it. */
  frame?: Id;
  /** Whether the view keeps a route for the relation. */
  byHand: boolean;
}

/** `undefined` for an unknown view or relation, and for a relation the view draws as containment. */
export function routeOf(
  state: ProjectSnapshot,
  view: ViewFile | Id,
  relation: Id,
  shapes?: RouteShapes,
): ResolvedRoute | undefined;

/** What a caller that has placed the shapes already, such as the scene, hands over. */
export interface RouteShapes {
  /** The element ids from World's contents down to the element, as its first shape's key reads them; `undefined` when it has no shape. */
  holdersOf(element: Id): readonly Id[] | undefined;
  /** Elements, World included, and the relations it draws, by id; otherwise maps made once per model. */
  readonly lookups?: RouteLookups;
}

/** A model index, or anything that looks elements and relations up by id the same way. */
export type RouteLookups = Pick<ModelIndex, 'world' | 'element' | 'relation'>;
```

**What it costs.** Measured at 10,000 elements with 100 routes, on the development machine: with the scene's shapes and lookups, resolving all 100 routes on a model just changed takes about 1.5 ms; without them, the first call on a new model works out the view's containment and the id maps (about 70 to 130 ms there), and later calls on the same model take about 2 ms for the 100. Commands pay that first cost only for `set-route` after a model change and for `settleRoutes` when a relation's end changed.

**Which shapes.** A relation is drawn between the first shapes of its ends, in containment order, as the scene does today and ADR 0023 says. The core works out, once per model and set of nesting relation types (cached on the model object), the container of each element's first shape; a caller that has placed the shapes passes their holders instead (`RouteShapes`), read from the shapes' keys. The holders of an end are the containers of its first shape from World's contents down, followed by the end itself when it is an element, since a shape holds itself; the holders of a relation that is an end are the holders both of its own ends share. The **common holders** of a relation are the longest common prefix of its two ends' holders, and its **frame** is the last of them, absent for World. So a relation between two services inside "Scheduling" has the frame Scheduling, a relation between a service and its own container has that container, and a relation from a contract to a relation has the frame of that relation's line.

**Which bend points apply.** The stored ones, when `container` is absent (the canvas), is World's id, or is among the common holders; otherwise none, and the route keeps them.

**Which attachments fit.** An end attaches by hand only where a line can meet a shape:

| End | Connection point | Border |
| --- | --- | --- |
| An element with its own shape | when its appearance has the name (the first of that name) | any side, `at` from 0 to 1 |
| A row, or a shape that draws its contents as rows (§3.5 of `components.md`) | never: such shapes attach beside their header and rows | `left` or `right` only, at the middle (`at` 0.5) |
| An element drawn inside a row, which has no shape | never | never |
| World, which has no shape, or a relation, whose line ends at the middle of the other line | never | never |

An attachment that does not fit resolves to `automatic` and stays stored, so it comes back when it fits again; a connection point that is gone is never left named (4.5).

### 4.3 Commands (`commands/routes.ts`, `commands/types.ts`)

```ts
/** Routes a relation by hand in a view, as one action, changing only what it names. */
export interface SetRouteCommand {
  type: 'set-route';
  view: Id;
  relation: Id;
  /** Where the line attaches to its `from` end; `null` attaches it automatically again. */
  from?: EndAttachment | null;
  to?: EndAttachment | null;
  /** In order from the `from` end, relative to the shape of `container`; `null` or `[]` removes them. */
  bendPoints?: Point[] | null;
  /**
   * The container whose shape the bend points are given relative to: World's id for the canvas, or a
   * container that holds both ends' shapes in the view. Left out: the nearest (`routeOf().frame`).
   * Only with bend points.
   */
  container?: Id;
  /** `orthogonal` is the default, and stores nothing. */
  style?: RouteStyle;
}

/** Routes relations automatically again in a view; those it does not route are left as they are. */
export interface ResetRouteCommand {
  type: 'reset-route';
  view: Id;
  relations: Id[];
}
```

`set-route`:

- Refuses an unknown view (`unknown-view`) or relation (`unknown-relation`), a relation the view draws as containment (`not-drawn-as-line`), an attachment that does not fit (`end-does-not-fit`), a connection point the end does not have (`unknown-connection-point`), a side that is not one of the four, an `at` outside 0 to 1, a bend point that is not two finite numbers, more than 64 bend points, a style that is not one of the three, a `container` without bend points (`invalid-command`), and a `container` that does not hold both ends (`unknown-position`, as `set-positions` says of a container its element is not in).
- Normalizes: a border attachment on a row or a row container is stored at 0.5; `orthogonal` is stored as no style; bend points are copied as `{ x, y }`; World's id as `container` is stored as none.
- Checks only what it sets: a route whose other parts a file left broken can still change.
- Keeps only what differs: when nothing is left, the route goes; when the result equals what is stored, nothing is recorded.
- Labels: changing only the style, `Draw "Client → API" curved in "Overview"` (or straight, or orthogonal); leaving nothing by hand, `Reset the route of "Client → API" in "Overview"`; anything else, `Route "Client → API" by hand in "Overview"`. The relation is named as `relationLabel` names it everywhere else.

`reset-route` refuses an empty list, an id given twice (`invalid-command`), and an id that is neither a relation of the model nor routed by the view (`unknown-relation`); it removes the routes it finds, in one rewrite above 200 (`BULK`). Labels: `Reset the route of "Client → API" in "Overview"`, or `Reset 3 routes in "Overview"`.

Both are undone exactly by their operations' inverses, and both reach Claude through `run_commands` too.

### 4.4 What happens when

| When | What happens to the route | Stored change |
| --- | --- | --- |
| An end's shape moves or resizes | Hand-chosen ends follow it: a border attachment keeps its side and `at`, a connection point follows the appearance. Bend points stay where they are in their container; an orthogonal route re-runs the segments next to the moved end. | None. |
| Both ends move together, and the shape of the bend points' container does not | The bend points move with them, in the same action as the move (the canvas sends `set-route` in the move's batch, 7.6). | `bendPoints` |
| The bend points' container moves | Everything inside moves together. | None. |
| The connection point a route names leaves the end's appearance (a component or element appearance changed, a component rederived, an element given another component) | The line stays where it was: the end attaches to a connection point now at the same side and `at`, by its new name, when there is one; otherwise to the border, at the side and `at` the point had. In the same action. | `from` or `to` |
| The relation's `from` or `to` end changes | That end attaches automatically again, since its attachment named the old end; the other end and the style stay; the bend points stay while their container still holds both ends, and go otherwise. A batch that reconnects and then sets the new attachment keeps it (4.5). | `from`/`to`, maybe `bendPoints` |
| The containment changes, or the view nests by other relation types | Nothing stored changes. Bend points whose container no longer holds both ends are ignored, and come back with the containment, as positions do. Attachments that stop fitting (an element becomes a row) are ignored, and come back when they fit. | None. |
| The relation is deleted, directly or because an end is | Its routes go with it, in every view, as the delete preview lists. | Route removed |
| The bend points' container is deleted | The bend points go with it; the route keeps its ends and style, or goes when nothing else is left. | `bendPoints` |
| The view is deleted | Its routes go with its file. | — |
| Layout runs | Layout never writes a route. ELK takes hand-chosen ends as fixed ports and is given no bend points (section 5). | None. |
| A container is collapsed | An aggregated relation stands for many and takes no route; the routes of the relations it stands for are kept, and show again when it expands. A relation whose ends both stay shown keeps its route. | None. |
| An element has copies in several containers | The route applies to the line drawn between the first shapes of its ends. When lines are drawn between other copies, those inside another copy of the frame container take the same route, since every copy of a container shares its inner layout; any other line takes the hand-chosen ends only. | None. |
| The relation ends on another relation | That end attaches to the middle of the other relation's line, as drawn with its own route; it cannot be chosen by hand. Bend points and the style work as for any route. | — |
| A scenario plays it | The travelling marker follows the route as drawn, curves included. | None. |

### 4.5 Keeping routes true after every command (`settleRoutes`)

`executeCommand` runs `settleRoutes(draft, before, start)` after each command, and after each command inside a batch (a batch itself is not settled again, so a later command in it keeps what it set). It does nothing unless some view keeps routes and the command changed elements, relations, World, components, relation types or the packages in use. Then, for every route:

1. Its relation is gone: the route goes (deletes already did this; this keeps the rule for any future command).
2. An end of its relation changed: that end's attachment goes; the bend points go unless their container still holds both ends.
3. A connection point it names was on the end before the command and is not after: it becomes the point at the same side and `at`, or a border attachment there.
4. Its bend points' container was an element before the command and is not after: the bend points go.

A name, a relation or a container that was already unknown before the command, which only a hand-edited file holds, stays as it was and resolves to automatic or is ignored; checking the project warns about it. Measured at 10,000 elements with 100 routes, settling adds under 1 ms to an edit (best of 15 runs: 27.0 ms without routes, 27.9 ms with). So, from a project that opens without such warnings, no sequence of commands, undos and redos ever leaves a route naming a relation or a connection point that is gone, which the property test checks.

### 4.6 Deletes (`rules.ts`, `commands/model.ts`)

`DeletePreview` gains:

```ts
  /** The routes that go with the deleted relations, and those that lose their bend points because the container they are relative to is deleted. */
  routes: RemovedRoute[];

export interface RemovedRoute {
  view: Id;
  relation: Id;
  /** Only its bend points go; the relation stays. */
  bendPointsOnly?: true;
}
```

`applyDeletion` removes those routes, or their bend points, before the relations and elements, one operation each or one rewrite per view above 200. `change-container`, which deletes the nesting relations its elements leave through `applyDeletion`, takes their routes with them. The property test checks that a delete removes or changes exactly the routes its preview lists.

### 4.7 Checks on open (`check.ts`)

Only warnings: a route never keeps a project from opening.

- A route for an id that is no relation of the model (`unknown-relation`): ignored.
- An attachment on World or on a relation end (`end-does-not-fit`): attaches automatically.
- A connection point the end's appearance does not have (`unknown-connection-point`): attaches automatically.
- Bend points relative to an id that is no element (`unknown-element`): ignored.

What commands can legitimately leave (an attachment on an element that has since become a row; bend points whose container no longer holds both ends) is not warned about.

### 4.8 Exports, problem codes, protocol, server and Claude

- `@visual-anything/core` exports `routeOf`, `MAX_BEND_POINTS` (64), `ResolvedRoute`, `ResolvedAttachment`, `RouteShapes`, `RouteLookups`, `Side`, `RouteStyle`, `RouteEntry`, `RemovedRoute`, and the two commands' types.
- Problem codes `unknown-connection-point`, `end-does-not-fit` and `not-drawn-as-line` join `ProblemCode`.
- The live protocol's operations can now change a view's routes, so the next protocol version should say so (section 10).
- `server/src/file-plan.ts` saves the view file for the `routes` list.
- Claude's tools: section 8.

### 4.9 Tests (written first)

- `schema/src/routes.test.ts`: valid routes validate; an empty map, an empty route, an unknown kind, a bad side, `at` outside 0 to 1, 65 bend points and `"orthogonal"` are refused; the writer orders a route's keys as listed and sorts relation ids.
- `core/src/routes.test.ts`: the operations and their inverses; `set-route` and `reset-route`, every refusal and label; changes only what is named; nothing recorded when nothing changes; `routeOf` frames, holders, rows, relations on relations and ignored bend points; every case of 4.4 and 4.5; deletes; checks on open.
- `core/src/route-invariants.test.ts`, property tests over random sequences of route commands mixed with what can break routes (deletes, moved ends, changed connection points and components, changes of container and nesting, collapse, batches, undo and redo): undo is exact and redo gives the same project; no route ever names a relation, a connection point or a container that is gone; every view file stays valid; a delete removes or changes exactly the routes its preview lists.
- `server/src/file-plan.test.ts`-style checks in `server/src/route-file-plan.test.ts`, and `server/src/claude/route-tools.test.ts` for the two tools.

---

## 5. Layout (ELK, for the layout task)

- **Hand-chosen ends are fixed ports.** For each relation the view routes with a chosen end on a shape, the layout graph gives that node a port at the attachment's side and `at` (x = `at`·width on top and bottom, y = `at`·height on left and right; `port.side` from the side), and the edge uses it. A node with any such port takes `portConstraints: FIXED_POS` when ELK keeps its size and `FIXED_RATIO` when ELK may resize it (a container sized from its contents), so the point stays where the person put it. A connection-point attachment uses the point's own side and `at`. On a row, the chosen side's port replaces the one §3.8 would choose. Automatic ends keep §3.8's rules.
- **Bend points are not given to ELK.** ELK's layered algorithm cannot keep given bend points. The relation still goes to ELK, so it counts in layering and crossing minimization, but the route ELK returns for it is dropped: the canvas draws it through its stored bend points, relative to their container, which layout never changes.
- **ELK's routes serve only automatic relations.** A relation the view routes by hand, even by style alone, is drawn by the canvas's own router between the ends ELK placed.
- **Layout writes no route.** Reset route is how a relation goes back to the automatic route; Run layout leaves hand routes as they are.

---

## 6. Drawing (for the canvas task)

### 6.1 Scene (`scene.ts`)

For every relation it draws as a line whose id `view.routes` names, the scene calls `routeOf(project, view, relation, shapes)` (relations the view does not route need no call), with `shapes.holdersOf = (id) => firstShapes.get(id)?.key.split('/')` and `shapes.lookups` made from the `elements` map and the relations it draws, which it has already, and routes the line by hand:

1. **Ends.** A chosen attachment on a shape is the point at its side and `at` on the shape's rectangle (its plate for a drawing), as connection points are placed until shapes have free geometry (M8): top `(x + at·w, y)`, right `(x + w, y + at·h)`, bottom `(x + at·w, y + h)`, left `(x, y + at·h)`. On a row or a row container it is §3.5's side end on the chosen side, whose stub runs to its lane as usual. An end on a relation is that relation's `middle`, as drawn with its own route. An automatic end next to hand-made parts faces its neighbour: the first bend point (the last, for the `to` end), or else the other end's attachment point, or else the other shape's centre.
2. **Bend points** are `routeOf().bendPoints`, offset by the scene position of the first shape of `bendPointsIn` (the canvas origin when absent). That shape holds both end shapes, since first shapes nest in first shapes.
3. **Style:**
   - *Orthogonal.* The route leaves a chosen end perpendicular to its side with a 12-unit stub; an automatic end leaves the side facing its neighbour, at the neighbour's coordinate along that side when it lies within the side (6 units from the corners), so the first leg runs straight, and at the side's middle otherwise. From there it visits each bend point and then the stub of the other end: along the current axis to the target's coordinate, then a turn, so that consecutive points that share an x or a y need no turn. A leg never runs back over a stub or through its own end's shape: when the next point lies behind the side the stub leaves from, the route first turns toward that side's nearer corner and runs 12 units clear of the shape. Zero-length segments and collinear points are dropped. Bend points that the person made are corners and stay exactly where they are.
   - *Straight.* Straight segments from the start, through each bend point, to the end. An automatic end is where the segment from the shape's centre to its neighbour crosses the shape's rectangle.
   - *Curved.* A smooth curve through the start, each bend point and the end: one cubic Bézier per span, `c1 = Wᵢ + tᵢ·L/3` and `c2 = Wᵢ₊₁ − tᵢ₊₁·L/3`, with `L` the span's chord. The tangent leaves a shape end along its side's outward normal and enters the other along the inward one (an automatic end takes the side it faces, and the point where its straight segment would cross the border); at a bend point it is the direction from the previous point to the next; at a relation end it is the chord's. Without bend points this is an S-curve between the two sides.
4. **The line** keeps today's `RelationLine` and gains:

```ts
  /** How it runs; absent: orthogonal. */
  style?: RouteStyle;
  /** Present while the view routes the relation by hand. */
  hand?: {
    route: ResolvedRoute;
    /** The bend points that apply, in scene coordinates. */
    bendPoints: Point[];
    /** Where the shape of `route.bendPointsIn` starts, or the canvas origin: stored bend points are relative to it. */
    bendOrigin: Point;
  };
  /** On a curved line, the spans the renderer draws; `route` holds them flattened. */
  curve?: { from: Point; c1: Point; c2: Point; to: Point }[];
```

   `route` stays the polyline that hit testing, `middle`, labels, arrowheads, relations ending on this one and the travelling marker read: for a curve, each span flattened into `clamp(ceil(L / 12), 4, 24)` segments. The arrowhead takes the last segment's direction, so on a curve it points along the inward normal.
5. **Siblings.** Today's 24-unit offset between relations with the same ends applies only to lines that are automatic at both ends and have no bend points.
6. **Collapse, filters and focus.** An aggregated relation takes no route. A hidden line is hidden and a dimmed one dimmed, route and all.
7. **Copies.** As 4.4 says: the line between the first shapes takes the route; a line between other copies takes it when one copy of the frame container's shape holds both of its end shapes, and only the chosen ends otherwise.
8. **What a change costs.** A change to `routes` alone keeps every shape: the scene re-routes only the lines whose route changed and the lines that end on them, and reuses the rest (the incremental path of §3.9 of `components.md`), so a route edit at 10,000 elements stays within the 50 ms an edit may take. Resolving 100 routes with the scene's shapes takes about 1.5 ms (4.2); routing one line is linear in its bend points, at most 64, and flattening a curve at most 24 points a span.

The pure routing goes in `route.ts`, next to today's:

```ts
export type HandEnd =
  | { kind: 'shape'; rect: Rect; attach?: { side: Side; at: number } }   // automatic without attach
  | { kind: 'side'; container: Rect; y: number; lane: number; side: 'left' | 'right' } // a row, §3.5
  | { kind: 'point'; point: Point };                                       // the middle of a relation

export function routeByHand(
  from: HandEnd,
  to: HandEnd,
  bendPoints: readonly Point[],
  style: RouteStyle,
): { route: Point[]; curve?: { from: Point; c1: Point; c2: Point; to: Point }[] };
```

### 6.2 Renderer (`renderer.ts`)

- A curved line is drawn with `moveTo` and `bezierCurveTo` through its spans, so it stays smooth at any zoom. A dashed or dotted curve is drawn along the flattened `route` with today's dash pattern.
- **Handles**, drawn in the overlay above everything, at a constant screen size, only while exactly one relation is selected and it is not aggregated:
  - one at each end: a 9-pixel square, filled with the selection colour when the end is chosen by hand and hollow when it is automatic;
  - one at each bend point that applies: an 8-pixel filled circle, ringed when it is the selected bend point;
  - one at the middle of each segment: a 6-pixel hollow circle. For straight and curved routes, at the middle of each span between consecutive points; for orthogonal routes, at the middle of each drawn segment longer than 24 screen pixels, end stubs excepted.
  - Contrast as the quality bar asks (3:1 for marks in both themes), from the theme's selection tokens.
- **Previews while dragging an end:** the connection points of the shape under the pointer as 6-pixel circles, the one it snaps to filled; a short tick across the border at a border point it snaps to; the whole outline when the end will attach automatically. The dragged line is redrawn in the overlay each frame and the rest of the scene is untouched.

### 6.3 Hit testing (`hit.ts`)

- Lines keep `distanceToRoute` on `route`, which for a curve is the flattened curve; its error is under half a canvas unit at the flattening above, well inside the 6-pixel tolerance. The spatial index takes the flattened route's bounds.
- While handles show, they are hit first, within 8 screen pixels, before any line or shape.

---

## 7. Gestures, menus, inspector and keyboard (for the canvas task)

### 7.1 Ends

- Dragging an end handle over **its own end's shape**, or within 12 screen pixels of its border:
  - snaps to the nearest of its connection points within 16 screen pixels of the pointer, when it has any and is not a row;
  - otherwise to the nearest point of its border (`side`, `at` rounded to three decimals; on a row, the nearer of its left and right sides);
  - deeper than 16 screen pixels inside the shape, it attaches automatically, and the whole outline shows it.
- Dropped there, it sends `set-route` with `from` or `to` (`null` for automatic).
- Over **another element's shape**, it snaps the same way and reconnects: one action, a batch of `update-relation` with the new end and `set-route` with the attachment, labelled `Reconnect "Client → API" to "Gateway"`. When `update-relation` would be refused (a nesting cycle), the caption says so before release and the drop does nothing.
- Over a relation's line, or nothing: let go, the end goes back where it was.
- **Alt** (⌥): no snapping to connection points or the grid; the end attaches at the exact border point nearest the pointer.
- A caption, as drops have, says what the release will do: `Attach at "out"`, `Attach to the top side`, `Attach automatically`, `Reconnect to "Gateway"`.

### 7.2 Bend points and segments

- **Dragging a bend handle** moves it. It snaps to the x or y of its neighbours within 6 screen pixels, so runs stay straight, and to multiples of 8 in its container while the grid shows (A3); Alt turns both off. In an orthogonal route the segments on either side stay orthogonal as it moves.
- **Dragging a middle handle** of a straight or curved route adds a bend point there, which follows the pointer.
- **Dragging a segment** of an orthogonal route, at its middle handle or anywhere along it, moves it perpendicular to itself; the segments on either side stretch, and when the moved segment touches an end's stub, a corner is added so the stub keeps leaving its side. On release, the drawn route's corners, end stubs excepted, become the bend points.
- **Removing a bend point:** double-click its handle, or click it (it becomes the selected bend point) and press Delete or Backspace. With no bend point selected, Delete deletes the relation, as today.
- Coordinates are sent relative to the shape of `routeOf().frame` (World: the canvas), rounded to whole units unless snapped.

### 7.3 Moving shapes

When a move takes both end shapes of a relation whose route has bend points, and not the shape of their container, its bend points move by the same amount: drawn so during the drag and sent in the move's action as `set-route` with the moved bend points. When the move drops the shapes into a container, the `set-route` comes after the `change-container` in the batch, with `container` set to the container they were dropped in.

### 7.4 The relation menu and the inspector

- The relation menu (`RelationMenu.tsx`, Shift+F10) and the inspector's new Route section offer: **Style**, Orthogonal, Straight or Curved; **Reset route**, disabled with "It is routed automatically" when nothing is by hand; **Attach the start automatically** and **Attach the end automatically**, when that end is chosen by hand; **Edit the route…** (7.5). The inspector also says where each end attaches (`At "out"`, `On the left side`, `Automatic`) and how many bend points there are.
- With several relations selected, Style sends one batch of `set-route`s (`Draw 3 relations curved in "Overview"`) and Reset route one `reset-route`.
- The texts go through `t()` with the rest of the app (Track L).

### 7.5 Keyboard

Edit the route… enters a mode for the selected relation, announced as "Editing the route of "Client → API". Tab and Shift+Tab move between its handles; the arrow keys move the handle; Insert adds a bend point; Delete removes one; A attaches an end automatically; Enter applies; Escape cancels.", and listed in the keyboard help:

| Key | In route editing |
| --- | --- |
| Tab, Shift+Tab | The next or previous handle: start, bend points, segment middles, end |
| Arrow keys | Move the bend point or segment by 1 unit; Shift+arrow by 8. On an end, move it along the border by 1 unit, round the corners; Shift+arrow jumps to the next connection point |
| Insert (Ctrl+Enter on keyboards without it) | Add a bend point at the middle of the selected segment, or after the selected bend point |
| Delete, Backspace | Remove the selected bend point |
| A | Attach the selected end automatically |
| Enter | Apply: one `set-route`, one action |
| Escape | Cancel, and leave the route as it was |

Every change in the mode is drawn at once and sent as one action on Enter, as a drag is sent when it ends. After it, the announcement reads the history's label.

### 7.6 What each gesture sends

| Gesture | Command |
| --- | --- |
| End dropped on its own shape | `set-route { from or to }` |
| End dropped on another shape | `batch [update-relation, set-route]` |
| Bend point moved, added or removed; segment moved | `set-route { bendPoints }` (all of them) |
| Both ends moved together | the move's batch gains `set-route { bendPoints }` |
| Style chosen | `set-route { style }`, or a batch of them |
| Reset route | `reset-route { relations }` |

A gesture that ends where it started sends nothing.

---

## 8. Claude (`server/src/claude/tools.ts`)

```text
set_route — Route a relation by hand
Routes a relation by hand in a view, as the person does by dragging its ends and bend points, as one undoable action; only what you give changes. from and to say where the line attaches to each end: { "kind": "connection-point", "name": "out" } for one of the end's connection points, or { "kind": "border", "side": "left", "at": 0.25 } for a place on its border, at going from 0 at the side's top or left end to 1 at its bottom or right end; null attaches it automatically again. An end that is a relation attaches to the middle of that relation's line and takes neither. bendPoints are the points the line passes through, in order from its from end, in canvas units relative to the shape of the nearest container that holds both ends (or to the canvas when that is World), as read_view gives positions; the answer says which container; null removes them. style is orthogonal (the default), straight or curved.
Example: { "view": "system-overview", "relation": "booking-agent-calls-api-k3f9q2", "from": { "kind": "connection-point", "name": "out" }, "to": { "kind": "border", "side": "top", "at": 0.5 } }
Example: { "view": "system-overview", "relation": "api-reads-db-p0x7aa", "bendPoints": [{ "x": 320, "y": 96 }, { "x": 320, "y": 220 }], "style": "curved" }

reset_route — Route relations automatically again
Routes relations automatically again in a view, as one undoable action: their ends attach where layout puts them, with no bend points, orthogonally. Relations the view does not route by hand are left as they are.
Example: { "view": "system-overview", "relations": ["booking-agent-calls-api-k3f9q2"] }
```

`set_route` answers with the label, the route as stored afterwards (or `"automatic"`), and the container its bend points are relative to. Both are write tools, one action each, labelled Claude, and `run_commands` lists `set-route` and `reset-route`.

---

## 9. ADR 0039

`docs/adr/0039-relations-routed-by-hand-per-view.md`, accepted, holds the decision in full.

---

## 10. Left for the main session

- **CONTEXT.md:** add Route and Bend point (section 2).
- **The spec:** its Scope table says "Curved routes (after v0.1)" under Layout, and M8 lists "curved routes". With this task, routes curved by hand are in v0.1; what stays for later is layout drawing curved routes by itself. Suggested: Layout "ELK automatic layout, pinned shapes, orthogonal routing; routes chosen by hand: ends, bend points, straight, orthogonal or curved" and Later "Curved routes drawn by layout"; M8 "curved routes drawn by layout".
- **The live protocol version:** operations can now change a view's routes, so `PROTOCOL_VERSION` should go to 4 ("4: operations can change a view's routes"), as ADR 0021 took 2 for stacking orders.
- **`commands/views.ts`:** `viewProperties()` should also leave out `routes`, so that `set-view` operations stop carrying a stale copy of them; the operation already ignores it.
- **`server/src/claude/queries.ts`:** `read_view` should list the view's routes, so Claude can read what `set_route` writes.
- **`docs/designs/README.md`:** list this file.
- **`commands/draft.ts`, optional:** `isTaken` could count the relation ids a view's routes are keyed by, as it counts the ids broken steps name. Commands never leave such a key behind, but a hand-edited file can keep a route for a relation that does not exist, which would then route a new relation created with that exact id.

---

## 11. What the canvas task must do

1. `route.ts`: `routeByHand` with the three styles, the automatic ends next to hand parts, the stubs and the detour round an end's own shape, and the flattening of curves (6.1), with tests.
2. `scene.ts`: call `routeOf` for each line the view routes; place ends, bend points and the frame as 6.1 says; add `style`, `hand` and `curve` to `RelationLine`; offset siblings only when automatic; take no route for aggregated lines; re-route only what a route change touches.
3. `renderer.ts`: Bézier curves, dashes along the flattened curve, the handles and the drag previews (6.2).
4. `hit.ts`: handles first; curves through their flattened route (6.3).
5. `controller.ts`: the end, bend point, middle and segment drags with their snapping, Alt and captions; reconnecting; removing bend points; carrying bend points with a move; the commands of 7.6.
6. `RelationMenu.tsx` and the inspector: Style, Reset route, automatic ends, Edit the route… (7.4).
7. Keyboard: the route editing mode and its rows in `keys.ts` (7.5).
8. Layout: hand-chosen ends as fixed ports, ELK's routes dropped for hand-routed relations (section 5).
9. Benchmark: a phase with 1,000 hand-routed relations, a third of them curved, panning and zooming at the 60 frames per second target, and a route drag keeping each frame within 16.7 ms.

---

## 12. Risks, and the tests that cover them

| Risk | Covered by |
| --- | --- |
| Undo of a route change leaves the view slightly different (an empty map, a key with `undefined`) | Property test: `toStrictEqual` after every undo |
| A route keeps naming a deleted relation or a removed connection point | Property test over every command that can cause it, with undo and redo |
| A delete removes routes it did not list, or misses one | Property test: removed and changed routes equal `preview.routes` |
| A command writes a route the schema refuses, so saving fails | Property test validates every view file after every step |
| A containment change reinterprets bend points against another shape | `container` stored; unit tests for ignored and restored bend points |
| A batch that reconnects then attaches loses the attachment | Settling per command inside a batch; unit test |
| Routing a curve costs frames | Flattening bounded per span; the benchmark phase in 11.9 |
