---
status: accepted
supersedes: ADR-0020
---

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions. -->

# The local program saves every action and reloads outside changes; its history keeps actions by count and by size

The local program owns the model (ADR-0016). It keeps the project's files in step with the model in these ways, which the spec left open:

- **Saving.** Each action (a command, an undo or a redo) is saved before the apps hear of it, and only the files it changed are written. New files go first, then the changed ones, then the deletions, so that a crash between two files mostly leaves a file nothing refers to yet, rather than a reference to a missing file that would keep the project from opening. Each file is written to a temporary file next to it (`.<name>.<hex>.va-tmp`, which is never read as a project file), flushed, and renamed over the old one. When a write fails, the files already written are put back and the action is refused; when they cannot be put back, the project is read again from disk.
- **Exact bytes.** A file that an action returns to the value it had when it was read gets back the bytes read, so an undo leaves no difference in git even in a file Visual Anything did not write.
- **New files** are named after their id in their folder, as in `views/<id>.vaview`, with `-2`, `-3` and so on when the name is taken; names are compared without case, and an id that Windows reserves for a device, such as `con`, gets a `_` in front.
- **Packages.** When a project stops using one of its own packages, which the core allows only while nothing comes from it and no appearance shows its images, the package's file is deleted; undo brings it back. A package file the project does not list is left alone, and its id stays taken.
- **Outside changes.** The program watches the project folder. When project files change on disk, it reads them again and every open app reloads. The history starts over, because its actions no longer apply to what is on disk. A command that would overwrite a file changed on disk but not yet read again is refused, and the project is read again. While the files on disk are invalid, as in a merge conflict, the project stays as it was last read, and commands that touch other files still save.
- **Refusals** carry a problem code that apps and Claude can act on: `nothing-to-undo`, `nothing-to-redo`, `project-closed`, `invalid-file` (the change would make a file invalid), `changed-on-disk`, `not-saved` and `program-failed`, besides the core's own codes.
- **A command that changes nothing** is not recorded and nothing is saved; only the app that sent it is answered, with no operations.
- **The history** lives in the program's memory and starts empty each time a project opens. It keeps at most the last 500 actions, and drops the oldest while the strings in its actions' operations and inverses, the operations' own names included, add up to more than 64 Mi UTF-16 code units; the newest action is always kept, however large. Dropped actions can no longer be undone. Each action is weighed once, when it is recorded.

We chose this because every action the history shows as done is then on disk, and other tools, such as git and editors, always see the files as the app shows them. The size budget was added because images make single actions large (ADR-0027), and 500 of them could hold gigabytes in memory.

## Considered options

- **Saving on a timer, or when asked**: rejected. A crash would lose actions the history showed as done, and other tools would read old files.
- **Keeping the history across outside changes**: rejected. Its inverse operations would apply to a project they were not made for.
- **Merging outside changes with the program's own**: rejected for v0.1. Refusing and reading the files again is simple, and loses nothing that was saved.
- **A count limit only** (ADR-0020): superseded once images exist. 500 actions that each replace a 2 MiB package's images would hold gigabytes.
- **Weighing actions by the bytes of the files they change**: rejected. The history holds operations, not files, and formatting files to weigh them would cost more than the walk over the operations' strings.

## Consequences

An undo history can hold fewer than 500 actions when they carry images; the oldest go first, as they did past 500.

## Addendum, 2026-10-25: the history panel (R28)

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- **Each action has an id and a time.** The local program gives every action it records an id and the time it was done. Ids keep counting across reloads, so an id from before a reload never names a new action. The core's history is unchanged; the ids and times live beside it in the session.
- **The list goes to every app.** Protocol 5 adds the message `history/listed`, with each action's id, label, author, time and whether it is undone, oldest first: the actions done, then the undone ones, the next redo first. It is sent on connecting, once after each change, and after a reload, as an empty list. Claude's endpoint never gets it, and no tool of Claude's reads the history (corrected on 2026-10-25, below).
- **Undo to here and Redo to here.** `undo` and `redo` take an optional `to`, an action's id, and step one action at a time in one turn of the program's queue, including that action. Each step is saved and announced like a single undo; only the last answers the request, and a step that cannot be saved stops there, with the steps before it kept.

## Clarifications

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25 (W42): the addendum said Claude "reads the history through its tools as before". No tool of Claude's reads the history, and none did: Claude knows the actions it made from its own answers, and the person reads and undoes the history in the app (ADR-0029). The line now says so.
