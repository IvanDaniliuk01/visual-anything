/**
 * The pictures of the built-in Machine learning package (P1, ADR 0079), drawn for Visual Anything and
 * dedicated to the public domain (CC0-1.0), stored as the core's cleaner writes them, so that cleaning
 * them again changes nothing:
 * - its icons, plain shapes on the 24-unit grid with 2-unit strokes, as the other built-in icons are,
 *   each in one colour that reads on its component's fill in both themes;
 * - two drawings with parts (ADR 0067): a Transformer block and a small convolutional network, whose
 *   named parts are boxes in the colours of the layers drawn as them, with what no part holds drawn
 *   in one grey that reads on light and dark fills alike, since a picture is drawn as stored in both
 *   themes (ADR 0033).
 *
 * Once projects use these ids, they change only by additions (ADR 0018).
 */
import type { SvgImage } from '@visual-anything/schema';
import { OWN_LICENSE, OWN_SOURCE } from './credits';

/** A picture of the package, in the cleaned SVG text given. */
function picture(id: string, name: string, width: number, height: number, svg: string): SvgImage {
  return {
    kind: 'svg',
    id: `machine-learning.${id}`,
    name,
    source: OWN_SOURCE,
    license: OWN_LICENSE,
    width,
    height,
    svg,
  };
}

/** A table of rows under a header: records kept to learn from or to test on. */
export const DATASET_ICON = picture(
  'dataset-icon',
  'Dataset',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="16" rx="2" stroke="#1D85A7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="18" x="3" y="4"/><path d="M3 9h18M3 14.5h18M9 9v11" fill="none" stroke="#1D85A7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A cube: numbers held along several axes. */
export const TENSOR_ICON = picture(
  'tensor-icon',
  'Tensor',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z" fill="none" stroke="#5B6ACF" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M3.5 7.25L12 12l8.5-4.75M12 12v9.5" fill="none" stroke="#5B6ACF" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A column of three units: one layer of a network. */
export const LAYER_ICON = picture(
  'layer-icon',
  'Layer',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="20" rx="3" stroke="#5879A4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="10" x="7" y="2"/><circle cx="12" cy="7" fill="#5879A4" r="1.75"/><circle cx="12" cy="12" fill="#5879A4" r="1.75"/><circle cx="12" cy="17" fill="#5879A4" r="1.75"/></svg>',
);

/** Three units, each joined to both of the next two: every input reaches every output. */
export const DENSE_LAYER_ICON = picture(
  'dense-layer-icon',
  'Dense layer',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 5l14 3.5M5 5l14 11.5M5 12l14-3.5M5 12l14 4.5M5 19l14-10.5M5 19l14-2.5" fill="none" stroke="#2479CE" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="5" cy="5" fill="#2479CE" r="2.25"/><circle cx="5" cy="12" fill="#2479CE" r="2.25"/><circle cx="5" cy="19" fill="#2479CE" r="2.25"/><circle cx="19" cy="8.5" fill="#2479CE" r="2.25"/><circle cx="19" cy="16.5" fill="#2479CE" r="2.25"/></svg>',
);

/** A small kernel over two maps of features. */
export const CONVOLUTION_LAYER_ICON = picture(
  'convolution-layer-icon',
  'Convolution layer',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" fill="none" stroke="#1E8D7E" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><rect fill="none" height="13" rx="2" stroke="#1E8D7E" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="14" x="3" y="8"/><rect fill="#1E8D7E" height="5" rx="1" width="5" x="6" y="11"/></svg>',
);

/** An eye: what each place in the input attends to. */
export const ATTENTION_LAYER_ICON = picture(
  'attention-layer-icon',
  'Attention layer',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="#BD600F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="12" cy="12" fill="#BD600F" r="3"/></svg>',
);

/** A token turned into a vector of numbers. */
export const EMBEDDING_LAYER_ICON = picture(
  'embedding-layer-icon',
  'Embedding layer',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="#AE49C2" height="6" rx="1" width="6" x="2" y="9"/><path d="M10 12h3M11.5 10.5L13 12l-1.5 1.5" fill="none" stroke="#AE49C2" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><rect fill="none" height="18" rx="2" stroke="#AE49C2" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="6" x="15" y="3"/><path d="M15 9h6M15 15h6" fill="none" stroke="#AE49C2" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A bell curve over its axis: values brought to one scale. */
export const NORMALIZATION_LAYER_ICON = picture(
  'normalization-layer-icon',
  'Normalization layer',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 20h18" fill="none" stroke="#997D0C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M4 19c3.5 0 4.5-13 8-13s4.5 13 8 13" fill="none" stroke="#997D0C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A unit with an arrow that comes back to it: a state carried from one step to the next. */
export const RECURRENT_LAYER_ICON = picture(
  'recurrent-layer-icon',
  'Recurrent layer',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="#3D8F30" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M20 3.5v4h-4" fill="none" stroke="#3D8F30" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="12" cy="12" fill="#3D8F30" r="2.5"/></svg>',
);

/** Four cells taken down to one. */
export const POOLING_LAYER_ICON = picture(
  'pooling-layer-icon',
  'Pooling layer',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="10" rx="1.5" stroke="#758828" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="10" x="2" y="7"/><path d="M7 7v10M2 12h10" fill="none" stroke="#758828" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M14 9l3 3-3 3" fill="none" stroke="#758828" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><rect fill="#758828" height="4" rx="1" width="4" x="18" y="10"/></svg>',
);

/** Three layers stacked: a block of them, used as one. */
export const BLOCK_ICON = picture(
  'block-icon',
  'Block',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 3l9 4.5-9 4.5-9-4.5z" fill="none" stroke="#6F729B" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M3 12l9 4.5 9-4.5" fill="none" stroke="#6F729B" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M3 16.5l9 4.5 9-4.5" fill="none" stroke="#6F729B" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A frame holding a small network: a model made of layers. */
export const MODEL_ICON = picture(
  'model-icon',
  'Model',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="19" rx="3" stroke="#B83F72" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="19" x="2.5" y="2.5"/><path d="M8 8l8 4-8 4" fill="none" stroke="#B83F72" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="8" cy="8" fill="#B83F72" r="2"/><circle cx="8" cy="16" fill="#B83F72" r="2"/><circle cx="16" cy="12" fill="#B83F72" r="2"/></svg>',
);

/** A curve falling over its axes: the error that training brings down. */
export const LOSS_ICON = picture(
  'loss-icon',
  'Loss',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 3v17h17" fill="none" stroke="#D93428" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M7 5c1.5 6 3.5 10.5 13 11" fill="none" stroke="#D93428" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** Steps down the contours of a valley to its lowest point. */
export const OPTIMIZER_ICON = picture(
  'optimizer-icon',
  'Optimizer',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="13" fill="none" rx="10" ry="7" stroke="#298E58" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><ellipse cx="12" cy="13" fill="none" rx="4.5" ry="3" stroke="#298E58" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M4 4l2.5 4.5 3-1 2.5 5.5" fill="none" stroke="#298E58" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="12" cy="13" fill="#298E58" r="1.5"/></svg>',
);

/** A gauge and its needle. */
export const METRIC_ICON = picture(
  'metric-icon',
  'Metric',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 17a9 9 0 0 1 18 0" fill="none" stroke="#8459CF" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M12 17l4.5-5.5" fill="none" stroke="#8459CF" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="12" cy="17" fill="#8459CF" r="2"/><path d="M3 21h18" fill="none" stroke="#8459CF" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** Play inside a circle: a run that goes round its epochs. */
export const TRAINING_RUN_ICON = picture(
  'training-run-icon',
  'Training run',
  24,
  24,
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" fill="none" r="9.5" stroke="#5E7D8D" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M10 8v8l6-4z" fill="#5E7D8D"/></svg>',
);

/** The ids of the Transformer block's named parts, in the order it draws them, which is upward. */
export const TRANSFORMER_PARTS = [
  'output',
  'add-norm-2',
  'feed-forward',
  'add-norm-1',
  'multi-head-attention',
  'positional-encoding',
  'input-embedding',
] as const;

/**
 * A Transformer encoder block, drawn upward as "Attention is all you need" draws it: the input
 * embedding and the positional encoding, added together; multi-head attention, fed its queries, keys
 * and values; add and norm; the feed-forward network; add and norm again; and the output. The block's
 * frame, which its layers repeat, the arrows between them, the two residual connections and the sum
 * are drawn but are no parts.
 */
export const TRANSFORMER_DRAWING = picture(
  'transformer-block-drawing',
  'Transformer block',
  360,
  640,
  '<svg viewBox="0 0 360 640" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="400" rx="16" stroke="#747D8C" stroke-dasharray="8 6" stroke-width="2" width="280" x="40" y="88"/><path d="M180 104V74" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M180 64l-5 9h10z" fill="#747D8C"/><path d="M180 184V154" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M180 144l-5 9h10z" fill="#747D8C"/><path d="M180 280V250" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M180 240l-5 9h10z" fill="#747D8C"/><path d="M180 360V330" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M180 320l-5 9h10z" fill="#747D8C"/><path d="M180 524V456M130 456h100M130 456v-22M230 456v-22M180 456v-22" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M130 424l-5 9h10z" fill="#747D8C"/><path d="M180 424l-5 9h10z" fill="#747D8C"/><path d="M230 424l-5 9h10z" fill="#747D8C"/><path d="M180 472H60V300h22" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M90 300l-9-5v10z" fill="#747D8C"/><path d="M180 264H60V124h22" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M90 124l-9-5v10z" fill="#747D8C"/><path d="M180 580v-22" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M180 548l-5 9h10z" fill="#747D8C"/><path d="M144 536h14" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M168 536l-9-5v10z" fill="#747D8C"/><circle cx="180" cy="536" fill="none" r="12" stroke="#747D8C" stroke-width="2"/><path d="M173 536h14M180 529v14" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><rect fill="#DDE1F8" height="48" id="output" rx="8" stroke="#2E3D9E" stroke-width="2" width="180" x="90" y="16"/><rect fill="#FDF6D8" height="40" id="add-norm-2" rx="8" stroke="#715C09" stroke-width="2" width="180" x="90" y="104"/><rect fill="#DAEBFB" height="56" id="feed-forward" rx="8" stroke="#1B5998" stroke-width="2" width="180" x="90" y="184"/><rect fill="#FDF6D8" height="40" id="add-norm-1" rx="8" stroke="#715C09" stroke-width="2" width="180" x="90" y="280"/><rect fill="#FDE9D8" height="64" id="multi-head-attention" rx="8" stroke="#8B470B" stroke-width="2" width="180" x="90" y="360"/><rect fill="#E2EAF3" height="40" id="positional-encoding" rx="8" stroke="#415979" stroke-width="2" width="136" x="8" y="516"/><rect fill="#F3DEF7" height="48" id="input-embedding" rx="8" stroke="#833193" stroke-width="2" width="180" x="90" y="580"/></svg>',
);

/** The ids of the small convolutional network's named parts, in the order it draws them. */
export const CNN_PARTS = ['conv-1', 'pool-1', 'conv-2', 'flatten', 'dense', 'softmax'] as const;

/**
 * A small convolutional network, drawn from left to right as LeNet is: the picture it reads, which is
 * no part; two convolutions, each a stack of maps of features, with a pooling between them; the maps
 * flattened into one column; a dense layer; and the softmax that gives each category's probability.
 */
export const CNN_DRAWING = picture(
  'convolutional-network-drawing',
  'Convolutional network',
  816,
  240,
  '<svg viewBox="0 0 816 240" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="72" rx="2" stroke="#747D8C" stroke-width="2" width="72" x="8" y="84"/><path d="M20 84v72M8 96h72M32 84v72M8 108h72M44 84v72M8 120h72M56 84v72M8 132h72M68 84v72M8 144h72" fill="none" stroke="#747D8C" stroke-width="1"/><path d="M88 120H108" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M116 120l-9-5v10z" fill="#747D8C"/><g id="conv-1"><rect fill="#DBFAF6" height="152" rx="4" stroke="#16695E" stroke-width="2" width="80" x="136" y="36"/><rect fill="#DBFAF6" height="152" rx="4" stroke="#16695E" stroke-width="2" width="80" x="128" y="44"/><rect fill="#DBFAF6" height="152" rx="4" stroke="#16695E" stroke-width="2" width="80" x="120" y="52"/></g><path d="M224 120H244" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M252 120l-9-5v10z" fill="#747D8C"/><g id="pool-1"><rect fill="#F3F8DD" height="104" rx="4" stroke="#56651D" stroke-width="2" width="64" x="268" y="64"/><rect fill="#F3F8DD" height="104" rx="4" stroke="#56651D" stroke-width="2" width="64" x="262" y="70"/><rect fill="#F3F8DD" height="104" rx="4" stroke="#56651D" stroke-width="2" width="64" x="256" y="76"/></g><path d="M340 120H360" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M368 120l-9-5v10z" fill="#747D8C"/><g id="conv-2"><rect fill="#DBFAF6" height="80" rx="4" stroke="#16695E" stroke-width="2" width="56" x="390" y="70"/><rect fill="#DBFAF6" height="80" rx="4" stroke="#16695E" stroke-width="2" width="56" x="384" y="76"/><rect fill="#DBFAF6" height="80" rx="4" stroke="#16695E" stroke-width="2" width="56" x="378" y="82"/><rect fill="#DBFAF6" height="80" rx="4" stroke="#16695E" stroke-width="2" width="56" x="372" y="88"/></g><path d="M456 120H482" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M490 120l-9-5v10z" fill="#747D8C"/><g id="flatten"><rect fill="#E2EAF3" height="176" rx="4" stroke="#415979" stroke-width="2" width="56" x="494" y="32"/><path d="M494 54h56M494 76h56M494 98h56M494 120h56M494 142h56M494 164h56M494 186h56" fill="none" stroke="#415979" stroke-width="1"/></g><path d="M558 120H578" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M586 120l-9-5v10z" fill="#747D8C"/><rect fill="#DAEBFB" height="112" id="dense" rx="8" stroke="#1B5998" stroke-width="2" width="88" x="590" y="64"/><path d="M686 120H706" fill="none" stroke="#747D8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M714 120l-9-5v10z" fill="#747D8C"/><rect fill="#FDF6D8" height="64" id="softmax" rx="8" stroke="#715C09" stroke-width="2" width="88" x="718" y="88"/></svg>',
);
