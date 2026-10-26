/**
 * The built-in "Machine learning" package (P1, ADR 0079): how a model is built and trained. Datasets
 * and their splits, the tensors that flow through a model, layers of each kind, blocks of layers and
 * the models they make up, and the losses, optimizers, metrics and training runs that train and judge
 * them. It sits beside "Data science pipelines", which describes the data around a model: its Model
 * derives from theirs, so that one model is both the end of a pipeline and an architecture.
 *
 * Layers anchor to the named parts of two drawings with parts (ADR 0067), a Transformer block and a
 * small convolutional network; tensors, losses, optimizers, metrics and training runs have outlines of
 * their own (ADR 0066). Its pictures are drawn for Visual Anything and are CC0-1.0 (ADR 0047).
 *
 * Once projects use these ids, they change only by additions: built-in packages have no versions yet
 * (ADR 0018).
 */
import type { AttributeDefinition, Component, PackageFile } from '@visual-anything/schema';
import { OWN_CREDITS } from './credits';
import {
  ATTENTION_LAYER_ICON,
  BLOCK_ICON,
  CNN_DRAWING,
  CONVOLUTION_LAYER_ICON,
  DATASET_ICON,
  DENSE_LAYER_ICON,
  EMBEDDING_LAYER_ICON,
  LAYER_ICON,
  LOSS_ICON,
  METRIC_ICON,
  MODEL_ICON,
  NORMALIZATION_LAYER_ICON,
  OPTIMIZER_ICON,
  POOLING_LAYER_ICON,
  RECURRENT_LAYER_ICON,
  TENSOR_ICON,
  TRAINING_RUN_ICON,
  TRANSFORMER_DRAWING,
} from './machine-learning-pictures';

export {
  CNN_DRAWING,
  CNN_PARTS,
  TRANSFORMER_DRAWING,
  TRANSFORMER_PARTS,
} from './machine-learning-pictures';

/** Which share of a dataset is meant: what a model learns from, is tuned on, or is judged on. */
const SPLITS = ['train', 'validation', 'test'];

const SPLIT: AttributeDefinition = {
  name: 'split',
  type: 'string',
  choices: SPLITS,
  description:
    'Which share of the data: "train" to learn from, "validation" to tune on, "test" to judge on.',
};

const PARAMETERS: AttributeDefinition = {
  name: 'parameters',
  type: 'number',
  description: 'How many numbers it learns, its weights and biases.',
};

/** The size and the look of a layer: a rounded rectangle with its kind's icon and colours. */
function layer(
  id: string,
  name: string,
  description: string,
  colors: { fill: string; stroke: string },
  icon: string,
  attributes: AttributeDefinition[],
  detail: string[],
): Component {
  return {
    id: `machine-learning.${id}`,
    name,
    derivesFrom: 'machine-learning.layer',
    description,
    attributes,
    appearance: {
      ...colors,
      detail: { attributes: detail },
      image: { image: icon },
    },
  };
}

export const MACHINE_LEARNING: PackageFile = {
  id: 'machine-learning',
  name: 'Machine learning',
  description:
    'Datasets, tensors, layers, blocks and models, and the losses, optimizers, metrics and training runs that train them: how a model is built and how data flows through it.',
  ...OWN_CREDITS,
  components: [
    {
      id: 'machine-learning.dataset',
      name: 'Dataset',
      derivesFrom: 'essence',
      description:
        'The records a model learns from, is tuned on or is judged on: one share of the data.',
      attributes: [
        SPLIT,
        { name: 'rows', type: 'number', description: 'How many records it holds.' },
        {
          name: 'format',
          type: 'string',
          description: 'How it is stored, such as "Parquet", "TFRecord" or "CSV".',
        },
      ],
      appearance: {
        shape: 'cylinder',
        fill: '#DAF3FB',
        stroke: '#16627C',
        width: 176,
        height: 80,
        detail: { attributes: ['split', 'rows'] },
        image: { image: DATASET_ICON.id },
      },
    },
    {
      id: 'machine-learning.tensor',
      name: 'Tensor',
      derivesFrom: 'essence',
      description:
        'Numbers held along several axes, such as a batch of inputs or what a layer gives the next.',
      attributes: [
        {
          name: 'shape',
          type: 'string',
          description: 'Its size along each axis, such as "[batch, 512]".',
        },
        {
          name: 'dtype',
          type: 'string',
          description: 'The type of its numbers, such as "float32", "bfloat16" or "int64".',
        },
      ],
      appearance: {
        fill: '#DDE1F8',
        stroke: '#2E3D9E',
        width: 176,
        height: 72,
        detail: { attributes: ['shape', 'dtype'] },
        image: { image: TENSOR_ICON.id },
        // A box seen from above and to the right, as tensors are drawn.
        geometry: {
          width: 176,
          height: 72,
          outline: [{ kind: 'polygon', points: '0,16 16,0 176,0 176,56 160,72 0,72' }],
          label: { x: 8, y: 20, width: 144, height: 48 },
        },
      },
    },
    {
      id: 'machine-learning.layer',
      name: 'Layer',
      derivesFrom: 'essence',
      description:
        'One step of a neural network, which turns the tensor it is given into another. Each kind of layer derives from it.',
      attributes: [
        {
          name: 'kind',
          type: 'string',
          description:
            'What its framework calls it, such as "Linear", "Conv2d" or "MultiheadAttention".',
        },
        PARAMETERS,
        {
          name: 'activation',
          type: 'string',
          description: 'The function applied to what it gives, such as "ReLU", "GELU" or "none".',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#E2EAF3',
        stroke: '#415979',
        width: 176,
        height: 72,
        detail: { attributes: ['kind'] },
        image: { image: LAYER_ICON.id },
      },
    },
    layer(
      'dense-layer',
      'Dense layer',
      'A layer in which every output is a weighted sum of every input, also called fully connected or linear.',
      { fill: '#DAEBFB', stroke: '#1B5998' },
      DENSE_LAYER_ICON.id,
      [{ name: 'units', type: 'number', description: 'How many outputs it gives.' }],
      ['units', 'activation'],
    ),
    layer(
      'convolution-layer',
      'Convolution layer',
      'A layer that slides small learned kernels over its input, as over the pixels of a picture or the steps of a signal.',
      { fill: '#DBFAF6', stroke: '#16695E' },
      CONVOLUTION_LAYER_ICON.id,
      [
        { name: 'filters', type: 'number', description: 'How many kernels it learns.' },
        { name: 'kernel', type: 'string', description: 'The size of each kernel, such as "3×3".' },
      ],
      ['kernel', 'filters'],
    ),
    layer(
      'attention-layer',
      'Attention layer',
      'A layer in which each position of its input weighs every other, as a Transformer does.',
      { fill: '#FDE9D8', stroke: '#8B470B' },
      ATTENTION_LAYER_ICON.id,
      [{ name: 'heads', type: 'number', description: 'How many heads attend side by side.' }],
      ['heads'],
    ),
    layer(
      'embedding-layer',
      'Embedding layer',
      'A layer that turns each token, word or category into a vector of numbers it learns.',
      { fill: '#F3DEF7', stroke: '#833193' },
      EMBEDDING_LAYER_ICON.id,
      [
        {
          name: 'dimensions',
          type: 'number',
          description: 'How many numbers each vector holds.',
        },
      ],
      ['dimensions'],
    ),
    layer(
      'normalization-layer',
      'Normalization layer',
      'A layer that brings the values it is given to one scale, which keeps training steady.',
      { fill: '#FDF6D8', stroke: '#715C09' },
      NORMALIZATION_LAYER_ICON.id,
      [
        {
          name: 'method',
          type: 'string',
          description: 'Which normalization, such as "layer", "batch" or "RMS".',
        },
      ],
      ['method'],
    ),
    layer(
      'recurrent-layer',
      'Recurrent layer',
      'A layer that reads a sequence one step at a time, carrying a state from each step to the next.',
      { fill: '#E2F7DE', stroke: '#2C6923' },
      RECURRENT_LAYER_ICON.id,
      [{ name: 'cell', type: 'string', description: 'Its cell, such as "LSTM" or "GRU".' }],
      ['cell'],
    ),
    layer(
      'pooling-layer',
      'Pooling layer',
      'A layer that takes each region of its input down to one value, such as its largest or its average.',
      { fill: '#F3F8DD', stroke: '#56651D' },
      POOLING_LAYER_ICON.id,
      [
        {
          name: 'operation',
          type: 'string',
          description: 'How each region is taken down, such as "max" or "average".',
        },
      ],
      ['operation'],
    ),
    {
      id: 'machine-learning.block',
      name: 'Block',
      derivesFrom: 'essence',
      description:
        'Layers that work as one and are often repeated, such as a residual block or a Transformer block.',
      attributes: [
        {
          name: 'repeats',
          type: 'number',
          description: 'How many times the model repeats it, one copy after another.',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#E5E6F0',
        stroke: '#525475',
        width: 240,
        height: 160,
        detail: { attributes: ['repeats'] },
        image: { image: BLOCK_ICON.id },
      },
    },
    {
      id: 'machine-learning.transformer-block',
      name: 'Transformer block',
      derivesFrom: 'machine-learning.block',
      description:
        'A block of multi-head attention and a feed-forward network, each added back to its input and normalized, drawn with its parts: the layers inside it are drawn as them.',
      appearance: {
        image: { image: TRANSFORMER_DRAWING.id, placement: 'parts' },
      },
    },
    {
      id: 'machine-learning.model',
      name: 'Model',
      derivesFrom: 'data-science.model',
      description:
        'A model as it is built: the blocks and layers it is made of, and how many numbers it learns.',
      attributes: [PARAMETERS],
      appearance: {
        detail: { attributes: ['framework', 'parameters'] },
        image: { image: MODEL_ICON.id },
      },
    },
    {
      id: 'machine-learning.convolutional-network',
      name: 'Convolutional network',
      derivesFrom: 'machine-learning.model',
      description:
        'A small convolutional network for pictures, drawn with its parts: two convolutions with a pooling between them, then flatten, dense and softmax. The layers inside it are drawn as them.',
      appearance: {
        image: { image: CNN_DRAWING.id, placement: 'parts' },
      },
    },
    {
      id: 'machine-learning.loss',
      name: 'Loss',
      derivesFrom: 'essence',
      description:
        'How far a model’s outputs are from what they should be, which training brings down, such as cross-entropy.',
      appearance: {
        fill: '#FBDCDA',
        stroke: '#A0251C',
        width: 176,
        height: 80,
        image: { image: LOSS_ICON.id },
        // A bowl: the valley that training goes down.
        geometry: {
          width: 176,
          height: 80,
          outline: [{ kind: 'path', d: 'M0 0H176V48C132 88 44 88 0 48Z' }],
          label: { x: 8, y: 4, width: 160, height: 52 },
        },
      },
    },
    {
      id: 'machine-learning.optimizer',
      name: 'Optimizer',
      derivesFrom: 'essence',
      description:
        'How a model’s parameters are changed at each step of training, such as SGD or AdamW.',
      attributes: [
        {
          name: 'learningRate',
          type: 'number',
          description: 'How large its steps are, such as 0.001.',
        },
      ],
      appearance: {
        fill: '#DDF8EA',
        stroke: '#1E6941',
        width: 176,
        height: 72,
        detail: { attributes: ['learningRate'] },
        image: { image: OPTIMIZER_ICON.id },
        geometry: {
          width: 176,
          height: 72,
          outline: [{ kind: 'polygon', points: '24,0 152,0 176,36 152,72 24,72 0,36' }],
          label: { x: 24, y: 4, width: 128, height: 64 },
        },
      },
    },
    {
      id: 'machine-learning.metric',
      name: 'Metric',
      derivesFrom: 'essence',
      description: 'A number that says how well a model does, such as accuracy or AUC.',
      attributes: [
        { name: 'value', type: 'number', description: 'Its value, as last measured.' },
        {
          name: 'higherIsBetter',
          type: 'boolean',
          description:
            'Whether a higher value is better, as for accuracy, or a lower one, as for error.',
        },
      ],
      appearance: {
        fill: '#E7DDF8',
        stroke: '#572E9E',
        width: 176,
        height: 72,
        detail: { attributes: ['value'] },
        image: { image: METRIC_ICON.id },
        // A gauge.
        geometry: {
          width: 176,
          height: 72,
          outline: [{ kind: 'path', d: 'M0 72V60A88 60 0 0 1 176 60V72Z' }],
          label: { x: 24, y: 24, width: 128, height: 44 },
        },
      },
    },
    {
      id: 'machine-learning.training-run',
      name: 'Training run',
      derivesFrom: 'essence',
      description: 'One run of training a model, from its first epoch to its last.',
      attributes: [
        { name: 'epochs', type: 'number', description: 'How many times it goes over the data.' },
        {
          name: 'seed',
          type: 'number',
          description: 'The seed of its random numbers, which lets it be run again alike.',
        },
        {
          name: 'hardware',
          type: 'string',
          description: 'What it runs on, such as "8 × A100" or "a laptop CPU".',
        },
      ],
      appearance: {
        fill: '#E4EDF1',
        stroke: '#455C68',
        width: 176,
        height: 72,
        detail: { attributes: ['epochs', 'hardware'] },
        image: { image: TRAINING_RUN_ICON.id },
        // An arrow forward: a run from its start to its end.
        geometry: {
          width: 176,
          height: 72,
          outline: [{ kind: 'polygon', points: '0,0 148,0 176,36 148,72 0,72' }],
          label: { x: 8, y: 4, width: 140, height: 64 },
        },
      },
    },
  ],
  relationTypes: [
    {
      id: 'machine-learning.flows-into',
      name: 'flows into',
      derivesFrom: 'relates-to',
      description:
        'Passes a tensor, or a batch of data, on to the next step of a model’s computation.',
      direction: 'directed',
      attributes: [
        {
          name: 'shape',
          type: 'string',
          description: 'The shape of what it passes on, such as "[batch, 90, 128]".',
        },
      ],
      appearance: { stroke: '#3D4651', width: 2 },
    },
    {
      id: 'machine-learning.adds-to',
      name: 'adds to',
      derivesFrom: 'machine-learning.flows-into',
      description:
        'Adds its input to what a later step gives, skipping the steps between: a residual connection.',
      appearance: { dash: 'dashed' },
    },
    {
      id: 'machine-learning.is-part-of',
      name: 'is part of',
      derivesFrom: 'relates-to',
      description: 'Places a layer or a tensor in its block or its model, or a block in its model.',
      direction: 'directed',
      nests: true,
      limits: {
        from: ['machine-learning.layer', 'machine-learning.tensor', 'machine-learning.block'],
        to: ['machine-learning.block', 'data-science.model'],
      },
    },
    {
      id: 'machine-learning.trains-on',
      name: 'trains on',
      derivesFrom: 'relates-to',
      description: 'Learns from a dataset, or is tuned or judged on it, as its split says.',
      direction: 'directed',
      attributes: [SPLIT],
      appearance: { stroke: '#16627C', width: 2, dash: 'dashed' },
      limits: {
        from: ['data-science.model', 'machine-learning.training-run'],
        to: ['machine-learning.dataset'],
      },
    },
    {
      id: 'machine-learning.is-measured-by',
      name: 'is measured by',
      derivesFrom: 'relates-to',
      description: 'Is judged by a metric.',
      direction: 'directed',
      appearance: { stroke: '#572E9E', width: 2, dash: 'dotted' },
      limits: {
        from: ['data-science.model', 'machine-learning.training-run'],
        to: ['machine-learning.metric'],
      },
    },
    {
      id: 'machine-learning.minimizes',
      name: 'minimizes',
      derivesFrom: 'relates-to',
      description: 'Brings a loss down as it trains.',
      direction: 'directed',
      appearance: { stroke: '#A0251C', width: 2, dash: 'dotted' },
      limits: {
        from: ['data-science.model', 'machine-learning.optimizer', 'machine-learning.training-run'],
        to: ['machine-learning.loss'],
      },
    },
    {
      id: 'machine-learning.updates',
      name: 'updates',
      derivesFrom: 'relates-to',
      description:
        'Changes the parameters of a model, a block or a layer: an optimizer at each step, a training run as a whole.',
      direction: 'directed',
      appearance: { stroke: '#1E6941', width: 2, dash: 'dashed' },
      limits: {
        from: ['machine-learning.optimizer', 'machine-learning.training-run'],
        to: ['data-science.model', 'machine-learning.block', 'machine-learning.layer'],
      },
    },
  ],
  images: [
    DATASET_ICON,
    TENSOR_ICON,
    LAYER_ICON,
    DENSE_LAYER_ICON,
    CONVOLUTION_LAYER_ICON,
    ATTENTION_LAYER_ICON,
    EMBEDDING_LAYER_ICON,
    NORMALIZATION_LAYER_ICON,
    RECURRENT_LAYER_ICON,
    POOLING_LAYER_ICON,
    BLOCK_ICON,
    MODEL_ICON,
    LOSS_ICON,
    OPTIMIZER_ICON,
    METRIC_ICON,
    TRAINING_RUN_ICON,
    TRANSFORMER_DRAWING,
    CNN_DRAWING,
  ],
};
