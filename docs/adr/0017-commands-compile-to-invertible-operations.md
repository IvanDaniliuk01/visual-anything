---
status: accepted
---

# Commands compile to invertible operations, which the local program sends to every app

The core turns every command into a list of operations, the smallest changes to a project: insert, replace or remove one item of a list (an element, a relation, a component, a view position…), replace a whole list, or set the World, the project file, a view's or a package's own properties. Applying an operation returns its exact inverse, so the undo history keeps each action as its operations and their inverses, and undo applies the inverses. After every action, undo or redo, the local program sends the operations to every open app, which applies them to its own copy with the same core code. We chose this because it makes undo exact by construction (property tests check it on random command sequences), keeps the messages small when a project has 10,000 elements, and gives one change format to the history, the live connection and later to Claude's tools.

## Considered options

- **Send the whole project after every change**: rejected. Simple, but megabytes per drag on a large project.
- **JSON Patch on the project files**: rejected. Array indices shift under concurrent changes and make patches fragile; operations address items by id.
- **CRDTs**: rejected. Real-time collaboration is out of scope for v0.1, and the local program is the single writer (ADR-0016).

## Consequences

An app whose copy drifts, which an operation that does not fit reveals, reconnects to get the whole project again. Outside changes to the files, such as a git pull, reload the project and clear the undo history, whose operations no longer apply.
