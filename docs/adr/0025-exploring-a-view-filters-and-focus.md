---
status: accepted
---

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions. -->

# Exploring a view: filters and focus belong to the open app, and what they hide

Filters and focus mode let someone read a large view without changing it. These choices settle what the spec leaves open:

- **Kept by the app, per view.** The open app keeps each view's filters and focus while the project is open. They are not written to the project's files and are not commands, so they never enter the undo history or a git diff, and a project opens unfiltered. Collapse is the exception, kept in the view file, because it decides the abstraction level a view is read at.
- **What a filter tests.** The component an element is created from, not the components it derives from; a relation's relation type; and conditions on attributes, of elements or of relations: is, is not, contains, is less than, is more than, has a value, has no value. A value a definition gives by default counts as the element's or relation's value. Text is compared without minding case or the spaces around it, and numbers as numbers. A condition applies once it names an attribute and, when its test needs one, a value. A shape stays only if it meets every condition.
- **What a filter hides with it.** A relation shows only while both its ends show, so hiding an element hides its relations, and hiding a relation hides the relations that end on it. A container that holds a shape still shown stays, drawn faintly, and its own relations are hidden. Free shapes are never filtered. Nothing moves.
- **Focus.** It starts from the selected elements and relations and follows the selection while it is on; clearing the selection leaves it where it was. It reaches 1 to 5 degrees, or every degree, outgoing, incoming or both ways. A relation without a direction leads both ways. A relation's own ends are one degree from it, so focusing on a relation reaches its ends. The relations between two things it reaches come with them. It walks only what the filters leave.
- **What focus does with the rest.** Everything it does not reach, free shapes too, is drawn faintly. Isolating hides it instead, but keeps the containers of what it reaches, drawn faintly.
- **One emphasis.** Filters and focus set the canvas's emphasis (`editor/emphasis.ts`) as the sources `filter` and `focus`. What any source hides is not drawn, cannot be hit, and the keys skip it: the shell tells keyboard navigation what each scene hides, from the union of every source.
- **The perspective switcher.** In v0.1 every view shows the whole model, so the toolbar's switcher lists every view, by its perspective. Once a view can show only part of the model, it lists the views over the same part.
- **New views.** A view is made from a name and a perspective, and every relation type that nests arranges it at first.

We chose these because exploring is reading, not editing (CONTEXT.md, "Explore"), so it should never leave a trace in the project or its history; because a line that ends in empty canvas, or a shape that seems to sit outside its container, misleads whoever reads the view, as ADR-0021 says of the canvas; and because degrees and direction are how the tools people already use for this work (Kumu, Neo4j Bloom, Obsidian) reach out from what is selected.

## Considered options

- **Filters and focus saved in the view file**: rejected for v0.1. Every checkbox would be an undoable action and a change in git. A saved filter can come later as an optional key of the view file, which changes nothing already stored.
- **Hiding a container hides what it holds**: rejected. Filtering out "System" would hide every Service inside one, the opposite of what was asked.
- **Hiding a container but showing what it holds**: rejected. What it holds would seem to sit directly in World.
- **A filter by component that takes in the components derived from it**: rejected for now. The list names what each element is created from, and a derived component, such as AI agent from Service, has its own line.
- **Focus brings only the relations it walked along**: rejected. A relation between two things in focus would be drawn faintly, and the eye could not follow it.
- **Focus ends when nothing is selected**: rejected. A click on empty canvas would undo the exploring.

## Consequences

- Hit testing must skip what the emphasis hides; the renderer does this when it draws the emphasis.
- The outline still lists what a filter hides; it should mark or leave out those shapes.
- Claude cannot set filters through a tool that changes the project; it guides through its own emphasis source, and filtering for Claude needs a live message of its own.

## Clarifications

- 2026-10-24: Claude filters and focuses the open view through the live connection, as it guides: a guidance message sets the filters or the focus of the view open in the app, which shows them as it shows a person's, and a person can end them. Nothing is written to view files, so this ADR holds; the MCP tool says so in its description.
- 2026-10-25 (W26): the canvas toolbar keeps one row. When its row has no room, groups of its controls go under a More button at the row's end, whole and in this order: the grid toggles, the stacking order, Layout, Note and Arrow, the explore controls (the perspective switcher, Filters and Focus), then Fit; they come back in the reverse order as the row gets wider. Adding elements and zooming always stay in the row, and with everything else under More the component palette gives up width and More shows only its icon. More is a disclosure, not a menu: Enter or Space opens its panel, Down opens it and moves into it, Tab goes through the same controls the row would show, with their names, states and shortcuts, and Escape or a press outside closes it. The explore strip keeps its own line under the row, and the find field opens below wherever the toolbar, or More's open panel, ends.

## Superseded in part, 2026-10-25

ADR 0040 supersedes the line that every view shows the whole model: a view can show part of it through its scope. The perspective switcher then lists the views with the same scope first. Filters and focus stay as this ADR says: they hide or dim what the scope shows, belong to the open app, and are never stored.

## Clarifications, 2026-10-25 (W37)

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- **Time ranges (R43)** are part of a view's filters, kept by the app with them and never written: a range on one date, time or number attribute of elements or of relations, or on a period from one attribute to another. What falls outside it is hidden, as by a condition, and what has no value for it stays shown, and the strip says how many. Numbers are read as numbers, dates and date-times written as ISO 8601 as instants in UTC, and times of day written `HH:MM` or `HH:MM:SS` as seconds since midnight; an attribute is offered when every value it has in the view reads as one kind. The filter panel chooses what the range is on; the strip under the toolbar moves it with two sliders and plays it, moving it on by a fortieth of its reach each half second at the scenarios' four speeds, keeping its width, until its end. Show everything ends it with the other filters; a view address does not carry it yet.
- **Conditions and time ranges read attributes through the app's attribute lookup** (ADR-0063): a live value over a computed one, a computed one over the stored one, and the stored one over its default. The filters offer the attributes only live values or package code give.

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- **2026-10-25 (W44): view addresses carry the time range now,** with the other filters, and so do tour steps and the view states Claude gives `open_app` and `link_to` (ADR 0044's and ADR 0058's clarifications of W44). The range is still never written to the view's file.
