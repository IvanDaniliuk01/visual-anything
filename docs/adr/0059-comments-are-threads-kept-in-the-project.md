---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# Comments are threads kept in the project, one file each, anchored by id

People reviewing a model want to leave remarks on it that travel with the project, and Claude can answer them (benchmark R46). A comment is not a note: a note is a free shape drawn on a view, while a comment is a remark about the model or a view, with an author and a state.

## The file

- **A new file kind, `.vacomment`,** in a `comments/` folder, **one thread per file**. Two people adding comments in two branches then add two files, which git merges with no conflict.
- **What a thread holds:**
  - an id;
  - its anchor: an element, a relation, a view, or a point of a view in canvas units;
  - whether it is resolved;
  - its comments.
- **What a comment holds:**
  - an id;
  - its author: a name and an optional email, from the person's preferences (ADR-0032), or "Claude";
  - the time it was written;
  - its text, plain text with paragraphs, lists and mentions of elements by id, never HTML.
- **Ids are kept.** A thread whose anchor is deleted is kept, flagged as detached, and listed apart.

## Using comments

- **On the canvas.** Open threads show as pins on their anchor; resolved ones hide unless asked.
- **A comments panel** lists them, filtered by view, open or resolved, and author. Selecting a thread selects its anchor.
- **Commands.** `create-thread`, `add-comment`, `edit-comment` (one's own), `resolve-thread` and `delete-thread` (after a confirmation), each one action.
- **Claude** reads threads, answers them as "Claude", and can be asked to work through the open ones. Each answer and each change is its own action.
- **Exports.** Comments are left out of exports and the read-only page unless asked for, since they are often working notes.

## Considered options

- **Comments inside view or model files:** rejected. They would make every review a change to the model's files, and merges would conflict.
- **Comments outside the project, in a service:** rejected. Visual Anything has no server or accounts.

## Consequences

- The schema gains the comment file kind, and the loader reads `comments/`. CLAUDE.md's file rule gains `.vacomment`.
- The core gains the comment commands.
- The app gains pins and the comments panel.
- Claude gets tools for threads.
- CONTEXT.md gains **Comment** and **Thread**, both distinct from *Note*.

## Clarifications

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25, the file (W38's plumbing, which the comments task builds on). A `.vacomment` holds one thread, read within 1 MiB:
  - `id`;
  - `anchor`, by its `kind`: `element` with its `element`, `relation` with its `relation`, `view` with its `view`, or `point` with its `view`, `x` and `y` in canvas units, at most ten million from 0 either way;
  - `resolved`, left out while the thread is open;
  - `comments`, 1 to 1,000, oldest first, each with an `id`, an `author`, a `time`, maybe an `edited` time, and a `text` of 1 to 20,000 characters.

  An author is `{ "kind": "person", "name", "email"? }`, from the person's preferences, or `{ "kind": "claude" }`, so that a person named Claude is never taken for Claude. Times are in UTC as `Date.prototype.toISOString` writes them, such as `2026-10-25T14:03:00.000Z`. A comment's text is plain text as a tour's captions are (ADR 0058's clarifications).
- 2026-10-25, the project. `ProjectSnapshot.comments` holds the threads, and the local program reads, watches and writes `comments/` as it does `views/`; a thread is saved to `comments/<id>.vacomment`.
