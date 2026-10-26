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
- **Exports.** Comments are left out of exports and the read-only page unless asked for, since they are often remarks still being worked out.

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

M11's build of comments (W39) settled these.

- **Who signs, failing closed.** The local program hands the core the sender it knows for every command: `user` for a command from an app, `claude` for one from Claude's endpoint (`CommandContext.author`), and its clock (`CommandContext.now`). Nothing in the core assumes a sender: a comment command whose sender is not said is refused with `invalid-command`, so that no caller that forgets it signs Claude's words as the person's. Claude's comments are always signed as Claude, and a command of Claude's that names a person is refused (`invalid-author`); a person's command must carry their name, and never signs as Claude.
- **The person's name.** A new preference, `author`: `null` until the person says, or a name of 1 to 200 characters and an optional email, both trimmed, as a comment's author keeps them. The person's tab puts it in each comment command it sends, so a comment written right after the name was set carries it, even before the preference reaches the program. Claude's tools neither read nor change it (ADR-0032).
- **One's own comment.** Claude edits Claude's comments; a person edits a person's comment when their emails match, if both have one, or else their names, whatever the case and the spaces around. An edit records when, in `edited`; an edit to the same text records nothing.
- **Answering a resolved thread opens it again**, in the same action: an answer means there is more to say. Resolving and opening again are `resolve-thread` with `resolved` true or false.
- **Mentions** are written `@[id]`, of an element or a relation. A mention of an id the model does not hold is kept as written and only warns (`unknown-mention`), as limits do; the app shows a gone one by its id.
- **Text.** Lines end with LF alone, spaces and tabs at their ends go, and so does blank space around the whole; control characters but the tab and the line feed are refused. Nothing in a comment is ever read as markup.
- **Ids.** A thread's id is made from the words of its first comment, as a file name reads best. The ids of threads, and of what each is about, stay taken while the thread is kept: nothing new takes the id of a detached thread's element, relation or view, so the thread never comes to be about something else, and undoing the deletion attaches it again.
- **No thread about World**, which no shape draws: a remark about the whole model is a thread about a view.
- **Pins.** A pin sits on the top right corner of an element's first shape, or of the collapsed container that shows it; at the middle of a relation's line, or of the aggregated relation standing for it; or at its point, in canvas units relative to World. Threads about one thing share one pin, which says how many. A thread about a view as a whole has no pin: the panel lists it. Pins follow the panel's state and author filters, so resolved threads show only while the panel shows resolved ones, and they hide with what the view's filters hide. They are buttons over the canvas that follow its camera: the canvas draws nothing for them and redraws no tile.
- **The comments panel** is the model panel's fifth tab, Comments. "This view" keeps the threads about the open view or a point of it, or about what its scope shows; detached threads are listed apart whatever the view. Choosing a thread selects what it is about in the open view when it shows there, and else in the first view that does; a point comes into the middle of the canvas. Choosing a pin opens its thread, or, for several, lists them alone.
- **A thread on a point** is placed by clicking the canvas after *Comment on a point…*, or with Enter at the middle of the canvas; the point is rounded to whole canvas units.
- **Claude's tools** are `list_threads`, `read_thread`, `create_thread`, `reply_to_thread`, `edit_comment`, `resolve_thread` and `delete_thread`, and the MCP prompt `work_through_comments` works through the open threads, each answer and each change its own action. Claude reads authors by name, never by email; it resolves or deletes a thread only when the person asks.
- **Leaving the project.** The exports draw from the scene and the model, so comments stay out of them. The read-only page (ADR-0041) must leave `comments` out of what it embeds unless asked, since they hold people's names and emails.
- 2026-10-25, the file (W38's plumbing, which the comments task builds on). A `.vacomment` holds one thread, read within 1 MiB:
  - `id`;
  - `anchor`, by its `kind`: `element` with its `element`, `relation` with its `relation`, `view` with its `view`, or `point` with its `view`, `x` and `y` in canvas units, at most ten million from 0 either way;
  - `resolved`, left out while the thread is open;
  - `comments`, 1 to 1,000, oldest first, each with an `id`, an `author`, a `time`, maybe an `edited` time, and a `text` of 1 to 20,000 characters.

  An author is `{ "kind": "person", "name", "email"? }`, from the person's preferences, or `{ "kind": "claude" }`, so that a person named Claude is never taken for Claude. Times are in UTC as `Date.prototype.toISOString` writes them, such as `2026-10-25T14:03:00.000Z`. A comment's text is plain text as a tour's captions are (ADR 0058's clarifications).
- 2026-10-25, the project. `ProjectSnapshot.comments` holds the threads, and the local program reads, watches and writes `comments/` as it does `views/`; a thread is saved to `comments/<id>.vacomment`.

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

- 2026-10-26 (W47, from M11's spec review): **the size of a thread, who sends what signs nothing, and Claude's mark.**
  - **The size of a thread.** A thread's comments hold at most 200,000 characters together (`MAX_THREAD_TEXT`), so that its file stays well within the 1 MiB it is read within, whatever characters they are written in. `add-comment` past it is refused with `invalid-comment`, saying to start another thread; an `edit-comment` that takes a thread past it says to write a shorter comment, or to put the rest in another thread. A thread kept longer than that, as one written by hand can be, can still be edited so long as it grows no longer.
  - **Whatever the program writes, it opens again.** Text whose characters take more bytes in a file than most, such as a lone surrogate, which JSON writes in six, can still reach the cap first: the local program refuses any change that would write a file past the cap of its kind, with `invalid-file`, before anything is written, saying for a thread to start another thread. The project still opens, and later changes are made as before, instead of being refused as changed on disk.
  - **Every comment command needs its sender,** `resolve-thread` and `delete-thread` too, though they sign nothing: a command whose sender is not said is refused with `invalid-command`, as the others are. The app and Claude's endpoint always say who sends one.
  - **Claude's comments are marked in words,** "Claude (AI)", "Claude (IA)" in Spanish, in the thread, the author filter and the summary of the list, beside its accent color, so that a person who calls themselves Claude, shown by the name they gave, is never taken for Claude. "Assistant" is not used, since its Spanish, "asistente", is the word the catalog avoids for the start screen (a wizard).
  - **Plain text.** A comment's paragraphs and lists are read by the core's `plain-text.ts`, as a tour's captions and speaker notes are: the comments' own reader, which read the spaces at the start of a line differently, is gone, and only the mentions are read on top of it.
