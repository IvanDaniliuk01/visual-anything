---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# Automatic routes can be straight or curved, chosen by relation type and by view

Routes chosen by hand can already be curved (ADR 0039), while every route drawn automatically is orthogonal. Nerves, vessels, signals and loose maps of ideas read better curved (first benchmark, R18), and the spec calls this "curved routes drawn by layout". The canvas, not ELK, draws every route: layout gives back places only, and ELK's own routes are dropped (ADR 0015 and ADR 0039, clarifications of 2026-10-24). So this decision says where the style of an automatic route is chosen and how the canvas draws it.

## Decision

### Where the style is chosen

- **A relation appearance gains `route`.** It is `orthogonal`, `straight` or `curved`: the style of its relations' automatic routes.
  - It inherits as `stroke` and `dash` do: from a relation's own appearance, through its relation type's, project appearances included, up to "relates to", which sets none.
  - `orthogonal` is written only to undo a style that would otherwise be inherited: a relation type's from the type it derives from, or a relation's own from its relation type.
- **A view file gains `routeStyle`.** It is `straight` or `curved`, for the relations whose appearances set no `route`. Left out, they are orthogonal.
- **The order**, so that a relation's automatic route takes:
  1. the `route` of its appearance, its own and then its relation type's chain;
  2. otherwise, its view's `routeStyle`;
  3. otherwise, orthogonal.

  So a relation type that curves by its nature, a nerve, curves in every view, and a view that curves draws curved every relation that the definitions leave to it.
- **Routes chosen by hand keep their own style** (ADR 0039, clarified):
  - a route's `style` names the style chosen when it differs from the automatic one, `orthogonal` included;
  - a route without a `style` takes the automatic style. Routes stored before this change have none, and stay orthogonal for as long as no appearance and no view chooses otherwise.
  - `set-route` keeps only what differs from the automatic route, the style included, as it keeps only what differs for the ends and the bend points.

### How the canvas draws them

- **"Drawn by layout" means drawn by the automatic router.** The canvas routes every line itself after a layout and after every later move. So no route is stored, and every move draws the routes again in their style.
- **A straight automatic route** runs from where its line leaves its `from` end's shape, toward the other end, to where it enters the other end's shape: their borders, or their outlines for free geometry (ADR 0066).
- **A curved automatic route** is the curve ADR 0039 draws for a route with no bend points: one cubic Bézier span.
  - It leaves its `from` end in the outward direction of the side it leaves by, or of its connection point's side.
  - It enters the other end in the inward direction of that end's side.
  - Its ends are where the orthogonal route would attach. An end on another relation attaches at the middle of that relation's line, along the line between the two ends.

  A curve chosen by hand and one drawn automatically therefore look alike, and the same flattening, hit testing, arrowheads, travelling markers, labels at the middle and exports serve both.
- **Relations between the same two ends** are drawn 24 units apart where they attach, as they are today, so their curves fan apart.
- **Aggregated relations** take the style of their relation type, its project appearance included, or else the view's.
- **Rows** (ADR 0023) are attached beside, as now, and a curve leaves them to the left or the right.

### What routes chosen by hand keep

A route chosen by hand keeps its ends, bend points and style through layout, and through any later change of appearances or of the view's style, which only changes what it left to them. Reset route goes back to the automatic route, in its automatic style. Layout still writes no route (ADR 0039).

### Who chooses

- **The component editor**, in a relation type's Route section: Inherited, Orthogonal, Straight or Curved.
- **A relation's inspector**, for that relation alone.
- **A view's inspector**, under Lines: Orthogonal, Straight or Curved.
- **Claude**: `set_appearance` takes `route`, and `update_view` takes `routeStyle`.

Each change is one undoable action.

## Considered options

- **Keeping ELK's own routes, with `elk.edgeRouting: SPLINES`**: rejected. ELK's routes are dropped because positions are rounded and blocks placed after ELK runs (ADR 0015). A route kept from a layout would be wrong after the first move, and storing it would contradict layout writing no route (ADR 0039).
- **Smoothing the automatic orthogonal route through its corners**: rejected. Its middle corners are where the router turns, not places the line must pass, and a curve through them wiggles.
- **Only per relation type**: rejected. A view of how signals flow wants every line curved without changing the shared definitions, which belong to a package.
- **The view's style above the appearance's**: rejected. A relation type that is curved by its nature, such as a nerve or a vessel, would straighten in every view that chose a style for its other lines.
- **A style for each relation type inside each view**: rejected for now. Hand routes, the view's style and appearances together cover the cases asked for.
- **A hand route without `style` staying orthogonal, as ADR 0039 had it**: rejected now. Dragging a bend point of a line drawn curved would turn it orthogonal.

## Consequences

- The schema gains `RelationAppearance.route` and `ViewFile.routeStyle`, and `RelationRoute.style` gains `orthogonal`. The schemas are regenerated, the format stays at version 1, and the live protocol's version goes up.
- The core resolves each relation's automatic style. `set-route` compares with it, and the commands that change appearances and views carry the new keys.
- The scene gives every line its style. A change of style changes the line's drawing, so its tiles are drawn again, and the incremental scene routes again only the lines whose style changed.
- The exports and the read-only page draw automatic curves as the canvas does.
- The benchmark gains a `?curves` variant.
- ADR 0039 gains a clarification, and CONTEXT.md's **Route** says where an automatic route's style comes from.

## Clarifications

- 2026-10-26 (M8b, Seam 3): **the scene's lines.**
  - Every line carries its style, automatic ones included. Orthogonal stays written as no style, so that the routes that go around shapes (ADR 0039) still know the lines they route.
  - An automatic straight or curved line is routed as a route chosen by hand with no bend points is, without being one: it has no `hand`, and lines between the same two ends still run beside each other.
  - A change of the view's `routeStyle` routes every line again; a change of a relation's `route` routes its line again, and one of a relation type's changes the definitions, which builds the scene again.
- 2026-10-26 (M8b, W53): **how the canvas draws automatic straight and curved routes** (`canvas/routing/automatic.ts`).
  - **A curve's ends are those of the automatic orthogonal route**: the stand-in route's ends between the boxes, or, at a shape with connection points, the point facing the other end; then carried in to an outline (ADR 0066). It leaves along its side's outward direction and enters along the other's inward one. Lines between the same two ends therefore attach 24 units apart, or 12 at a connection point, as orthogonal lines do, and their curves fan apart.
  - Where the orthogonal route runs inside one end's shape to the other, as from a container to what it holds, that end has no side to leave by: the curve leaves it straight toward the other end.
  - **A straight route runs between its ends' aims**, the middle of a box or the inner point of an outline, from where that line leaves one shape to where it enters the other. Lines between the same two ends are each moved across that line by their offset, the same way across whichever way each runs, so that they run parallel, 24 units apart. A moved aim outside its shape is brought back to its box; on an outline, a moved line that crosses nothing falls back to the line between the aims.
  - Two shapes that overlap or touch, as a container and what it holds, are joined by the straight segment the orthogonal route draws between them. Ends on rows, and ends with connection points, keep the straight ends routes by hand have: beside the row, at the facing point.
  - Routes chosen by hand keep the ends they had: a curve chosen by hand with automatic ends still attaches where the line from its shape's middle, or its outline's inner point, leaves it.
- 2026-10-26 (M8b, W55): **the controls.**
  - **A relation type's Route section** holds Automatic routes: Inherited, which names the style inherited or says that each view's Lines draw them, then Orthogonal, Straight and Curved. It changes at the level the project can change (`set-relation-type-appearance`), as its stroke does, so a built-in relation type can be curved for one project. Orthogonal writes `orthogonal`; Inherited takes the style out.
  - **A relation's inspector** has Automatic route in its Appearance section, under the same choice as its stroke: only this relation, as a particularity, or every relation of its relation type, at that level. A choice for the relation type takes back the relation's own style in the same action, labelled as the core labels a change of the relation type's appearance.
  - **A view's Lines** is a choice among the view's details: Orthogonal, Straight or Curved. A change is one action labelled `Draw the lines of "Overview" curved`, and Orthogonal takes `routeStyle` out.
