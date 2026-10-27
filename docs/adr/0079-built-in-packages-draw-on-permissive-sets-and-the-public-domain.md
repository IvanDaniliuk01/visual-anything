---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# Built-in packages draw on permissive picture sets and the public domain

The user asked for more visual packages, beyond Systems, C4, Data modeling and Data science pipelines. The research on visual packages read the terms of some forty sources of pictures on their own sites. Two lines of earlier decisions stood in the way. ADR 0047 left out "icon sets whose terms differ from their code's", which, read to the letter, excludes sets such as Health Icons (pictures CC0, code MIT) and EBI's anatomograms (pictures CC-BY-4.0, code Apache-2.0). ADR 0051 rejected pictures from outside sets "for now". Its list of licenses also had no way to say public domain, although Gray's anatomical plates and Natural Earth are in it. This clarifies ADR 0047 and supersedes that line of ADR 0051.

## Decision

### What may ship

- **ADR 0047's list gains the public domain:** `CC-PDM-1.0`, the Public Domain Mark, and `LicenseRef-public-domain`, for a work its author dedicated to the public domain without a standard text. An image under either names in its `source` where the work was marked or dedicated.
- **A set ships under its pictures' terms.** ADR 0047's line on "icon sets whose terms differ from their code's" means sets whose terms *for the pictures* are not on the list. A set whose code is under one allowed license and whose pictures are under another allowed one ships under its pictures' license.
- **Built-in packages may draw pictures from outside sets** whose pictures' terms are on the list. This supersedes ADR 0051's "rejected for now". The sets the research checked and allows:
  - Tabler (MIT) and Lucide (ISC), whose style matches our own icons; IBM Carbon (Apache-2.0); Material Symbols (Apache-2.0); the Kubernetes community icons (Apache-2.0), in their unlabelled variant;
  - Health Icons (CC0-1.0); Bioicons, item by item, only where the item is CC0-1.0, CC-BY-4.0 or MIT;
  - EBI's anatomograms, SciDraw and Reactome's icons (CC-BY-4.0);
  - Gray's plates and other public-domain works (CC-PDM-1.0 or `LicenseRef-public-domain`).
- **Never shipped:** brand logos, whatever their license (Simple Icons, Carbon's `logo--*`); the AWS, Azure, Google Cloud and Cisco icons, CNCF artwork, ROS artwork and Docker's and HashiCorp's marks, whose terms restrict reuse or changes; anything non-commercial, no-derivatives or share-alike (the Allen Brain Atlas, KiCad's libraries, OpenMoji); CC-BY-3.0, until a package needs it. A person may still import any of these into their own project.

### How credit travels

- **Notices.** The program ships `THIRD-PARTY-NOTICES.md` with the license texts of the MIT, ISC and Apache-2.0 sets its built-in packages use. A test checks that every set a built-in image names is in it.
- **Each image's credit.** An image under CC-BY-4.0 names its author and address in its `source`. Exports write, besides each package's attribution (ADR 0047), the `source` of each CC-BY-4.0 image they draw, once each. A package's attribution lists its sets and the words "adapted: cleaned, simplified, ids renamed" where they apply.

### How an outside picture comes in

- At authoring time, never at run time: chosen (at most 128 images a package), recolored to the component's stroke or shown as a silhouette with `tint`, simplified below the cleaner's caps (ADR 0027: 64 KiB of output), its named parts' ids renamed to stable English ids (EBI's UBERON ids are kept, as external identifiers, ADR 0056), cleaned with `cleanSvg` and stored as the cleaner gives it. The caps do not change for large atlases: they are simplified, or split into several drawings.

### Names, and marks

- A package is named for what it describes, not for a mark: **Processes and state machines**, described as "in the style of BPMN"; **Container orchestration (Kubernetes)**, naming Kubernetes only to say what it is for. ArchiMate stays out while its terms for open-source tools are unclear.

### The packages, in order

- **Reserved ids** gain `machine-learning`, `process`, `networks`, `kubernetes`, `control-and-circuits` and `anatomy`, beside `neuroscience` and `physical-ai`.
- **First:** Machine learning (its `machine-learning.model` derives from `data-science.model`), Physical AI and robotics, and Processes and state machines. They use our own CC0 drawings, CC0 Bioicons and Tabler, and are the first built-in packages with free geometry and drawings with parts: a Transformer block, a six-axis arm and a mobile robot.
- **Then:** Neuroscience, with EBI's brain simplified, SciDraw and Gray's plates; then Networks and cloud with Carbon, and Container orchestration with the Kubernetes icons; then Control and circuits.
- **Anatomy stays with M13**, which also imports ontologies. A world map waits: disputed borders need their own decision.

## Considered options

- **Keeping every built-in picture our own CC0 drawing:** rejected as the only way. It keeps exports free of credits, but it is too slow for neuroscience or networks, and the sets above ask little.
- **Reading ADR 0047's line to the letter:** rejected. It would exclude the CC0 and CC-BY sets it meant to allow.
- **Raising the cleaner's caps for atlases:** rejected. Every picture is drawn by every reader; simplifying once, at authoring time, keeps them all fast.
- **Provider icons under their own terms:** rejected; their terms forbid changing them or using them outside diagrams of their services.

## Consequences

- `SHIPPABLE_LICENSES` gains `CC-PDM-1.0` and `LicenseRef-public-domain`, and `RESERVED_PACKAGE_IDS` the new ids.
- `THIRD-PARTY-NOTICES.md` and its test, and the per-image credits in exports, come with the first package that uses an outside set under MIT, ISC, Apache-2.0 or CC-BY-4.0.
- The spec plans Track P, the visual packages, in the order above.
- ADR 0047 and ADR 0051 each gain a note pointing here.

## Clarifications

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

- 2026-10-26, brought up to M8b on 2026-10-27 (P1, W62): **the Machine learning package.**
  - **Two components are drawn with parts**, so that a drawing comes from the palette as it is: Transformer block, derived from Block, and Convolutional network, derived from Machine learning's Model. Each shows its picture with `placement: "parts"`. A layer names its part in its own appearance, as a particularity, since two layers of one kind are different parts of one picture (`add-norm-1` and `add-norm-2`, `conv-1` and `conv-2`). The parts' ids are those of the spec, and a layer anchors to one wherever it sits in a drawing of that picture.
  - **Attributes beyond the spec's**, each one a kind of layer is read by: a Block's `repeats`; Dense's `units`; Convolution's `filters` and `kernel`; Attention's `heads`; Embedding's `dimensions`; Normalization's `method`; Recurrent's `cell`; Pooling's `operation`. Machine learning's Model inherits `framework` and `metric` from Data science pipelines' and adds `parameters`.
  - **Limits name `data-science.model`** wherever they mean a model, so that a model of Data science pipelines and every model derived from it, Machine learning's included, keep within them.
  - **Starting to use a built-in package starts using the built-in packages it needs**, each just before it, in the same `update-project`, as `add-package` does (ADR 0051): using Machine learning uses Data science pipelines too. What a built-in package needs is read from it alone. Stopping the use of one that another package in use needs stays refused (`in-use`).
  - **Free geometry** draws a tensor as a box seen from above, a loss as a bowl, an optimizer as a hexagon, a metric as a gauge and a training run as an arrow forward, each one contour in a box of its shape's own size. Each label area is the largest rectangle of its outline that keeps its corners inside, so that the sample's names, as long as "Binary cross-entropy", fit whole beside the icon and are not written under the shape (ADR 0066's clarification on whole names). Layers, datasets, blocks and models keep their kinds, which read as well.
  - **"adds to" is drawn as a dashed curve** (`route: "curved"`, ADR 0069), the way residual connections skip around the steps between; "flows into" takes the view's style.
  - **Its pictures are its own drawings, CC0-1.0.** The drawings' parts are boxes in the colours of the layers drawn as them. What no part holds (the arrows, the residual connections, the sum and the block's frame) is drawn in one grey, `#747D8C`, that reads at 3:1 or more on the drawings' fills in both themes, since a picture is drawn as stored in both (ADR 0033). Its tests hold each part's stroke at 4.5:1 on its fill, its stroke at 3:1 on the drawing's light fill and its fill at 3:1 on the dark one.
  - **Spanish names its layers "capa"**, which the glossary avoids for the stacking order: the catalog test allows it in the names of the layers and in texts that speak of a neural network, as it allows Systems' "capa semántica". Since the glossary also avoids "incrustar" and "región" (M8b), the embedding layer is "Capa de embedding", as Spanish texts on machine learning name it, and a pooling layer takes each "ventana" of its input down to one value, a window in English too.
  - **The sample "Churn classifier"** (`examples/churn-classifier`) is offered third. Its three views are as the app's layout gives them; in Architecture, layout takes the drawing with parts as one block with a port for each related part (ADR 0015's clarification), so that the input sits beside the embedding at the picture's foot and the head beside the output on top, and no position is stored for an anchored part. An app test holds that every name in its views with outlines is written whole inside its shape.
- 2026-10-26, brought up to M8b on 2026-10-27 (P1, W63): **the Physical AI and robotics package** (`physical-ai`, `core/src/builtin/physical-ai.ts`).
  - **Its pictures are all drawn for Visual Anything, under CC0-1.0**: an icon for every component but Link, and the two drawings with parts. It uses no outside set, so it adds nothing to `THIRD-PARTY-NOTICES.md`, which still waits for the first package that does.
  - **What nests.** "is part of" places anything in a robot, its `to` limited to Robot. "runs on" places a node on a compute unit and nests too, as C4's "runs in" does. "is attached to", the kinematic chain, does not.
  - **Limits, which only warn.**
    - "is attached to" limits only its `to`, to links and joints, so that a sensor or a gripper mounts on a link.
    - "commands" runs from a controller to an actuator or to another controller, since a policy gives a joint controller its targets.
    - "senses" limits only its `from`, to sensors, since what it measures can be anything around the robot.
    - "drives" runs from an actuator to a joint; "publishes to" and "subscribes to" from a node to a topic; "runs on" from a node to a compute unit.
  - **Attributes.** Those the spec names, and two more: Compute unit's `hardware` and Node's `middleware`, the one place "ROS 2" appears, as an example value. A joint's `lowerLimit` and `upperLimit` are in degrees for a joint that turns and in metres for one that slides, so they have no unit of their own. Rates are in Hz, mass in kg, length in m and torque in N·m.
  - **Colors.** The kinds of sensor and actuator set only their icon and take their parent's colors. Policy sets its own, so that the learned side reads apart from the controllers.
  - **The drawings.**
    - The six-axis arm is seen from the side, reaching over to pick: the column, the upper arm straight up, the forearm out to the right, and the wrist down to the gripper, whose jaws open toward the part below. Its parts are in the order of the chain (`base`, `joint-1`, `link-1`, … `joint-6`, `link-6`, `gripper`), so that the keyboard and the outline follow the chain. The joints that turn across the page are discs, the roll joints 4 and 6 collars. The gripper is a group: a body, which holds its name, and two jaws.
    - The mobile robot is seen from above, its front to the right and its left wheel at the top, its sensors set in wells cut into the chassis.
    - In both, parts lie 6 units apart, so that the background shows between them in both themes. Each is filled in one mid tone that reads at 3:1 or more on a robot's fill in both themes: links in the links' blue, joints in the joints' amber.
    - **Every part is large enough to write its name whole inside itself** (ADR 0066's clarification on whole names): "Joint 4" on two lines in a collar, "Right wheel" on one in a wheel. A first drawing, with parts as small as 8 units across and holes for the axes, wrote most names nowhere, so it was drawn again before it shipped. A test holds it.
  - **No component shows a drawing.** A robot element shows one from its own appearance, placed with `parts`. Its links, joints and sensors name their part without `image`, so that the part is found in the drawing they sit in.
  - **Names.** "Link" names a component, as C4's "Deployment node" does: the glossary's words to avoid are about the model's own terms. In Spanish, Node is "Nodo de software", as C4's is "Nodo de despliegue", and the catalog's test allows both.
  - **The sample** is `examples/robot-arm`, "Pick-and-place arm": an arm drawn with its parts, its kinematic chain and its software, in three views, with the scenario "Reach and grasp" in the arm's view.
    - The arm's view leaves "is attached to" out (ADR 0064), since the chain's lines would cover the drawing; the "Kinematic chain" view shows it.
    - All three views are as the app's layout gives them. In the arm's view, layout takes the drawing as one block (ADR 0015's clarification), places the motor, the encoder and the camera under its picture, and stores no position for an anchored part.
    - Every shape with an outline of its own writes its name whole inside itself: each anchored part of the arm, and each link of the "Kinematic chain" view, whose rounded bar's label area holds "Link 6" and its length and mass. An app test holds both.
  - **The command line** lists three samples or more as English does: "a, b and c".
- 2026-10-26 (P1, W64): **Processes and state machines** (`process`).
  - **A nesting relation type of its own**, "is part of" (`process.is-part-of`), since pools, lanes, subprocesses and states hold contents and the package needs no other one. Its limits name only the containers.
  - **Triggers and kinds are data without defaults.** An event's `trigger` takes `none`, `message`, `timer` or `signal`, and a task's `kind` `user`, `service` or `manual`, each offered as choices and written in the shape's detail. No appearance chooses its image by an attribute's value, so the package ships icons for message, timer and signal, and an element shows its trigger's icon through an appearance of its own, as the sample's events do. An image that follows an attribute's value would need a new ADR.
  - **Symbols write their names beside them.** Events, gateways, data objects and stores, and the initial and final states and choices keep their proportions, in a box 96 tall that holds the symbol and a label area 48 tall: under the symbol, or over it for gateways and choices, whose paths leave from below. Their connection points sit on the symbol's middle line, left and right, and on the side the name leaves free, so that no line crosses a name. Tasks and states write their names inside them. Pools, lanes and subprocesses stretch to their contents, as containers do, and write their names in their headers; so does a state that holds states.
  - **One stroke, so thick lines are contours set close.** Free geometry has the canvas's stroke only, 1.5 canvas units. An end event's thick ring, an initial state's dot and a final state's dot are circles at most 1 apart, and an intermediate event's inner ring, a gateway's mark and a data store's bands are holes narrower than that stroke: the stroke covers them at a shape's own size, and they show as fine stripes only on a shape stretched to well over it.
  - **Colors** follow the other starter packages: events green, red and amber, work blue, gateways yellow, data violet and states teal, each stroke at 4.5:1 or more on its fill and on the light canvas, and the trigger icons in one grey that reads at 3:1 on every event's fill and on both canvases.
  - **The sample**, `examples/order-process`, plays an order that ships through its exclusive gateway, as a scenario without decisions. When ADR 0078's decisions land, the gateway becomes a decision whose alternatives are the paths "yes" and "no", which the model already holds.
