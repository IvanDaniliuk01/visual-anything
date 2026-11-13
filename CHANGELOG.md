# Changelog

## 0.1.4

### Math

- **Write formulas in TeX, and see them typeset.** Write `$…$` within a line, or `$$…$$` on lines of their own as a block; GitHub's `` $`…`$ `` and a fenced block whose language is `math` read the same, so pasted Markdown keeps its formulas. Math works wherever text takes emphasis: notes, captions, reveals, speaker notes, descriptions, tour texts and text attributes whose format is emphasis, never names. The canvas, the inspector, tours, the hover card and the Outline draw it, and the editors' preview shows it as it will draw. A line that holds Math is as tall as its tallest formula, and a formula wider than its line shrinks, then is cut, with the hover card showing it whole. A dollar that opens nothing stays text, so `$20,000 and $30,000` reads as typed, and `\$` is always a dollar sign. Claude writes and reads Math as TeX in any text that takes emphasis, and its pictures show formulas typeset (ADR 0106).
- **A formula that cannot be typeset shows its TeX, and you hear about it.** It is drawn as typed, in a monospaced font over a dotted underline. When the app connects or reloads, the warnings notice lists Math that cannot be typeset, with the reason, and an info notice lists the texts that read as Math, so a pair of dollars that was not meant as Math can be written `\$`. Claude gets both in the answer of each write that sets such a text. `\color`, `\textcolor`, `\colorbox`, `\href` and color macros such as `\red` are refused, since colors come from the theme and links have their own syntax; `\tag`, `\raisebox`, `\vcenter`, the `CD` environment and numbered environments draw as their TeX for now. A formula takes at most 2,000 characters, and a text at most 200 formulas (ADR 0106).
- **Exports carry formulas.** The SVG writes each formula's glyphs as outlines, so it opens anywhere without KaTeX's fonts, and the PDF follows it; the PNG draws what the canvas draws; the read-only page brings the fonts its Math uses. Search, screen readers, `read_view`, `get_item`, the Markdown export, Mermaid and Structurizr read and write the TeX as typed, and imports escape the dollars they bring, such as SQL's `$1`, so they keep reading as typed (ADR 0106).

### Explorables

- **Explain with a page the reader plays with.** An explorable is a page of HTML, CSS and JavaScript, such as a function's graph with sliders or an algorithm stepping through its data, that a package defines and keeps as one file, `explorables/<name>.html`, beside the project: edit it in your own editor and the app reloads it. An element shows it, or every element of a component does, and it reads that element's data: its attributes and their values, what it contains and its relations, with the theme's colors and the app's language. Claude writes one with `write_explorable`, reads them with `list_explorables` and `read_explorable`, and has an element or a component show one with `set_appearance`; you choose it under **Its explorable** in a component's appearance, or in an element's appearance in the inspector. Claude writes an explorable in the project directly, never into a proposal, and you approve it before it runs (ADR 0107).
- **It runs only once you approve it.** The first time, a dialog shows its name and description, who wrote it (Claude in this session, or from outside: an import, git or your own editor), the script libraries it uses with their version, license and size, and its code behind Show code; Approve and run lets it run. It runs walled off: it cannot see your files, this session or the network, and the dialog names the one thing no browser lets anyone block fully, sending data out over WebRTC. Your approval is kept on this computer by the page's hash and holds in any project with the same explorable; when Claude changes an approved one through `write_explorable` the approval continues, while a change from your editor or git asks again. Claude never approves. Packages… lists Approved explorables, each with Withdraw approval. One that stops answering for 3 seconds is stopped, and its card says why, with Run again (ADR 0107).
- **The explorable panel shows the selected element's explorable live.** Press Explorable on the canvas toolbar; it opens beside the canvas, alone or under the physical-space panel, and you resize it. Open beside shows the explorable in a pane of the split view instead (ADR 0107).
- **On the canvas, an explorable is a still picture until you explore it.** Double-click it, or press Explore in its inspector, and it runs in place; up to four run at once on a canvas, and exploring a fifth pauses the one used longest ago. Escape or its × button turns it still again, and each one stays as you left it, its sliders and its step, with its shape showing a still picture of it as you left it. Explorable shape… on the canvas toolbar puts one loose on the view, and Put on the canvas in the explorable panel puts the one it shows there, bound to its element; the shape's inspector changes its name, its explorable and the element it is Bound to. An explorable not approved, or stopped, shows a card with its name, description, script libraries and why it is not running. Claude places one with `add_explorable_shape`, and `capture_explorable` gives it the still picture and the page's console errors (ADR 0107).
- **Script libraries come from the npm registry, once, and stay with the project.** An explorable can use a library that ships one file setting a global, such as D3, Plotly, function-plot, JSXGraph, Chart.js, KaTeX or mathjs. Before any byte is fetched you see who asks, the package, its exact version and the registry's two addresses; the file is checked against the registry's own hash, none of its install scripts runs, and it is kept in `script-libraries/` so explorables run offline. In the Components tab, Ask for a script library… asks for one, and the files no package names are listed for Remove. Claude asks you with `request_script_library`. A library that ships only modules, such as three.js, is refused for now, and one that compiles strings into code fails in the page (ADR 0107).
- **A tour step can show an explorable live.** The step editor's Explorable section picks one and sets its parameters, each with its default; while the tour plays, it runs beside the caption with the step's values, and moving through the steps never reloads it. The speaker notes name it and its values. A step whose explorable no longer takes a value it sets is a broken step, played with the defaults until Take out what it no longer takes, or Show none. Claude sets it with `explorable` on `create_tour`, `add_tour_step` and `update_tour_step` (ADR 0107).
- **Import an HTML page as an explorable.** Import… and paste ask As a drawing, the default, which runs nothing, or As an explorable, which runs once you approve it; the format list offers HTML, as an explorable. Nothing is approved on import: the report offers Review and approve… (ADR 0107).
- **Exports show still pictures, and nothing runs outside the app.** The SVG and the PDF draw each explorable as the still picture the tab keeps, or its card when there is none; the PNG draws what the canvas shows. The read-only page holds those still pictures, in the light and the dark theme, and says the explorable runs live only in Visual Anything. The command line and Claude's `export_view` draw cards (ADR 0107).

### Videos and link cards

- **Add videos as you add pictures.** Drop, paste or choose with Picture… an MP4 of H.264 or a WebM of VP8, VP9 or AV1, up to 50 MiB; past 25 MiB the app reminds you that the file joins the project's git history. It shows its poster, its first frame, kept when you add it; a click plays it muted and in a loop, and another stops it, as do Play and Stop in the inspector; four play at once at most. The file is cleaned to what a player needs, so it keeps nothing that names a person, a place, a device or a time beyond what the encoder writes into the frames; a fragmented MP4 is refused. The SVG and the PDF draw its poster with a play mark, and the read-only page plays videos of up to 32 MiB and shows the poster of larger ones. Claude adds one with `add_video`, without a poster: Make its poster in the inspector makes one (ADR 0098).
- **Link cards point to a web page.** Link card… on the canvas toolbar, or pasting an address on the canvas, adds a card with its address, a title, a description and a picture if you want one. Fetch the preview in its inspector reads the page once, over https, and keeps its title, description and image, as one change undo takes back; nothing on the page runs and no cookie is sent. A click on the card's address, or Open the address, opens it in a new tab; no other site is ever shown inside the app or the page. The SVG and the PDF keep the link, and in the read-only page a click on the card opens it. Claude adds one with `add_link_card`, which fetches nothing (ADR 0098).

### Scenarios and tours

- **Steps choose the pictures, videos and link cards they show.** The step editor in the scenario panel and in the tours panel has a Shows section, a checkbox for each picture, video and link card of the step's view, and Plays beside each video. Once one step of a scenario or tour chooses, the rest of the view's pictures are hidden while it plays, and each step's videos play muted while it shows (none start under reduced motion); one that chooses none shows them all, as before. A step keeps naming a picture deleted since and plays without it: the delete dialog lists those steps, and the scenario panel flags them with Shows what is gone. The read-only page plays them the same way; the SVG and the PDF draw every picture. Claude sets `shows` and `playing` with `create_scenario_from_steps`, `update_scenario`'s `show`, `add_tour_step` and `update_tour_step`, and reads them with `read_scenario` and `read_tour` (ADR 0098).

### Lines

- **Get back to automatic routes from the keys.** Alt+Shift+R resets the routes of the selected lines and of the lines of the selected shapes; the shape's menu, the relation's menu and the Arrange tab offer Reset routes too. Attach ends automatically lets the ends find their place again and keeps the bend points, and Reset every route in this view, in the view's inspector, says how many routes were chosen by hand. Ctrl+Shift+E selects the lines of the selected shapes, or every line when nothing is selected, a box dragged around lines takes them too, and Alt+Shift+L presses Layout. On macOS they are ⌥⇧R, ⌘⇧E and ⌥⇧L. Claude's `reset_route` takes `all: true` for a view's every route and `attach: true` to reset only the ends (ADR 0092).
- **Routes drawn by hand stretch with their ends.** When the two ends of such a line move apart, its bend points spread with them instead of only the corner next to the end that moved, so the route keeps its shape, stays orthogonal and stays level where it meets its shapes. Ends that move together still carry the whole route (ADR 0092).

### Samples

- **Two new samples on the Projects screen.** "Machine learning: the math of a spam filter" writes out a logistic regression's probability, loss and training in Math. "Math: a quadratic function" writes out f(x) = ax² + bx + c, its discriminant and roots, with an explorable that draws the parabola as a, b and c change and a tour that sets them step by step; the explorable runs once you approve it.

### Worth knowing

- Projects with videos, link cards, explorables, script libraries, explorable shapes or steps that choose what they show open only in 0.1.4 and later. Math changes nothing in the files: an older version shows the TeX as typed. The live connection's version goes from 11 to 17.
- A text with a pair of dollars that reads as Math, which 0.1.3 showed as typed, is now typeset; the info notice lists such texts, and `\$` keeps a dollar a dollar.
- A route drawn by hand whose ends move apart now stretches, where 0.1.3 slid only the corner next to the end that moved.
- Visual Anything reaches the internet only when you ask: a link card's preview, a script library you approve, or a data source you granted. Nothing else connects.
- Explorables run only in the app, never in exports or the read-only page. Their checks were run in Chrome; Firefox and Safari have not been checked yet. Each running explorable is a browser process of its own, so a tab keeps at most eight; past that, the hidden one used longest ago is let go, and its shape keeps a still picture of it as you left it. While you zoom, a running explorable keeps its scale and takes the new one once the zoom rests.
- KaTeX's fonts, which draw Math, ship unchanged under the SIL Open Font License 1.1, listed in `THIRD-PARTY-NOTICES.md` (ADR 0108).

## 0.1.3

### Views

- **Show views side by side** (#12). Press Beside on a view in the view list, or beside a destination that opens a view in the inspector, and the canvas splits into panes, up to three: a story beside the view of how its data is stored, or two cases to compare. Each pane keeps its own camera, filters and focus; drag the border between two panes, or move it with the arrow keys, and change or close a pane from its header. One pane is active, shown by its border: the inspector, the outline, search, export, Copy address, scenarios, tours and Claude's guidance follow it, and selecting an element highlights it in every pane that draws it. The panes come back when the tab reloads, and closing all but one gives you the single canvas again (ADR 0102).
- **A tour step can show a view beside it** (#12). In a step's settings, **Show beside** picks a view, or **Use what the pane beside shows now** takes the view and place of the pane right of the active one: while the tour plays, that pane shows it, gliding there as steps do, and a step without one shows what the step before it showed there. When the tour ends, the panes come back exactly as they were. Claude sets it with `beside` on a tour's steps (ADR 0102).
- **File views in folders** (#11). The view list shows view folders you make, nested as deep as you want, in the order you choose: New folder… beside New view…, drag views and folders where they go, or move them from their settings. Folders open and close, and each person's browser remembers which are closed; a view no folder holds shows after them. Claude files views too, with `organize_views` (ADR 0101).
- **Give World's tree more room:** drag the divider under it in the Model tab, or move it with the arrow keys; double-click it to give the tree its own height again. Your browser remembers the height.

### The canvas

- **Shapes whose face is as tall as its content keep up with their attributes, and are as wide as their text needs** (#15). Changing only an attribute that a face writes draws the shape again at once, on the canvas and in what Claude captures. A face that would cut a line that does not wrap makes its shape wider until the line fits, up to 640 units, whether you placed the shape, layout did or Claude gave its position; a line clamp is your own limit and never widens it, and a width you set by resizing it still wins (ADR 0083).
- **Copy and paste elements between views, and duplicate them** (#13). Ctrl+C copies the selection, from the canvas or the Outline; Ctrl+V shows the same elements in the open view, where the pointer is, adding them to its scope when it leaves them out, so renaming one renames it everywhere; when the view shows them already, they are selected and the canvas says so. Ctrl+Shift+V, or Paste as duplicates in the canvas's menu, makes new elements instead, with everything they hold and the relations among them, inside the container under the pointer; Ctrl+D, or Duplicate in the shape's menu, does it beside the selection. Notes, arrows and pictures are pasted as copies. Pasting what another project copied is refused, for now. Claude duplicates with `duplicate_elements` (ADR 0103).
- **Claude's pictures show the view guidance just opened, and come from a tab in the background** (#16). `capture_view` right after `pan_to` or `highlight` opened another view waits until the tab shows that view drawn, with no layout moving in, instead of picturing the view before or finding none of the elements named. A tab in the background or a minimized window draws the picture without waiting for frames its browser never draws, and when no answer comes in time Claude is told what the program waited for (ADR 0081).
- **Dragging an element that sits in several containers moves only the copy you grabbed** (#10). Each copy keeps its own place, so you can arrange them one by one; selecting it still highlights every copy, and moving it from the keyboard still moves them all (ADR 0007).
- In a view of solids drawn by their parts, leaving a relation type out, or bringing it back, draws again at once the callouts its relations make.

### Claude

- **Commands refuse what they do not take, and say what they take** (#14). A command Claude sends through `run_commands` with a key it does not take, such as a scope in `update-view`'s changes or `ids` in a delete, is refused, naming the keys it takes and, when another command sets it, which one, instead of doing the rest and dropping the key; so is a field left out or a value of the wrong kind. `update-free-shape` takes changes part by part, such as only a note's height, and no malformed command answers in JavaScript's words any more. The new `describe_command` gives each command's fields, which it needs, what each means and an example (ADR 0104). The commands a package's code returns are checked the same way.
- **Claude's write answers stop repeating the attributes a component does not define** (#17). Adding or changing elements that carry attributes their component does not define now answers once per component: how many of the elements carry them and their names, each once, at most 20, and only those this write set, never their values; `get_item` still lists every one an element carries. A component can also say its elements carry attributes of their own on purpose, as the rows of a table carry their columns: tick **Its elements may carry attributes it does not define** in the component editor, or Claude sets `openAttributes` with `define_component` or `update_component`. Then nothing names those attributes as undefined, the inspector no longer marks them as particularities, and components derived from it do the same unless they say otherwise (ADR 0105).

### Worth knowing

- Projects with a tour step that shows a view beside it, or a component with open attributes, open only in 0.1.3 and later. The live connection's version goes from 10 to 11.
- A command with a key it does not take, which 0.1.2 carried out while dropping the key, is now refused, saying which keys it takes. The app's own commands and the example packages send none; a package of your own whose code returns such a command will see it refused.

## 0.1.2

### Pictures

- **Pictures and animated GIFs sit on the canvas like notes.** Drop a PNG, JPEG, WebP, GIF or SVG on the canvas, paste one with Ctrl+V, or press Picture… on the canvas toolbar. Move, align, resize and delete it as you would a note; resizing keeps its proportions unless you hold Shift (ADR 0098).
- **Its file is kept beside the project**, in `media/`, cleaned once and named by its content, so the same picture used twice is one file and git never conflicts on it. The inspector lists the files no picture names and removes them when you ask.
- **GIFs play** while they are on screen, and show their first frame under reduced motion until you point at them.
- **Exports carry them:** SVG, PDF and PNG show a GIF at its first frame, and the read-only page plays it. Claude adds pictures with `add_picture`.

### Tours

- **A step can mark what it explains in its own style** instead of with a halo on top (#9). A marked line gets twice as wide, in the highlight color, with a larger arrowhead and its dash kept, and its dash flows from its start to its end so its direction reads at a glance; its name is bold on a solid back. A marked shape gets a stronger border in its own color and a soft shadow, and breathes once as it arrives, keeping its fill and face in sight. Choose it for a whole tour or for one step; tours that don't choose keep their halos (ADR 0100).

### Restarts and new addresses

- **A tab rejoins by itself after the program restarts** on the same folder and port, without a new address, and says so. The session is kept in a record only your account can read, for a day without running at most (ADR 0099).
- **A new address is one command away:** `visual-anything address`, or `docker exec visual-anything visual-anything address` in Docker.
- **No more piles of tabs:** when Claude opens the app while a tab is connected, that tab is asked to come forward instead of another one opening.

### The side panel

- Every tab of the side panel scrolls sideways when it is narrow, and the outline and World's tree scroll to their longest name instead of cutting it.

### Docker

- The account the container runs as now comes from `VISUAL_ANYTHING_UID` and `VISUAL_ANYTHING_GID`: bash keeps `UID` read-only, so the old command failed (#7).
- The image names its commit and version in its labels, and is published as `v0.1.2` and `sha-<commit>` beside `latest` (#6).

### Worth knowing

- Views that hold pictures, and tours that choose an emphasis, open only in 0.1.2 and later. The live connection's version goes from 9 to 10.

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
