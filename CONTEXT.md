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
A trait of a single element: an attribute value that differs from the default its component gives, an attribute its component does not define, or an appearance of its own. A value for an attribute whose component gives no default is the element's ordinary data, not a particularity.
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

**Stacking order**:
The order, kept per view, in which the shapes that sit directly in one container, or directly in World, are drawn, from back to front. Every copy of a container draws its contents in the same order. A shape is drawn together with everything inside it, so a container's contents are always in front of it, and a shape is in front of or behind a whole container, never between it and its contents. Relations, then free shapes, are drawn in front of every element's shape. A new element is drawn in front of the shapes beside it, and an element put inside a container from the canvas comes in front there.
_Avoid_: layer, z-order, z-index, depth, level

**Outline**:
The open view written out as a list, shape by shape: what sits directly in World, then what sits inside each container, in the model's order whatever the stacking order, with the relations drawn from each shape. It can be read and moved through from the keyboard, and it follows the selection.
_Avoid_: layers panel, tree view

**Aggregated relation**:
A single relation drawn in place of many relations of the same type between the contents of a collapsed container and another element, labeled with how many it stands for.
_Avoid_: bundle, summary edge

**View**:
A projection of the model onto the canvas, seen from exactly one perspective and keeping its own positions.
_Avoid_: page, diagram, layer

### Components

**Component**:
The reusable definition of a kind of element: how it looks, which attributes it has and which interactions it supports. "Neuron" is a component; each neuron placed is an element. A component derives from exactly one other component and inherits everything it does not redefine.
_Avoid_: plugin, widget, template, class

**Essence**:
The component every other component ultimately derives from.
_Avoid_: base component, root type, object

**Declarative component**:
A component defined only by its appearance, attributes and connection points, with no code; it can be created from the canvas.

**Programmable component**:
A component that extends a declarative one with its own code to draw itself or simulate.

**Package**:
A set of components and relation types from one domain, shared as a unit: "Neuroscience", "Data modeling".
_Avoid_: library, plugin, extension

**Built-in package**:
A package that comes with Visual Anything, such as "Systems". A project uses it by listing its id; it is never copied into the project folder.
_Avoid_: default package, standard library

### Dimensions

**Dimension**:
An axis from which the model is seen. There are five: abstraction level, perspective, time, attribute space and physical space.
_Avoid_: layer, facet

**Abstraction level**:
How much detail of an element is shown, from a single box down to its inner parts.
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

**Aggregated step**:
A single step played in place of consecutive scenario steps that happen entirely inside a collapsed container, labeled with how many it stands for.
_Avoid_: grouped step, collapsed step

**Broken step**:
A scenario step that uses a relation that no longer exists; it is kept and flagged so it can be fixed.
_Avoid_: orphan step, dead step

**Tour**:
A saved sequence of steps, each a view state with an explanation, that is played to walk someone through a concept. A step can play a scenario. Created by a person or by Claude.
_Avoid_: walkthrough, presentation, story

**Simulate**:
To compute a behavior from parameters the user changes: learning rate and loss curve, replicas and latency.

**Edit**:
To change the model or the canvas: create, move, put inside or take out of a container, connect, change the stacking order, delete.
