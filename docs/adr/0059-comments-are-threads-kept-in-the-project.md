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

M11's build of comments (W39) settled these.

- **Who signs, failing closed.** The local program hands the core the sender it knows for every command: `user` for a command from an app, `claude` for one from Claude's endpoint (`CommandContext.author`), and its clock (`CommandContext.now`). Nothing in the core assumes a sender: a comment command whose sender is not said is refused with `invalid-command`, so that no caller that forgets it signs Claude's words as the person's. Claude's comments are always signed as Claude, and a command of Claude's that names a person is refused (`invalid-author`); a person's command must carry their name, and never signs as Claude.
- **The person's name.** A new preference, `author`: `null` until the person says, or a name of 1 to 200 characters and an optional email, both trimmed, as a comment's author keeps them. The person's tab puts it in each comment command it sends, so a comment written right after the name was set carries it, even before the preference reaches the program. Claude's tools neither read nor change it (ADR-0032).
- **One's own comment.** Claude edits Claude's comments; a person edits a person's comment when their emails match, if both have one, or else their names, whatever the case and the spaces around. An edit records when, in `edited`; an edit to the same text records nothing.
- **Answering a resolved thread opens it again**, in the same action: an answer means there is more to say. Resolving and opening again are `resolve-thread` with `resolved` true or false.
- **Mentions** are written `@[id]`, of an element or a relation. A mention of an id the model does not hold is kept as written and only warns (`unknown-mention`), as limits do; the app shows a gone one by its id.
- **Text.** Lines end with LF alone, spaces and tabs at their ends go, and so does blank space around the whole; control characters but the tab and the line feed are refused. Nothing in a comment is ever read as markup.
- **Ids.** A thread's id is made from the words of its first comment, as a file name reads best. The ids of threads, and of what each is about, stay taken while the thread is kept: nothing new takes the id of a detached thread's element, relation or view, so the thread never comes to be about something else, and undoing the deletion attaches it again.
- **No thread about World**, which no shape draws: a remark about the whole model is a thread about a view.
