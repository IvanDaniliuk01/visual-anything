---
status: accepted
---

# The local program owns the model and its history

While a project is open, the local Node program holds the authoritative model and the single undo history. The browser app and Claude's MCP tools never change the model directly: they send commands, and the core applies them, enforces the rules, saves the result to the project files and broadcasts the change to every open view. Continuous gestures such as dragging update the canvas locally and are sent as one command when they end. We chose this because a single writer keeps the rules in one place, makes Claude's edits undoable exactly like the user's, lets Claude work on a project while the app is closed, and avoids reconciling two copies of the model.

## Considered options

- **The browser owns the model and the local program relays Claude's calls to it**: rejected. Claude could only edit while the app is open, and the two sides would have to reconcile two histories.

## Consequences

Editing requires the local program to be running; only the read-only demo runs in the browser alone. The core package must run both in Node and in the browser.
