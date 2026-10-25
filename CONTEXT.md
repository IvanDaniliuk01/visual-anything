# Visual Anything

An open-source tool to make any concept or system visual (data science, physical AI, neuroscience, data modeling, systems architecture) and explore it interactively.

## Language

### Projects and models

**Project**:
A folder holding a model, its views and the components and relation types it defines; the unit that is opened and shared.
_Avoid_: workspace, file, document

**Model**:
The structured set of elements, relations and attributes that describes what someone wants to understand, independent of how it is drawn.
_Avoid_: diagram (for the model), schema, graph

**World**:
The root element of a project's model; every other element is contained in it, directly or indirectly.
_Avoid_: root, universe, ecosystem

**Element**:
A thing in the model with its own identity: a table, a neuron, a service, a transformer layer. It is always created from a component and may have particularities.
_Avoid_: node, object, entity, instance

**Particularity**:
A trait of a single element or relation: an attribute value that differs from the default its component or relation type gives, an attribute its component or relation type does not define, or an appearance of its own. A value for an attribute whose component or relation type gives no default is the element's or relation's ordinary data, not a particularity.
_Avoid_: override, exception

**Relation**:
A meaningful link whose ends are elements or other relations, always of a relation type. A relation can itself be the end of another relation: an "API contract" governs a "communicates with".
_Avoid_: edge, connection, link

**Relation type**:
The reusable definition of a kind of relation: its direction, attributes, appearance, whether it nests and, if programmable, its behavior. It works like a component: declarative or programmable, derived from another relation type and shared in packages. "Depends on", "is part of" and "communicates with" are relation types.
_Avoid_: edge type, link type

**Relates to**:
The relation type every other relation type ultimately derives from.
_Avoid_: base relation, generic link

**Nesting relation type**:
A relation type whose relations place one element inside another, such as "is part of". Each view chooses which nesting relation types arrange it.
_Avoid_: hierarchy, parent/child

**Container**:
An element that holds other elements, its contents, through a nesting relation type. An element can have several containers.
_Avoid_: parent, group, folder

**Attribute**:
A piece of data describing an element or a relation: a neuron's threshold, a column's type, a service's latency.
_Avoid_: property, field

### Canvas and views

**Canvas**:
The surface where views and shapes are shown and edited.
_Avoid_: board, sheet, page

**Canvas unit**:
The unit of positions and sizes on the canvas; at 100% zoom one canvas unit is one CSS pixel.
_Avoid_: world unit, scene unit, pixel (for stored values)

**Shape**:
A visual mark on the canvas. It is either anchored or free.
_Avoid_: figure, node

**Anchored shape**:
A shape that represents an element or relation of the model; when the model changes, the shape reflects it. One element can have several anchored shapes in the same view, one inside each of its containers.

**Free shape**:
A shape that is drawing only and does not exist in the model: a note, an emphasis arrow, a sketch.

**Pinned shape**:
A shape whose position was set by hand in a view; automatic layout arranges everything else around it.
_Avoid_: locked, fixed

**Grid**:
Evenly spaced lines in canvas units behind the shapes on the canvas, also drawn on the fill of the container under the pointer or being moved in; their spacing follows the zoom. It belongs to no view and is not a shape.
_Avoid_: mesh, world grid

**Ruler**:
A scale in canvas units along the top or the left side of the canvas, which also marks where the selection lies.
_Avoid_: axis

**Snapping**:
Rounding the stored position of a shape moved or created by hand to a multiple of 8 canvas units inside its container's shape, while the grid shows and snapping is on; holding Alt places it freely. When several shapes move together, the one that carries the pressed shape is rounded and the others keep their places relative to it. A shape moved by hand is pinned, snapped or not; a created shape is snapped and stays unpinned. A bend point set by hand snaps the same way, inside the shape its route's bend points are kept relative to. Layout results and Claude's changes are never snapped.
_Avoid_: magnet, lock to grid

**Row**:
An element drawn as one line of its container's shape, because the container's appearance draws its contents as rows, as a table draws its columns. Rows follow the model's order, have no positions of their own in a view and move with their container.
_Avoid_: line item

**Detail**:
The smaller text a shape writes with its element's name, as its appearance says: its component's name, the values of chosen attributes and badges.
_Avoid_: subtitle

**Badge**:
A short text, such as "PK" or "FK", that a shape writes in its detail while its element meets the badge's condition: a boolean attribute is true, or the element is the `from` end of a relation of a given relation type.
_Avoid_: chip, pill

**Stacking order**:
The order, kept per view, in which the shapes that sit directly in one container, or directly in World, are drawn, from back to front. Every copy of a container draws its contents in the same order. A shape is drawn together with everything inside it, so a container's contents are always in front of it, and a shape is in front of or behind a whole container, never between it and its contents. Relations, then free shapes, are drawn in front of every element's shape. A new element is drawn in front of the shapes beside it, and an element put inside a container from the canvas comes in front there.
_Avoid_: layer, z-order, z-index, depth, level

**Outline**:
The open view written out as a list, shape by shape: what sits directly in World, then what sits inside each container, in the model's order whatever the stacking order, with the relations drawn from each shape. It can be read and moved through from the keyboard, and it follows the selection.
_Avoid_: layers panel, tree view

**Collapsed container**:
A container a view draws closed: at its component's size, on a sheet that says it holds more, showing none of its contents and how many sit directly in it. The relations of its contents are drawn as aggregated relations. Each view keeps which containers it shows collapsed; expanding one draws its contents again.
_Avoid_: folded group, closed group

**Aggregated relation**:
A single relation drawn in place of many relations of the same type between the contents of a collapsed container and another element, labeled with how many it stands for and drawn with a thicker line.
_Avoid_: bundle, summary edge

**View**:
A projection of the model onto the canvas, seen from exactly one perspective and keeping its own positions.
_Avoid_: page, diagram, layer

**View state**:
Where someone is in a project and how they read it there: the open view, where the canvas looks, what is selected, the filters, focus mode, and the scenario and step played, each named by id. A view address carries one; tour steps and the read-only page are to reuse it.
_Avoid_: snapshot, bookmark

**Component palette**:
The list in the canvas toolbar that new elements are created from.
_Avoid_: palette (alone), toolbox

### Components

**Component**:
The reusable definition of a kind of element: how it looks, which attributes it has and which interactions it supports. "Neuron" is a component; each neuron placed is an element. A component derives from exactly one other component and inherits everything it does not redefine.
_Avoid_: plugin, widget, template, class

**Appearance**:
How the shapes of a component's elements, or of one element, look: their shape (rectangle, rounded rectangle, ellipse, cylinder or person), fill, stroke and size, the image and detail they show, where relations attach and whether they draw their contents as rows; for a relation type's relations, or one relation, their stroke, width and dash. Whatever an appearance leaves out is inherited. An element or a relation can have an appearance of its own, which is a particularity, and a project can give one to a definition it cannot change, which is a project appearance. Colors are written #RRGGBB.
_Avoid_: look and style (for this data), skin

**Project appearance**:
The appearance a project gives to a component or relation type it uses but cannot change, such as Service from the built-in Systems package, Essence or "relates to". It is kept in the project file and reaches whatever derives from that definition without setting the same trait; an element's or relation's own appearance still comes first.
_Avoid_: override, theme

**Connection point**:
A named place on the border of a component's shapes, set by its appearance, where relations attach: a relation attaches to the connection point that faces its other end, or anywhere on the border when the shape has none. A row has one on each side.
_Avoid_: attachment point

**Component editor**:
The part of the inspector that shows a component or a relation type with what it inherits, and where the project's own are derived, defined, changed and removed, trait by trait.
_Avoid_: designer

**Essence**:
The component every other component ultimately derives from.
_Avoid_: base component, root type, object

**Declarative component**:
A component defined only by its appearance, connection points included, and its attributes, with no code; it is created and changed in the component editor.

**Programmable component**:
A component that extends a declarative one with its own code to draw itself or simulate.

**Package**:
A set of components and relation types from one domain, shared as a unit: "Neuroscience", "Data modeling".
_Avoid_: library, plugin, extension

**Built-in package**:
A package that comes with Visual Anything, such as "Systems". A project uses it by listing its id; it is never copied into the project folder.
_Avoid_: default package, standard library

**Image**:
A picture a package defines, in SVG or as a small PNG, JPEG or WebP bitmap, that an appearance shows on shapes: as an icon beside the name, or as the shape's whole drawing, optionally as a silhouette of one color. It is data only: the core cleans it of anything that runs or refers to anything outside it before it is stored, and every reader sees only that cleaned picture.

### Dimensions

**Dimension**:
An axis from which the model is seen. There are five: abstraction level, perspective, time, attribute space and physical space.
_Avoid_: layer, facet

**Abstraction level**:
How much of an element is shown, from a single box down to its inner parts.
_Avoid_: zoom (when talking about the model)

**Perspective**:
A criterion for selecting and arranging the same model: data flow, security, ownership, cost. Each view has exactly one; the same part of the model seen from another perspective is another view.
_Avoid_: viewpoint, lens

**Time**:
How the model evolves or how a process advances: versions, steps, epochs.

**Attribute space**:
The attributes of many elements treated as coordinates, to project, filter or compare them.
_Avoid_: high dimensionality (as a product term)

**Physical space**:
The real three-dimensional arrangement of something: a robotic arm, a brain region. It is shown inside the components that need it, not on the canvas.
_Avoid_: 3D (as a generic synonym)

### Interactions

**Interaction**:
A way of acting on the model or a view. There are four: explore, play, simulate and edit.

**Explore**:
To move through a model without changing it: expand, collapse, filter, focus, follow a relation.

**Filter**:
A choice, kept by the open app for one view, of components, relation types and conditions on attributes whose shapes the view hides; nothing moves. A relation shows only while both its ends do, and a container that holds a shape still shown stays, drawn faintly.
_Avoid_: query, hide rule, layer

**Focus**:
Reading a view from the selection: what the selection reaches through relations, up to some degrees and in one direction or both, stays as it is, and the rest is drawn faintly. It follows the selection while it is on.
_Avoid_: highlight, spotlight, neighborhood, ego network

**Isolate**:
Focus that hides what the selection does not reach, instead of drawing it faintly; the containers of what it reaches stay, drawn faintly.
_Avoid_: solo, hide others

**Play**:
To step through an already defined sequence over the model: a scenario or a tour.
_Avoid_: animate, replay

**Scenario**:
A concrete example played step by step over a view, showing what moves where and what each step takes in and produces: a patient's request crossing services, a sentence going through a transformer's layers. A step can involve several relations at once; there are no branches, so an alternative path is a separate scenario. It is recorded by following relations in order or built by Claude from a description or a log.
_Avoid_: trace, run, flow, example (as a product term), simulation

**Step**:
One moment of a scenario: the relations it activates at once, a short description, and what it takes in and produces as data. Recorded by clicking a relation; Shift+click adds another relation to the same step.
_Avoid_: stage, hop

**Aggregated step**:
A single step played in place of consecutive scenario steps that happen entirely inside a collapsed container, labeled with how many it stands for.
_Avoid_: grouped step, collapsed step

**Broken step**:
A scenario step that uses a relation that no longer exists; it is kept and flagged so it can be fixed.
_Avoid_: orphan step, dead step

**Travelling marker**:
The mark that moves along each relation of the step being played, from its from end to its to end; when the system asks for reduced motion it stands still at the end it travels to.
_Avoid_: dot, token, pulse

**Tour**:
A saved sequence of steps, each a view state with an explanation, that is played to walk someone through a concept. A step can play a scenario. Created by a person or by Claude.
_Avoid_: walkthrough, presentation, story

**Route**:
The path a relation's line takes in a view: where it attaches to each end, the points it bends at, and its style (orthogonal, straight or curved). Automatic unless chosen by hand; a view keeps only what was chosen by hand, and Reset route goes back to the automatic route.
_Avoid_: path, connector, edge route, waypoints

**Bend point**:
A point a relation's route passes through, set by hand in a view, relative to the container whose shape holds both of the relation's ends.
_Avoid_: waypoint, control point, vertex, elbow

**Guidance**:
The marks and moves Claude makes live on the open view while it explains: highlighting shapes, focusing on some and dimming the rest, moving the canvas to one, showing a caption, filtering or focusing the view as a person would, and opening, playing and stepping through a scenario. Guidance never changes the model, a view file or the history, shows only while the app is open, and the person can end it.
_Avoid_: spotlight

**Caption**:
A short plain text Claude shows over the canvas as part of its guidance, until it shows another, clears it, or the person dismisses it.
_Avoid_: toast

**Simulate**:
To compute a behavior from parameters the user changes: learning rate and loss curve, replicas and latency.

**Edit**:
To change the model or the canvas: create, move, put inside or take out of a container, connect, change the stacking order, delete.

**Action**:
One edit as the history keeps it: what a command, a batch or a pasted list did, with its label, its author (the person or Claude) and when it was done. Undo and redo take back or bring back one action at a time.
_Avoid_: transaction, change set

**History**:
The actions of the open project since it was opened or last reloaded from disk, the ones undone among them, which the local program keeps in its memory (ADR 0028). The history panel lists them, newest first, and undoes or redoes up to any one of them.
_Avoid_: log, timeline, version history

### Preferences

**Preference**:
A choice a person makes for themselves on this computer: the theme, the language, whether the grid, snapping and the rulers are on, and the colors they picked lately. The local program keeps preferences outside every project; they are never in project files, the undo history or Claude's tools.
_Avoid_: settings, profile

**Language**:
The language the app reads in, English or Spanish: its panels, menus, dialogs, captions, announcements and keyboard help, the names of the built-in packages' components and relation types, and what the local program and the core tell the person. It follows the browser unless the person chooses one. What people write, such as names and descriptions, is never translated (ADR 0038).
_Avoid_: locale (in the app's text)

**Theme**:
The colors the app and the canvas itself are drawn in, light or dark: panels and text, the canvas background, the grid, the rulers, selection, labels, and notes and free arrows without colors of their own. Built-in packages give their components and relation types a shade for each theme; every color stored in a project is drawn as stored in both. A theme follows the system unless the person chooses one, and it never changes the project.
_Avoid_: skin, palette

### The local program

**Launch address**:
An address that opens a project in the browser once, within two minutes of being made. The local program opens or prints one instead of an address carrying the session token, which never leaves the program; the tab gets the token when it opens and keeps it for reloads. It can carry a view state too, which the tab applies once it has the token.
_Avoid_: magic link, one-time link

**View address**:
An address of the app whose fragment holds a view state and no secret. Each tab keeps its own in step with what it shows, so a reload comes back there, and Copy address copies it; pasted into a tab that has the project open, it opens the project at that view state.
_Avoid_: deep link, permalink
