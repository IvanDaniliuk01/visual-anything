---
status: accepted
---

# The local program saves every action and reloads outside changes

The local program owns the model (ADR-0016). It keeps the project's files in step with the model in these ways, which the spec left open:

- **Saving.** Each action (a command, an undo or a redo) is saved before the apps hear of it, and only the files it changed are written. New files go first, then the changed ones, then the deletions, so that a crash between two files mostly leaves a file nothing refers to yet, rather than a reference to a missing file that would keep the project from opening. Each file is written to a temporary file next to it (`.<name>.<hex>.va-tmp`, which is never read as a project file), flushed, and renamed over the old one. When a write fails, the files already written are put back and the action is refused; when they cannot be put back, the project is read again from disk.
- **Exact bytes.** A file that an action returns to the value it had when it was read gets back the bytes read, so an undo leaves no difference in git even in a file Visual Anything did not write.
- **New files** are named after their id in their folder, as in `views/<id>.vaview`, with `-2`, `-3` and so on when the name is taken; names are compared without case, and an id that Windows reserves for a device, such as `con`, gets a `_` in front.
- **Packages.** When a project stops using one of its own packages, which the core allows only while nothing comes from it, the package's file is deleted; undo brings it back. A package file the project does not list is left alone, and its id stays taken.
- **Outside changes.** The program watches the project folder. When project files change on disk, it reads them again and every open app reloads. The history starts over, because its actions no longer apply to what is on disk. A command that would overwrite a file changed on disk but not yet read again is refused, and the project is read again. While the files on disk are invalid, as in a merge conflict, the project stays as it was last read, and commands that touch other files still save.
- **Refusals** carry a problem code that apps and Claude can act on: `nothing-to-undo`, `nothing-to-redo`, `project-closed`, `invalid-file` (the change would make a file invalid), `changed-on-disk`, `not-saved` and `program-failed`, besides the core's own codes.
- **A command that changes nothing** is not recorded and nothing is saved; only the app that sent it is answered, with no operations.
- **The history** lives in the program's memory and starts empty each time a project opens. It keeps the last 500 actions; older ones can no longer be undone.

We chose this because every action the history shows as done is then on disk, and other tools, such as git and editors, always see the files as the app shows them.

## Considered options

- **Saving on a timer, or when asked**: rejected. A crash would lose actions the history showed as done, and other tools would read old files.
- **Keeping the history across outside changes**: rejected. Its inverse operations would apply to a project they were not made for.
- **Merging outside changes with the program's own**: rejected for v0.1. Refusing and reading the files again is simple, and loses nothing that was saved.
