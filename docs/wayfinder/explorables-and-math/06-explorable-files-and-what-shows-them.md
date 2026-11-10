---
label: wayfinder:grilling
title: How explorables are kept and named by what shows them
status: closed
assignee: claude
blocked_by: [03-sandboxing-an-explorable.md, 04-libraries-beside-the-project.md]
---

# How explorables are kept and named by what shows them

## Question

What file holds an explorable (one `.html` file, a folder, or JSON naming its parts), where it sits beside the project, how it names its libraries, and how an element, a component or a free shape names it (an appearance, as solids are named, or a field of their own)? Project files are JSON written in a stable key order (CLAUDE.md); an explorable the person edits in their own editor is not, as solids are not (ADR 0075).

## Resolution

Grilled with the user on 2026-11-10 (Q22 to Q27); each answer is the user's.

- **Q22, the file.** A named, editable file, `explorables/<name>.html`, not named by its hash: the person edits it in their own editor and the app reloads it. Its definition keeps the hash of the text the program last read, so a change from outside (an editor, git) is noticed and asks for approval again (ticket 08).
- **Q23, one file.** One `.html` holding its own CSS and JavaScript; script libraries named by id; pictures inside it as `data:` addresses. A folder per explorable may come later.
- **Q24, its definition lives in a package,** as images and solids do (ADR 0027, 0075): an id that starts with the package's, a name, a description, the script libraries it uses and the hash last read. A package shared between projects (ADR 0051) carries a component's explorable with it.
- **Q25, what names it.**
  - An element or a component, by `explorable` in its appearance, as `solid` is; an element's own appearance wins over its component's (Q19).
  - Loose, as a free shape of a new kind: `{ kind: 'explorable', id, x, y, width, height, explorable, name? }`, as `Picture` is (ADR 0098).
  - A tour step, by the explorable's id with the state it sets (Q13).
- **Q26, who writes the file, and undo.** Claude writes through the program's `write_explorable`, never the file directly, so the program knows the change is Claude's in that session (Q18); each write is an undoable action whose history keeps the previous text, up to 512 KiB per explorable. What the person saves in their editor is not undone from the app, as any file edited outside it; the app reloads it. Claude editing the file with its own file tools counts as a change from outside and asks again.
- **Q27, the word.** **Script library**, kept in `script-libraries/` (ticket 04's `libraries/` is renamed); "biblioteca" in the Spanish UI. "Library" stays avoided, since it is not a package. Now in `CONTEXT.md`.
