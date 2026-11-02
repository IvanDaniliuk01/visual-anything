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

**Alignment guide**:
A line the canvas shows while shapes are dragged or a shape is resized by hand, where an edge or the middle of what moves lines up with an edge or the middle of a shape in the same container; what moves snaps to it within 6 pixels of the screen, before the grid, unless Ctrl (⌘ on a Mac) is held, or Alt, which places a moved shape freely. It belongs to no view and is not a shape (ADR 0074).
_Avoid_: smart guide, snap line

**Row**:
An element drawn as one line of its container's shape, because the container's appearance draws its contents as rows, as a table draws its columns. Rows follow the model's order, have no positions of their own in a view and move with their container.
_Avoid_: line item

**Key row**:
A row whose element is part of its table's primary key, or that a relation the view can draw ends on, whatever its scope. A view can draw only key rows (`rows: "keys"`), each table counting the rows it leaves out in its header and showing them when one is looked for (ADR 0080).
_Avoid_: key column (alone), index row

**Detail**:
The smaller text a shape writes with its element's name, as its appearance says: its component's name, the values of chosen attributes and badges. It wraps to the lines its appearance gives, three unless it says otherwise, and the whole of it shows in the shape's hover card. The name and the detail are one block that the appearance's text placement puts at the top, in the middle or at the bottom of the shape (ADR 0082).
_Avoid_: subtitle

**Hover card**:
The card under a shape that gives back what the canvas cut of its name or detail, whole and with its text emphasis, once the pointer rests on the shape or the keys reach it (ADR 0082).
_Avoid_: tooltip, popover

**Badge**:
A short text, such as "PK" or "FK", that a shape writes in its detail while its element meets the badge's condition: a boolean attribute is true, or the element is the `from` end of a relation of a given relation type.
_Avoid_: chip, pill

**Name tag**:
The rounded box hung under a shape whose own outline cannot hold its name whole, and under a drawing with parts that is no container: in the shape's colors, touching it, holding its name, whole, and its detail. It is part of the shape, which is pointed at, marked, related, laid out and exported with it (ADR 0066).
_Avoid_: label, caption (a caption is shown over the canvas), name below

**Stacking order**:
The order, kept per view, in which the shapes that sit directly in one container, or directly in World, are drawn, from back to front. Every copy of a container draws its contents in the same order. A shape is drawn together with everything inside it, so a container's contents are always in front of it, and a shape is in front of or behind a whole container, never between it and its contents. Relations, then free shapes, are drawn in front of every element's shape. A new element is drawn in front of the shapes beside it, and an element put inside a container from the canvas comes in front there.
_Avoid_: layer, z-order, z-index, depth, level

**Outline**:
The open view written out as a list, shape by shape: what sits directly in World, then what sits inside each container, in the model's order whatever the stacking order, with the relations drawn from each shape. It can be read and moved through from the keyboard, and it follows the selection. Capitalized as the panel's name, it is this list; "a shape's outline", in lower case, is the line a shape is drawn by, its free geometry's or its part's.
_Avoid_: layers panel, tree view

**Collapsed container**:
A container a view draws closed: at its component's size, on a sheet that says it holds more, showing none of its contents and how many sit directly in it. The relations of its contents are drawn as aggregated relations. Each view keeps which containers it shows collapsed; expanding one draws its contents again.
_Avoid_: folded group, closed group

**Aggregated relation**:
A single relation drawn in place of many relations of the same type between the contents of a collapsed container and another element, labeled with how many it stands for and drawn with a thicker line.
_Avoid_: bundle, summary edge

**Expand in place**:
How a collapsed container opens: it keeps its corner and grows toward the free room. The shapes it now covers move aside by the least that clears it, in their order. Pinned shapes never move. Collapsing it again gives the moved shapes their places back; when it has none to give back, collapsing closes the room it leaves, moving what stood right of it or below it back left or up by the least, pinned shapes never (ADR 0080).
_Avoid_: unfold, explode

**Trunk**:
The shared first run of the lines that leave one row or one shape toward several ends, drawn as one line until they part (ADR 0080). It is a way of drawing lines, not a relation of its own.
_Avoid_: bundle (an aggregated relation stands for many relations; a trunk only draws several together)

**View**:
A projection of the model onto the canvas, seen from exactly one perspective and keeping its own positions. It shows the whole model, or the part its scope gives. It can also leave out relation types, each with the relation types derived from it unless exactly that one: their relations it draws as no line, aggregates into no collapsed container and counts as leaving nothing, though they stay in the model; a relation type it nests by is never left out (ADR 0064). Not the View component of Data modeling, which is a view of a database; its component's description says it is a view of a database (ADR 0023's clarification).
_Avoid_: page, diagram, layer

**Scope**:
The part of the model a view shows: elements chosen by rules (a component, a relation type, a container's contents, a condition on an attribute) and elements added or left out by hand. A relation shows while both its ends do. Leaving an element out of a view never deletes it (ADR 0040).
_Avoid_: subset, query, filter (a filter hides shapes of what the scope shows)

**Outside the view**:
Said of a scenario step whose relations are all out of the scope of the view it plays over, or of relation types that view leaves out. It still plays, saying so, and is not a broken step, whose relation was deleted.

**View state**:
Where someone is in a project and how they read it there: the open view, where the canvas looks, what is selected, the filters, focus mode, the scenario and step played with the alternatives chosen at its decisions (ADR 0078), and, while it is open, what the physical-space panel shows and where it looks, each named by id. A view address carries one; tour steps and the read-only page reuse it.
_Avoid_: snapshot, bookmark

**Component palette**:
The list in the canvas toolbar that new elements are created from.
_Avoid_: palette (alone), toolbox

### Components

**Component**:
The reusable definition of a kind of element: how it looks, which attributes it has and which interactions it supports. "Neuron" is a component; each neuron placed is an element. A component derives from exactly one other component and inherits everything it does not redefine.
_Avoid_: plugin, widget, template, class

**Appearance**:
How the shapes of a component's elements, or of one element, look: their shape (rectangle, rounded rectangle, ellipse, cylinder or person, or free geometry of their own) or the named part they are drawn as, their fill, stroke and size, the image or solid and the detail they show, where relations attach and whether they draw their contents as rows; for a relation type's relations, or one relation, their stroke, width and dash and the style of their automatic routes. Whatever an appearance leaves out is inherited. An element or a relation can have an appearance of its own, which is a particularity, and a project can give one to a definition it cannot change, which is a project appearance. Colors are written #RRGGBB.
_Avoid_: look and style (for this data), skin

**Face**:
What a component's shapes show inside their body, laid out from a subset of HTML and CSS that its appearance holds: boxes, texts filled from the element's name and attributes, its detail and badges, and where its rows or contents go. Visual Anything reads, lays out and draws it itself, and nothing in it runs. It is inherited part by part, and may differ by level and when a container is collapsed (ADR 0083).
_Avoid_: template, card (the Hover card is not a face), skin

**Face drawing**:
What laying a face out for one element answers: boxes, runs of text in Roboto with their bands, images by id, and the places where its rows, its contents and its package code's drawing go, with its height and whether anything was cut. The core makes it, the same in Node and the browser, and the canvas, the exports and the page draw it as it is (ADR 0083).
_Avoid_: render, rendering, template output

**Text emphasis**:
Bold, italic, strikethrough, inline code, highlight and underline in a text, written as a small Markdown subset (`**bold**`, `*italic*`, `~~struck~~`, `` `code` ``, `==highlight==`, `++underline++`) and stored as typed. Notes, captions, reveals, speaker notes and descriptions always take it, and with it Markdown's blocks: headings, lists, task lists, quotes, rules, fenced code, tables and links to `http:`, `https:` and `mailto:` addresses. A text attribute takes the inline part when its definition's format is `emphasis`; names never do (ADR 0082). Not the canvas's emphasis of a shape.
_Avoid_: rich text, formatting, markup

**Project appearance**:
The appearance a project gives to a component or relation type it uses but cannot change, such as Service from the built-in Systems package, Essence or "relates to". It is kept in the project file and reaches whatever derives from that definition without setting the same trait; an element's or relation's own appearance still comes first.
_Avoid_: override, theme

**Connection point**:
A named place on the border of a component's shapes, set by its appearance, where relations attach: a relation attaches to the connection point that faces its other end, or anywhere on the border when the shape has none. It is set on one side of the shape's box, at a place along that side; on free geometry or an anchored part, it sits where that place, carried straight in from the side, meets the outline. A row has one on each side.
_Avoid_: attachment point

**Free geometry**:
A shape's own outline, set by an appearance in place of its kind: closed contours written as SVG path data, polygons or ellipses in a box of their own, a contour inside another making a hole. The canvas draws it, points at it and attaches relations on it by that outline, with its name tag when its name does not fit inside it, and draws it simplified far out; layout sees only its box, with its name tag (ADR 0066).
_Avoid_: custom shape, stencil, contour (alone), vector shape, free shape (a free shape is a drawing outside the model)

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
A picture a package defines, in SVG or as a small PNG, JPEG or WebP bitmap, that an appearance shows on shapes: as an icon beside the name, as the shape's whole drawing, or with its named parts, which the shape's contents are drawn as; an icon or a whole drawing can be a silhouette of one color. It is data only: the core cleans it of anything that runs or refers to anything outside it before it is stored, and every reader sees only that cleaned picture.

**Named part**:
A piece of an SVG image with an id of its own, such as the left ventricle in a picture of a heart, read only from the image's cleaned view; or a piece of a solid with a name of its own in its file, such as an arm's elbow, read only from its cleaned file. Its id or name is its name. It is what an anchored part is drawn as (ADR 0067, ADR 0075), and a part for short where no nesting is meant, since "is part of" names nesting.
_Avoid_: layer, region, hotspot, sub-image, mesh

**Drawing with parts**:
A shape that shows an image or a solid with its named parts: the picture fills its body under its name, and those of its contents anchored to its named parts are drawn as those parts, in place, as a page of an anatomical atlas names the organs it shows. Its other contents sit below the picture. Layout takes it as one block.
_Avoid_: plate, atlas, map, background

**Anchored part**:
An element's shape drawn as a named part, because its appearance names that part: inside a drawing with parts, in the part's place and at its size, with no position of its own in the view, as a row has none; elsewhere on its own, with the part's outline as its free geometry and the part's picture inside it. A part of a solid is drawn in the solid's picture, where relations end at its point, and in the physical-space panel in its place in the solid. It is selected, related, focused, filtered and colored as any shape of its element.
_Avoid_: hotspot, mapped area, region, overlay (an overlay is a rule of a view)

**Solid**:
The form of something in three dimensions, as a package defines it: a glTF file the local program cleaned of anything that runs or names anything outside it, kept in the project's `solids/` folder under its hash, with its description, its named parts and the camera its pictures are drawn from. An appearance shows it as an icon, as the shape's drawing or with its named parts. The canvas draws it as a picture, and live only while it is turned (ADR 0075).
_Avoid_: 3D model, model (the model is the project's), mesh, asset, object

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
The real three-dimensional arrangement of something: a robotic arm, a brain region. It is drawn by solids inside the shapes of the components that need it, and in the physical-space panel beside the canvas; a view never switches into it (ADR 0076).
_Avoid_: 3D (as a generic synonym)

**Pose**:
Where an element really is in physical space and which way it faces: a point in meters and a rotation, measured from one of its containers or from World. It is part of the model, one per element whatever its containers; an element anchored to a solid's named part is where its part is instead (ADR 0076).
_Avoid_: position (a shape's, in a view), placement (how a shape shows an image or a solid), transform, location

**Physical-space panel**:
A panel beside the canvas that shows the elements of the open view that are in physical space, where they really are: their solids, posed or as the named parts of their containers' solids, under World or one element. It shares the selection, focus, filters, overlays, scenario playback and guidance with the canvas, edits only poses, and view states carry where it looks (ADR 0076).
_Avoid_: 3D view, 3D mode, 3D panel, viewport, scene

**Exploded view**:
A way the physical-space panel reads, which moves each named part away from the middle of the part or solid holding it, by a factor from 0 to 2; it moves nothing in the model and is not an arrangement (ADR 0076).
_Avoid_: expand, explode (alone, as a verb for containers: a collapsed container expands in place)

### Interactions

**Interaction**:
A way of acting on the model or a view. There are four: explore, play, simulate and edit.

**Explore**:
To move through a model without changing it: expand, collapse, filter, focus, follow a relation, turn a solid, look around the physical-space panel.

**Filter**:
A choice, kept by the open app for one view, of components, relation types, conditions on attributes and a time range whose shapes the view hides; nothing moves. A relation shows only while both its ends do, and a container that holds a shape still shown stays, drawn faintly.
_Avoid_: query, hide rule, layer

**Focus**:
Reading a view from the selection: what the selection reaches through relations, up to some degrees and in one direction or both, stays as it is, and the rest is drawn faintly. It follows the selection while it is on.
_Avoid_: highlight, spotlight, neighborhood, ego network

**Isolate**:
Focus that hides what the selection does not reach, instead of drawing it faintly; the containers of what it reaches stay, drawn faintly.
_Avoid_: solo, hide others

**Turning**:
Drawing the selected shape's solid live in its shape, so that the person can turn it, zoom into it and point at its parts, until they end it and its picture comes back. It changes nothing stored, unless Use this view keeps where it is seen from (ADR 0075).
_Avoid_: focus (focus reads a view from the selection), 3D mode, live view, orbit (alone)

**Play**:
To step through an already defined sequence over the model: a scenario or a tour.
_Avoid_: animate, replay

**Scenario**:
A concrete example played step by step over a view, showing what moves where and what each step takes in and produces: a patient's request crossing services, a sentence going through a transformer's layers. A step can involve several relations at once. It can hold decisions, where it goes one of several labelled ways (ADR 0078). It is recorded by following relations in order or built by Claude from a description or a log.
_Avoid_: trace, run, flow, example (as a product term), simulation

**Step**:
One moment of a scenario: the relations it activates at once, a short description, and what it takes in and produces as data. Recorded by clicking a relation; Shift+click adds another relation to the same step.
_Avoid_: stage, hop

**Decision**:
A point of a scenario where it can go one of several labelled ways, its alternatives, such as "Are there free slots?". The viewer, Claude, a tour or an address chooses which plays; without a choice its default does. It never decides by itself from code (ADR 0078).
_Avoid_: branch, gateway, fork, switch, condition (for the decision itself)

**Alternative**:
One of the labelled ways a decision can go: the steps that play when it is chosen, none at all for the way where nothing happens, or the end of the scenario after them.
_Avoid_: branch, path, option, case

**Aggregated step**:
A single step played in place of consecutive scenario steps that happen entirely inside a collapsed container, labeled with how many it stands for.
_Avoid_: grouped step, collapsed step

**Broken step**:
A scenario step that uses a relation that no longer exists; it is kept and flagged so it can be fixed.
_Avoid_: orphan step, dead step

**Timeline**:
What a scenario plays, in order, over one view: its steps as that view draws them, consecutive steps inside a collapsed container played as one aggregated step, and broken steps kept in their places. It is worked out from the scenario, the view and the tab's choices at its decisions, never stored (ADR 0031, ADR 0078). The word names this alone, which is why History and Time range avoid it.
_Avoid_: playlist, sequence (Sequence names only Data modeling's component)

**Travelling marker**:
The mark that moves along each relation of the step being played, from its from end to its to end, leaving a short fading trail behind it while it moves (ADR 0077); when the system asks for reduced motion it stands still at the end it travels to.
_Avoid_: dot, token, pulse (a Pulse is a tour step's, not a scenario's)

**Tour**:
A saved sequence of steps, each a view state with an explanation, that is played to walk someone through a concept. A step can play a scenario. Created by a person or by Claude.
_Avoid_: walkthrough, presentation, story

**Reveal**:
A part of a tour step's marks that shows on its own press forward, with an optional sentence added to the caption, so that a step brings in what it explains one piece at a time (ADR 0077).
_Avoid_: build, fragment, animation

**Glide**:
How a tour step's transition moves the shapes it shares with the step before, matched by element, from their places before to their places after, while the camera moves; the shapes it does not share fade (ADR 0084).
_Avoid_: morph, magic move

**Pulse**:
A marker that a tour step sends along a chain of relations, one after the other, to show what follows what (ADR 0084). It is not a scenario: nothing of it is kept apart from the step.
_Avoid_: flow, animation

**Route**:
The path a relation's line takes in a view: where it attaches to each end, the points it bends at, and its style (orthogonal, straight or curved). Automatic unless chosen by hand: an automatic route takes the style its relation's appearance gives, else its view's, else orthogonal, and is drawn again after every layout and move (ADR 0069). A view keeps only what was chosen by hand, and Reset route goes back to the automatic route. An automatic orthogonal route goes around the shapes in its way, and the name plates of the containers it runs in, inside the container that holds both its ends (ADR 0039).
_Avoid_: path, connector, edge route, waypoints

**Bend point**:
A point a relation's route passes through, set by hand in a view, relative to the container whose shape holds both of the relation's ends.
_Avoid_: waypoint, control point, vertex, elbow

**Guidance**:
The marks and moves Claude makes live on the open view while it explains: highlighting shapes, focusing on some and dimming the rest, moving the canvas to one, showing a caption, filtering or focusing the view as a person would, opening, playing and stepping through a scenario, choosing the alternative that plays at one of its decisions, which stays the tab's choice for the person to change (ADR 0078), asking for a layout, playing a tour full screen, which is the person's to watch and end from then on, and showing a comparison, which the person ends too. Guidance itself never changes the model, a view file or the history, shows only while the app is open, and the person can end it; a layout it asks for is run by the app and recorded as the app records any layout, as the person's action, and Claude's layouts run one after another, each answered once the app says what it moved (ADR 0029). What a collapsed container hides is marked through the container or the aggregated relation that shows it.
_Avoid_: spotlight

**Caption**:
A short text, with its text emphasis (ADR 0082), shown over the canvas: the one Claude shows as part of its guidance, until it shows another, clears it, or the person dismisses it; and a tour step's title and text, shown in a card while the step plays (ADR 0058).
_Avoid_: toast

**Simulate**:
To compute a behavior from parameters the user changes: learning rate and loss curve, replicas and latency.

**Simulation**:
What a programmable component declares it can simulate: its parameters, its simulated values with their limits, how long a tick stands for and how many ticks a run plays; its package's code works out each tick (ADR 0085).
_Avoid_: model (the model is the project's), scenario (a scenario is a concrete example kept in a file)

**Simulation run**:
One element's simulation played in a tab from a set of parameters and a seed, tick by tick, until it stops; never saved, and the same code, parameters, seed and model always give the same ticks.
_Avoid_: scenario, playback (playback is a scenario's), execution

**Tick**:
One moment of a simulation run, numbered from 0, standing for the simulation's declared length of time.
_Avoid_: step (a step is a scenario's), frame, iteration

**Parameter**:
A value a simulation run starts from that the person, a view state or Claude chooses within its declared range, such as arrivals per second; kept by the tab, never in the model.
_Avoid_: setting, input, attribute (an attribute is the model's)

**Simulated value**:
A value a tick answers, such as a queue's length; one named like an attribute of its element is read in its place while the run is shown, marked `∿`.
_Avoid_: output, result, computed value (computed values come from the `attributes` hook)

**Simulation limit**:
The lowest or highest a simulated number may reach; past it the run stops cleanly at that tick and says which value went past which limit.
_Avoid_: bound, threshold, relation type limit

**Edit**:
To change the model or the canvas: create, move, put inside or take out of a container, connect, change the stacking order, delete.

**Action**:
One edit as the history keeps it: what a command, a batch or a pasted list did, with its label, its author (the person or Claude) and when it was done. The placement of the shapes it added, which the open app lays out, joins it when it only places them and makes room for them (ADR 0065). Undo and redo take back or bring back one action at a time.
_Avoid_: transaction, change set

**History**:
The actions of the open project since it was opened or last reloaded from disk, the ones undone among them, which the local program keeps in its memory (ADR 0028). The history panel lists them, newest first, and undoes or redoes up to any one of them.
_Avoid_: log, timeline, version history

**Drawing defaults**:
The values the canvas, the read-only page and every export draw with wherever no appearance sets them: line widths and arrowheads, borders and corner radii, the font and its sizes and weights, padding, how containers, collapsed containers and aggregated relations are drawn, the zoom at which names, details and rows show, and the grid's look. A project names a preset and changes any of its values, and a view changes them again for itself; both are stored in their files, so everyone opening the project and every export see the same. An appearance still comes first for what it sets (ADR 0086).
_Avoid_: style, settings, theme (for these values)

**Drawing preset**:
A named, built-in set of drawing defaults: Clean (the default), Dense, Expressive and High contrast.
_Avoid_: template, skin

### Preferences

**Preference**:
A choice a person makes for themselves on this computer: the theme, the language, whether the grid, snapping and the rulers are on, the colors they picked lately, the package code they approved, the name and email their comments are signed with, whether Claude's changes wait as a proposal for their review, how tours and scenario playback move (Motion and Fades, ADR 0077), and the widths of the side panels and whether each is collapsed (ADR 0032). The local program keeps preferences outside every project; they are never in project files or the undo history, though each comment keeps the name and email it was signed with. Claude's tools neither read nor change them, but for one answer: `read_package_code` says whether the person approved a package's code as it is now, and which capabilities they granted it, so that Claude knows whether it runs (ADR 0060). Only the person approves code.
_Avoid_: settings, profile

**Language**:
The language the app reads in, English or Spanish: its panels, menus, dialogs, captions, announcements and keyboard help, what the canvas writes, the names and descriptions of the built-in packages' components and relation types and of their attributes, and what the local program and the core tell the person. It follows the browser unless the person chooses one. What people write, such as names and descriptions, is never translated; a name the app gives something new, such as an element named after its component, is written in the language read in and is from then on what people wrote (ADR 0038).
_Avoid_: locale (in the app's text)

**Theme**:
The colors the app and the canvas itself are drawn in, light or dark: panels and text, the canvas background, the grid, the rulers, selection, labels, and notes and free arrows without colors of their own. Built-in packages give their components and relation types a shade for each theme; every color stored in a project is drawn as stored in both. A theme follows the system unless the person chooses one, and it never changes the project.
_Avoid_: skin, palette

### The local program

**Launch address**:
An address that opens a project in the browser once, within two minutes of being made. The local program opens or prints one instead of an address carrying the session token, which never leaves the program; the tab gets the token when it opens and keeps it for reloads. It can carry a view state too, which the tab applies once it has the token. Only one program runs on a project: opening the project again opens a tab in the program that runs (ADR 0044).
_Avoid_: magic link, one-time link

**View address**:
An address of the app whose fragment holds a view state and no secret. Each tab keeps its own in step with what it shows, so a reload comes back there, and Copy address copies it; pasted into a tab that has the project open, or opened in a new tab of the browser while another tab has the project open, whose session the new tab joins (ADR 0043), it opens the project at that view state.
_Avoid_: deep link, permalink

### What leaves and enters a project

**Read-only page**:
One HTML file made from a project that shows its views and plays its scenarios and tours in any browser, offline and on a phone, without the local program; its threads of comments and the speaker notes of its tours stay out. It changes nothing, holds no token and connects nowhere (ADR 0041).
_Avoid_: static site, viewer, export (alone)

**Import**:
Bringing a file made elsewhere (Mermaid, a spreadsheet, JSON, Structurizr, LikeC4, draw.io) into the project as one undoable action, after its kinds are mapped to components and relation types. What matches nothing is reported, and nothing in the file runs (ADR 0042). An HTML file is imported as an imported drawing instead.
_Avoid_: sync, conversion

**Imported drawing**:
An SVG image that the local program makes from a static HTML page or fragment: its tags and styles read from an allow-list, laid out with its text turned into outlines, and cleaned as every SVG image is; an element shows it as its drawing. Nothing in it runs, and nothing it names is fetched (ADR 0068).
_Avoid_: web view, embed, HTML component, iframe, screenshot

**Starter package**:
A built-in package for one domain, with its icons, a sample project and a scenario, which a new project can start from. What it ships carries a license that lets it ship (ADR 0047).
_Avoid_: template, library

**Sample project**:
A project that comes with Visual Anything to show a starter package at work, with its views and a scenario, from which a new project can start: the folder of the new project gets a copy of it (ADR 0051).
_Avoid_: template, demo, example (as a product term)

**Start screen**:
What the app shows while the local program runs on a folder that holds no project yet: the sample projects a project there can start from, and an empty project (ADR 0051).
_Avoid_: welcome screen, wizard

**Shared package**:
A package of a project's own copied from another project, with its images and its ids, and updated from there after a preview of what changed; the two copies live apart (ADR 0051).
_Avoid_: linked package, imported package, dependency

### Versions

**Version**:
The project as one commit of its repository holds it, or as the local program opened it or last read it from disk. A version is read and compared, never edited, and never written anywhere (ADR 0071).
_Avoid_: revision, snapshot, history (the history is the actions since the project opened). A proposal's `revision`, the count of its showings that an acceptance names (ADR 0073), is no version and keeps its name.

**Comparison**:
What changed between two versions of a project, worked out by id as a list of changes. It shows as a view drawn before, after, or with its changes marked, in the Changes list, and in exports. It is worked out, never stored (ADR 0070).
_Avoid_: diff (in the app's text), delta

**Change**:
One thing a comparison or a proposal holds, added, removed, changed or moved: an element, a relation, a definition, a view itself, a shape's place, a free shape, a scenario, a tour, a thread or the project itself. An element added or removed takes with it its shapes and the nesting relations that place it. A shape is moved when its place in a view differs.
_Avoid_: delta, hunk, patch, edit (an edit is what a person does)

**Proposal**:
Changes Claude asks to make, held by the local program while the person reviews them as a comparison. The person accepts them, all or change by change, or refuses them. What is accepted becomes one action of Claude's; nothing of a proposal reaches a file or the history before then (ADR 0073).
_Avoid_: suggestion, draft, pending change

**Merge driver**:
The program git runs, once the person's own git configuration names it, to merge two edits of one project file by id. Whatever clashes stays in that file as conflicts (ADR 0072).
_Avoid_: merge tool (git's word for another program), merge plugin

**Conflict**:
A place where two edits merged into one project file disagree, kept in that file as data: the value the file keeps, and the other side's. It stays until the person chooses one in the app, and the file still opens meanwhile.
_Avoid_: merge marker, clash

### Reading large models

**Overlay**:
A rule of a view that colors, sizes, marks or fades its shapes by an attribute, with a legend; stored in the view, since it is part of how the view reads (ADR 0055).
_Avoid_: theme, style, layer

**Legend**:
What an overlay's colors, sizes and marks mean, drawn on the canvas and in every export.
_Avoid_: key (alone)

**Level of detail**:
What a shape shows from a scale up: a silhouette, its name, its detail, its contents or rows, its image. An appearance declares its levels; without them, the canvas's own steps apply.
_Avoid_: LOD (in the app's text), zoom level

**External identifier**:
What an element, component or relation type is in someone else's catalog, by scheme, such as `uberon: UBERON:0002135`. It is data, never followed (ADR 0056).
_Avoid_: foreign key, reference

**Crosswalk**:
A table that maps the identifiers of one scheme to another's, used by importers.

**Destination**:
An attribute value that names a view of this project, a view of another project or a web address, and opens it when followed; a web address only after a confirmation.
_Avoid_: link, hyperlink, reference

**Live value**:
An attribute's value that comes from outside while the app is open, from Claude, the command line or package code granted an origin, shown over the stored value with its mark and age, fading once older than its sender's freshness, and never saved or put in the history (ADR 0057, ADR 0063).
_Avoid_: telemetry, metric, live data

**Time range**:
A filter of a view on a date, time or number attribute, or on a period between two, that hides what falls outside the range and keeps what has no value; moved with sliders and played, kept by the open app with the view's filters (ADR 0025), and carried with them by view states, so by view addresses and tour steps (ADR 0044).
_Avoid_: timeline, time slider, time window

**Element list**:
A panel that lists elements, by component or by scope, with their attributes as columns, edited in place. It shows live and computed values with the canvas's marks, and an edit changes what is stored.
_Avoid_: spreadsheet, data table, grid

### Explaining

**Full-screen playback**:
Playing a tour with the panels hidden, a caption card, a progress line and keys to go forward and back (ADR 0058).
_Avoid_: presentation mode, slideshow

**Speaker notes**:
What the person playing a tour says at one of its steps: plain text kept with the step, shown only in a second window during full-screen playback, never on the canvas, and left out of a read-only page (ADR 0058).
_Avoid_: presenter notes, comments (a comment is a remark in a thread)

**Thread**:
Comments about one thing, an element, a relation, a view or a point of a view, kept together in one file of the project, whether open or resolved (ADR 0059). Open threads show as pins on what they are about; resolved ones are kept, and show when asked for. A thread whose element, relation or view is deleted is kept as a detached thread, listed apart, and is about it again when the deletion is undone.
_Avoid_: conversation, discussion, orphan thread

**Comment**:
A remark in a thread, with its author and time. It is not a note, which is a free shape drawn on a view.
_Avoid_: annotation, note (a free shape)

### Package code

**Package code**:
JavaScript kept in a package that computes attributes, checks elements and draws inside shapes, run in an interpreter inside WebAssembly only after the person approves it by its hash (ADR 0054).
_Avoid_: plugin, script, macro

**Capability**:
What package code may reach beyond its element, declared by its package and approved by the person: the model, the clock, one web origin.
_Avoid_: permission (alone), scope (a view's)

**Hook**:
One of the three functions package code may export, each called with a frozen copy of an element and what lies around it, and answering plain data: `attributes` computes values, `check` finds problems, and `draw` says what to draw inside the element's shapes. It runs on the elements created from its package's components, and from components derived from them.
_Avoid_: callback, handler, script

**Computed value**:
An attribute's value that a hook of package code computed: shown with a mark naming its package, and never saved, put in the history or sent to a file.
_Avoid_: derived attribute, formula

**Approval**:
The person's consent that a package's code may run, given in the app after reading it, by the hash of its text and capabilities, with the capabilities they grant. It is a preference, never part of the project, so any change to the code asks again, and Claude cannot give one (ADR 0060).
_Avoid_: permission (alone), trust, whitelist
