---
status: accepted
---

# Multiple containers; each view chooses how elements nest

An element can have several containers, and each view chooses which nesting relation types arrange it. If an element still has more than one container within a view, it appears inside each one as separate anchored shapes of the same element, highlighted together when selected; collapsing a container hides only the copy inside it, and the relations of its contents are shown as aggregated relations. Containment cycles are blocked, since they would make expanding and collapsing impossible. We chose this because real systems and concepts belong to overlapping groupings (a neuron sits in an anatomical region and in a functional circuit), and forcing a single hierarchy would push people to distort their model.

## Considered options

- **A single container per element (a tree)**: rejected. Simpler to expand and collapse, but forces overlapping groupings out of containment.
- **A primary container per view, other memberships shown as a badge or link**: rejected. Hides memberships that matter for understanding.
- **Overlapping regions (Venn style)**: rejected. Becomes unreadable beyond two or three groups.
