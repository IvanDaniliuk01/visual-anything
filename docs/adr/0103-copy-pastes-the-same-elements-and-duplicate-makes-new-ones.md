---
status: accepted
---

<!-- From GitHub issue #13, "Copy/paste elements between views (and duplicate)". Decided with the user on 2026-11-05, question by question. -->

# Copy pastes the same elements, and Duplicate makes new ones

There is no way to take elements from one view to another. A view with a scope can add an element by hand ("Add to this view", in the inspector and the find bar; `add_to_view` for Claude), one at a time, and the only copy and paste are of appearance (ADR 0088) and of a list of names, which makes new elements. To assemble a view from pieces of others, the person rebuilds each piece.

Two operations hide behind "copy and paste": showing **the same element** in another view, which is the same data, renamed everywhere at once; and making **a duplicate**, a new element with what the first one holds, which then lives its own life.

## Decision

### Copy, Paste, Paste as duplicates, Duplicate

- **Copy (Ctrl+C, ⌘C)** takes the selection, in the canvas or the Outline, which share it: its elements, the relations among them, and its free shapes (notes, pictures, arrows) with where each sits relative to the others.
- **Paste (Ctrl+V)** shows the same elements in the open view: one `add-to-view` for those its scope leaves out, so one action, which changes the view and never the model. An element keeps its containers: it shows inside those the view draws, or in World when it draws none of them, the elements in World keeping their arrangement, anchored where the pointer is; layout places the others. When the view already shows every one of them, as a view without a scope does, nothing is added: they are selected, the canvas shows them, and the caption says they were already there. Free shapes are always pasted as copies, since each belongs to one view.
- **Paste as duplicates (Ctrl+Shift+V, and in the canvas menu)** makes new elements in the open view, in one action:
  - each a duplicate of its element: component, attributes, description and appearance of its own;
  - named as the first one, with " (copy)" only when it lands in the container the first one sits in;
  - a container with everything inside it, at any depth, as a folder is copied;
  - the relations among what is duplicated duplicated too, between the duplicates; relations to anything else are not (a choice to bring those along may come later);
  - inside the container under the pointer, through the nesting relation type the view chooses as creating an element there does (`nestingTypeFor`), or in World; keeping their arrangement.
- **Duplicate (Ctrl+D, and in the shape menu)** pastes the selection as duplicates beside itself, in the same view, without touching the clipboard.
- **The clipboard is the system's**, holding the copied ids and arrangement with the project's name, so a paste works in another tab of the same project. A paste of something copied from another project is refused, saying so, for now: its components may not exist in this one.

### The core and Claude

- **One core command, `duplicate-elements`**, takes the elements, the view, where they land (a container and a position, or a place beside them) and answers with the new ids; it duplicates what they contain and the relations among them, as one undoable action. The app's Paste as duplicates and Duplicate send it; Claude has it as **`duplicate_elements`**. Showing the same elements needs no new command: `add-to-view` and `set-positions`, in one batch.

## Considered options

- **Paste duplicates by default:** rejected. Reusing the same data is what assembling a view needs most; a duplicate is a deliberate choice, and a wrong one fills the model with look-alikes.
- **Asking at every paste:** rejected. Two shortcuts say it without a dialog.
- **A pasted reference joins the container under the pointer:** rejected. It would add a nesting relation to the model on a paste; dragging the shape into a container already does that, on purpose.
- **Duplicating the relations to what is not copied:** rejected for now. Useful for "another case like this one", but it adds relations by the dozen; it may come as a choice of Paste as duplicates.
- **Copying between projects:** later. The components and relation types of one project may not exist in the other.
