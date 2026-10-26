---
status: accepted
---

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions. -->

# Relations, notes and free arrows can have colors of their own

A relation can have an appearance of its own (stroke, width and dash), which is a particularity of that relation, as an element's is of the element; whatever it leaves out comes from its relation type, and a stroke of its own is drawn as stored in both themes (ADR-0033). `create-relation` takes it, and `update-relation` replaces it whole, removes it with `null`, or changes it trait by trait with `appearanceTraits`, as `update-element` does for an element. A note can have a fill and a stroke, and a free arrow a stroke; without them they take the theme's colors, and an arrow has no fill. `create-free-shape` and `update-free-shape` keep and check them. ADR-0019's particularities now include a relation's own appearance.

Every command that stores a color checks it as `#RRGGBB` and writes it in capitals, unless the place already stores the same color in another case, whose spelling it keeps, so that picking the color shown changes nothing and records nothing. A whole appearance with a trait set to `null` is refused, `{}` is no appearance, and a refusal names the trait and the value with the `invalid-appearance` code, as in `The fill of "Booking agent" must be a color written as #RRGGBB, not "red".`

We chose this because relations are first-class (ADR-0010), and marking one relation, such as the path a request takes, is as common as marking one element; and because a note that warns or an arrow that points something out often needs its own color.

## Considered options

- **Relation-type colors only**: rejected. One relation in a path could not be marked without a relation type of its own, which changes the model to change a color.
- **Free shapes in theme colors only**: rejected. A note that warns or an arrow that points something out often needs its own color.
- **Normalizing colors read from files**: rejected. A folder would no longer round-trip, and opening a project would change it.

## Consequences

Older programs refuse files whose relations, notes or arrows have colors. An aggregated relation (M3) is drawn with its relation type's appearance. Playback and guidance highlights (M4, M5) never rely on a relation's color: they use the highlight color with a wider line and the travelling marker. The history names these changes after what they change: `Change the appearance of the relation "WhatsApp → Booking agent"`, `Change the colors of a note in "System overview"`, `Change the color of an arrow in "System overview"`, and `Reset …` when no appearance is left.

## Clarifications

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25 (L1 review): a change of only a note's or an arrow's colors that leaves it no color of its own, so that it takes the theme's again, is named `Reset the colors of a note in "System overview"` or `Reset the color of an arrow in "System overview"`; one that leaves it a color is named `Change …`, as a definition's, an element's and a relation's appearance are.
