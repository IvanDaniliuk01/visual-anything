/** The recipe for draw.io: shapes and arrows become the model, each page a view with its positions. */
import type { Recipe } from './recipe';

const INPUT = `<mxfile>
  <diagram name="Checkout">
    <mxGraphModel>
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="shop" value="Shop" style="swimlane;html=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="420" height="200" as="geometry" />
        </mxCell>
        <mxCell id="api" value="&lt;b&gt;Checkout&lt;/b&gt; API" style="rounded=1;html=1;" vertex="1" parent="shop">
          <mxGeometry x="20" y="60" width="160" height="60" as="geometry" />
        </mxCell>
        <mxCell id="db" value="Orders DB" style="shape=cylinder3;html=1;" vertex="1" parent="shop">
          <mxGeometry x="240" y="50" width="140" height="80" as="geometry" />
        </mxCell>
        <mxCell id="e1" value="writes" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="shop" source="api" target="db">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="help" value="Runbook" style="text;html=1;" vertex="1" parent="1" link="https://wiki.example.com/runbook">
          <mxGeometry x="40" y="260" width="120" height="30" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;

export const DRAWIO: Recipe = {
  name: 'build_from_drawio',
  material: 'draw.io diagrams',
  title: 'Build from draw.io',
  description:
    'Build a model and views from draw.io XML: shapes, the shapes they sit in, arrows, and each page as a view with its positions.',
  read: [
    'draw.io keeps its XML in `.drawio` files, and inside `.drawio.svg` and `.drawio.png` ones; the person can also export it (File, Export as, XML). When a `<diagram>` holds a line of encoded text instead of an `<mxGraphModel>`, it is compressed: ask the person to save it uncompressed (File, Properties, clear Compressed) rather than decoding it.',
    'Each `<diagram name="…">` is a page. Every `mxCell` has an `id` and a `parent`: cells `0` and `1` are the page and its first layer; a cell with `vertex="1"` is a shape, and one with `edge="1"` an arrow from its `source` to its `target`.',
    'A `value` is a label. With `html=1` in the style it is HTML: keep its text only, with the tags taken out and the entities read (`&lt;b&gt;Checkout&lt;/b&gt; API` is "Checkout API"). Never keep markup.',
  ],
  mapping: [
    {
      from: 'A shape (`vertex="1"`)',
      to: 'an element named by its label, of the component its style says: `shape=cylinder` or `cylinder3`, or a database icon (`mxgraph.aws4.rds`, `mxgraph.azure.sql_database`), is a `systems.database`; `shape=umlActor` or a person icon a `systems.person`; a bucket or blob icon a `systems.object-storage`; a compute icon (`mxgraph.aws4.lambda_function`) or a box that runs a `systems.service`; a plain box the material says no more about a `systems.box`. Ask about styles you cannot read',
    },
    {
      from: 'A shape whose `parent` is another shape, or a `swimlane`, `group` or `container=1` shape holding others',
      to: 'a container: what it holds sits inside it, through `systems.is-part-of`. A `group` with no label of its own is not an element: what it holds sits in the container it sits in',
    },
    {
      from: 'An arrow (`edge="1"`)',
      to: 'a relation from its `source` to its `target`, labelled by its `value` or by a child cell with an `edgeLabel` style: `systems.writes-to` or `systems.reads-from` when the target is a database and the label says so, otherwise `systems.communicates-with`, a protocol as `protocol` and any other label as the name',
    },
    {
      from: '`mxGeometry` `x`, `y`, `width` and `height`',
      to: 'the shape’s position in the page’s view, relative to the shape it sits in, as Visual Anything keeps positions: give them in add_to_model’s `positions`, left unpinned so that layout may still move them, pinned only when the person wants the drawing kept exactly',
    },
    {
      from: 'An arrow’s points (`<Array as="points">`)',
      to: 'bend points, only when the person wants the drawing’s routes kept (set_route)',
    },
    {
      from: '`fillColor` and `strokeColor`',
      to: 'the element’s appearance, `fill` and `stroke` as #RRGGBB, only when the person wants the drawing’s colors',
    },
    {
      from: 'A text cell (a `text` style)',
      to: 'a note in the view (add_free_shape), not an element',
    },
  ],
  views: [
    'One view per page, named by the page, with the perspective it shows (ask when it is unclear), arranged by `systems.is-part-of`. Create it before add_to_model, so that `positions` can name it.',
  ],
  scenarios: [
    'A drawing holds no sequence, but numbered arrows ("1. …", "2. …") can be one: offer a scenario in their order.',
  ],
  unmatched: [
    '`link` and `tooltip` attributes, and the web addresses of `UserObject` cells: Visual Anything keeps none.',
    'Arrows without a `source` or a `target`.',
    'Layers other than the first, `placeholders`, and plugin data: ask about them.',
    'Images: offer add_image, when the person gives you the picture itself.',
  ],
  example: {
    file: 'docs/checkout.drawio',
    input: INPUT,
    calls: [
      { tool: 'get_project', why: 'See what the project uses and holds.', args: {} },
      {
        tool: 'create_view',
        why: 'The page, as a view, made first so that the positions can name it.',
        args: {
          name: 'Checkout',
          perspective: { name: 'Data flow', description: 'The checkout as the drawing shows it.' },
          nestingRelationTypes: ['systems.is-part-of'],
        },
        as: 'checkout',
      },
      {
        tool: 'add_to_model',
        why: 'The swimlane holds the API and the database, at the drawing’s places relative to it; the label’s HTML is read as plain text.',
        args: {
          label: 'Import the checkout from docs/checkout.drawio',
          elements: [
            {
              ref: 'shop',
              component: 'systems.system',
              name: 'Shop',
              positions: [{ view: '<id of checkout>', x: 40, y: 40, width: 420, height: 200 }],
            },
            {
              ref: 'api',
              component: 'systems.service',
              name: 'Checkout API',
              inside: ['shop'],
              positions: [
                {
                  view: '<id of checkout>',
                  inside: 'shop',
                  x: 20,
                  y: 60,
                  width: 160,
                  height: 60,
                },
              ],
            },
            {
              ref: 'db',
              component: 'systems.database',
              name: 'Orders DB',
              inside: ['shop'],
              positions: [
                {
                  view: '<id of checkout>',
                  inside: 'shop',
                  x: 240,
                  y: 50,
                  width: 140,
                  height: 80,
                },
              ],
            },
          ],
          relations: [{ relationType: 'systems.writes-to', from: 'api', to: 'db' }],
        },
      },
      {
        tool: 'add_free_shape',
        why: 'The text cell, as a note where it was.',
        args: {
          view: '<id of checkout>',
          shape: { kind: 'note', x: 40, y: 260, width: 120, height: 30, text: 'Runbook' },
        },
      },
    ],
    leftOut: [
      {
        quote: 'link="https://wiki.example.com/runbook"',
        why: 'a web address, which Visual Anything never keeps',
      },
    ],
  },
};
