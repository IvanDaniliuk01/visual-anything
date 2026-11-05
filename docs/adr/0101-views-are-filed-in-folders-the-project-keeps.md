---
status: accepted
---

<!-- From GitHub issue #11, "Configurable, nested grouping of views in the left panel". Decided by the main session under the user's standing delegation of design decisions. -->

# Views are filed in folders the project keeps

The view list shows every view of a project in one flat list, in the order their files are read, with each view's perspective as a second line. The user's real project has more than 40 views: stories, the technical detail views of each step of a story, indexes and a landing page. A list that long is hard to read, and the only ways to order it were renaming ids or splitting views by perspective, which is a criterion for drawing a view, not for finding one.

## Decision

### The project file keeps one tree of view folders

- **`ProjectFile.viewFolders`, a list of entries, each either `{ "view": <id> }` or a folder `{ "folder": <id>, "name": <name>, "entries": [...] }`.** Folders nest as deep as the person wants. The list's order is the order the view list shows, folders and views mixed. A folder can be empty. Left out of the file while it is empty, so a project that never files a view is written as it was.
- **One tree in the project file, rather than a folder on each view file.** Folders have names, an order and can be empty, and renaming one is one change, none of which a path written on each view file gives. The project file already holds what is about the whole project, and a merge that cannot join two trees keeps the conflict as data, as for any project file (ADR 0072).
- **A view the tree does not name still shows**, after the tree at the top level, in the order the files are read. A view Claude makes, one a merge brings in or one a file copied into the folder adds is never lost from the list. An entry for a view that does not exist, or for a view named a second time, is ignored when the project opens, and the next change to the tree drops it.
- **Folder ids** are made by the core, as other ids are, and say nothing to the person. They let a folder keep its place in a merge and in each person's open folders while its name changes.
- Folders hold views only. Tours, scenarios and comments keep their own lists.

### One command replaces the tree

- **`organize-views` with the whole new tree** is one action, undoable, that every way of filing views sends: making, renaming and deleting a folder, moving a view or a folder into another, up or down. The core checks that every view entry names a view, that no view and no folder id comes twice, and that every folder has a name. It writes folders without entries as `"entries": []` and leaves `viewFolders` out of the file when the tree is empty.
- **`create-view` takes `folder`**, so a new view is filed as it is made, last in that folder; without it, it is filed nowhere and shows after the tree. **`delete-view` takes the view out of the tree** in the same action.
- Deleting a folder files what it held where the folder was, in its order: no view is deleted with a folder.

### The view list shows the tree

- Each folder is a row that opens and closes, with its views and folders below it, indented. A folder holding the open view opens by itself.
- **Which folders are open is how one person reads the list**, not part of the project: the app keeps it in the browser, by project, and every folder starts open.
- Views and folders are dragged to another place in the list or into a folder. The same moves are on the keyboard and in each row's settings: a view's settings say which folder it is in; a folder's say its name, move it up or down, or delete it. New folder sits beside New view.
- **Claude files views** with `organize_views`, which takes the whole tree, and with `folder` on `create_view`; what Claude reads of the project lists the tree.

## Considered options

- **A folder path on each view file** (`"folder": ["Stories", "Ticket 12"]`): rejected. Merges well, but a folder exists only while a view names it, renaming one rewrites every view in it, and the order of folders and of views in them needs yet another field.
- **Grouping by perspective, or by any field of the view, chosen in the panel:** rejected. The issue asks for groups the person defines; a criterion for drawing a view does not tell which story it belongs to.
- **Tags on views, the list filtered by tag:** rejected for now. A view could sit in several groups, but tags give neither nesting nor an order, which is what makes a long list readable.
- **Keeping which folders are open in the project:** rejected. Everyone who opens the project would see the folders the last person left open, and every open and close would be a change to commit.
