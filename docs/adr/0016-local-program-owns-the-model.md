---
status: accepted
---

# The local program owns the model and its history

While a project is open, the local Node program holds the authoritative model and the single undo history. The browser app and Claude's MCP tools never change the model directly: they send commands, and the core applies them, enforces the rules, saves the result to the project files and broadcasts the change to every open view. Continuous gestures such as dragging update the canvas locally and are sent as one command when they end. We chose this because a single writer keeps the rules in one place, makes Claude's edits undoable exactly like the user's, lets Claude work on a project while the app is closed, and avoids reconciling two copies of the model.

## Considered options

- **The browser owns the model and the local program relays Claude's calls to it**: rejected. Claude could only edit while the app is open, and the two sides would have to reconcile two histories.

## Consequences

Editing requires the local program to be running; only the read-only demo runs in the browser alone. The core package must run both in Node and in the browser.

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->
- 2026-10-26 (M6, W46): **the program's log.** Dogfooding needed a log of a command's path, which the program did not write.
  - `--log <file>` writes one JSON line per event, appending to the file:
    - an action done, undone or redone, with its time, author, label, operation count and the ids it created;
    - a command refused, with its problems' codes;
    - an app or Claude attached or gone;
    - a file of the project changed on disk.
  - It never writes a token, a launch code, a credential, a preference, or anything a file holds.
  - Without the option, the program writes nothing more than it does now.

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->
- 2026-10-26 (W48): **what the log's lines hold.** Each line is one JSON object, its `time` first, as an ISO 8601 date-time in UTC, then its `event`:
  - `action`, with `kind` (`done`, `undone`, `redone`, or `joined` for a placement that joined an action, ADR 0065), the action's `id` as the history lists it, `author`, `label`, how many `operations` that event applied, and the ids it `created`;
  - `refused`, with `request` (`command`, `undo`, `redo`, or `message` for one the program could not read), `author`, the command's `type` when it names a kind of command, and the problems' `codes`;
  - `attached` and `gone`, with `who` (`app` or `claude`) and how many `apps` and `claudes` are attached then;
  - `files-changed`, with the project-relative paths of the `files` and whether the project was `reloaded` from them;
  - and `started`, with the project folder and the port, and `stopped`, so that a log written over several runs reads as runs.
  - The file is opened to append before the program starts, which stops, saying why, when it cannot. A log that fails later stops writing and says so once; the program goes on. A program already running on the folder is not given the option: the command says that `--log` applies only to one that starts.
