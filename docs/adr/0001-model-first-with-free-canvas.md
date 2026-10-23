---
status: accepted
---

# Model first, with a free canvas

Visual Anything separates a typed model (elements, relations, attributes) from the canvas it is drawn on, and every shape on the canvas is either anchored to a model element or free. We chose this because seeing the same thing from several dimensions (abstraction, perspective, time, attributes, physical space) requires views derived from a single model, while a free canvas keeps the flexibility to explore half-formed ideas and lets each person build their own representations.

## Considered options

- **Drawing first** (like draw.io or Excalidraw): rejected. A shape does not know what it represents, so no views or dimensions can be derived from what was drawn.
- **Model only** (like Structurizr or C4 as code): rejected. Too rigid for sketching and for concepts that do not have a clear structure yet.
