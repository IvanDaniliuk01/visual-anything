---
status: accepted
---

# Automatic layout with hand-pinned positions, per view

Positions are stored per view. Shapes without a position are placed by automatic layout; any shape the user moves by hand becomes pinned in that view, and layout arranges the rest around it. We chose this because in a model-first tool elements often arrive without positions (from Claude through MCP or from importers), while readability, with relations that do not tangle and a diagram that can be interpreted, still depends on human judgment.

## Considered options

- **Manual positions only**: rejected. Thirty elements added by Claude would pile up for the user to sort out.
- **Automatic layout only**: rejected. Leaves no way to fix what the algorithm gets wrong.
- **Positions shared by all views**: rejected. The same element belongs in different places depending on the perspective.
