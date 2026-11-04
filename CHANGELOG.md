# Changelog

## 0.1.1

### Tours

- **Each caption is placed where it reads best.** While a tour plays, drag a step's caption anywhere on the screen, and drag its sides or corners to make it wider, taller or both. The step keeps its place and size as proportions of the screen, so it fits other screens too (ADR 0095, ADR 0096).
- **Captions take a look of their own**, written in the same HTML and CSS subset as a component's face: `{{name}}` is the title, `{{text}}` the text, and `{{step}}` and `{{steps}}` say where the step is. A tour can give every caption one look, and each step can have its own (ADR 0096).
- **A caption's line to what it explains** can be straight, have one right-angled turn or curve. It can end in a dot, an arrow or nothing, and leave the caption from any of its sides (ADR 0097).
- **The tours panel** scrolls, and offers the caption's corner, look, size and line under each step.

### Lines

- A route drawn by hand no longer folds back over itself, and bend points that no longer turn the line lose their handles. This includes bend points a fraction of a unit away from where the line enters a shape (ADR 0039).

### Docker

- **An image runs the program in a container**, with your projects in a folder of your own and its port open only to this computer (ADR 0094). The README's "Run it in Docker" says how.

### Worth knowing

- Tours that use a caption's new place, size, look or line open only in 0.1.1 and later. The live connection's version goes from 8 to 9.

## 0.1.0 — the first public version

Visual Anything turns a model of a concept or a system into views you can explore. It runs on your own computer: a local program serves the app on 127.0.0.1 and keeps your project as plain JSON files in a folder you can put under git. Claude works on the same model through MCP.

### What it does

- **A model first, views after.** Elements come from components, and relations from relation types, in packages. Each view shows part of the model and arranges it automatically. A shape you move by hand stays pinned.
- **A canvas made for large models.** It pans, zooms and selects at 60 fps with 10,000 elements in a view. Containers collapse and expand, and the canvas shows less detail as you zoom out. Lines go around shapes, and you can route any line by hand.
- **Built-in worlds, each with a sample project:**
  - systems architecture and C4;
  - data science and machine learning;
  - data modeling, with whole databases and SQL DDL export;
  - processes;
  - physical AI, with robot arms, joints and motion;
  - healthcare;
  - finance.
- **Scenarios and tours.**
  - Scenarios play a sequence of steps over a view, with decisions between alternatives.
  - Tours guide a viewer through views step by step, with captions and shapes gliding to their new places.
- **Simulation.** A programmable component simulates its behavior tick by tick, in a sandbox, within limits it cannot exceed.
- **Physical space.** A component can draw a 3D solid inside its shape. A panel beside the canvas shows elements where they really are, and turning a joint moves everything it carries.
- **Packages that extend the app.** Packages add actions, importers, exporters and panels. Their code runs sandboxed in QuickJS, and only after you approve it by its hash.
- **The format panel.** Style, Text and Arrange tabs set colors, gradients, borders, fonts, rotation and more, for one shape or many.
- **Versions.**
  - Compare a view between git commits, in the app or for a pull request.
  - Review Claude's changes before they apply.
  - A git merge driver merges project files by id and keeps conflicts as data.
- **Exports.** SVG, PDF, PNG, Mermaid, Structurizr and a read-only HTML page that connects nowhere. Imports read draw.io, LikeC4 and Structurizr files.
- **English and Spanish**, light and dark themes, and full keyboard use.

### Worth knowing if you used an earlier build

- **A shape's text block now sits in its middle by default** (ADR 0082). The block is the name together with the detail. A component can still place it at the top or the bottom ("Where its text sits").
- **Clean is the look of every project that sets no drawing defaults** (ADR 0086). It has thin neutral lines, small arrowheads, 1-wide borders, rounded corners and no shadows. A project can choose another look in its drawing defaults.

### Known limits

- Layout of a view with 10,000 elements takes longer than its 20-second budget.
- A few benchmarks were recorded but do not meet their marks on modest machines.
- Lines and automatic layout are next in line for polish (ADR 0092).
