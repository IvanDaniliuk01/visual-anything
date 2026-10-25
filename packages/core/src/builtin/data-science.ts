/**
 * The built-in "Data science pipelines" starter package (R38): where data comes from, the steps that
 * transform it, the features kept for models, the models trained on them and the dashboards people
 * read; data feeds each step, and trains each model. Its icons are drawn for Visual Anything
 * (ADR 0047).
 *
 * Once projects use these ids, they change only by additions: built-in packages have no versions yet
 * (ADR 0018).
 */
import type { PackageFile } from '@visual-anything/schema';
import { OWN_CREDITS } from './credits';
import {
  DASHBOARD_ICON,
  FEATURE_STORE_ICON,
  MODEL_ICON,
  SOURCE_ICON,
  TRANSFORM_ICON,
} from './icons';

export const DATA_SCIENCE: PackageFile = {
  id: 'data-science',
  name: 'Data science pipelines',
  description:
    'Sources, transforms, feature stores, models and dashboards, and how data feeds them and trains models.',
  ...OWN_CREDITS,
  components: [
    {
      id: 'data-science.source',
      name: 'Source',
      derivesFrom: 'essence',
      description:
        'Where data comes from, such as a database, an API, files or a stream of events.',
      attributes: [
        {
          name: 'system',
          type: 'string',
          description: 'What holds it, such as "PostgreSQL", "Kafka" or "S3".',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#DDF3E6',
        stroke: '#1B6B3F',
        width: 176,
        height: 72,
        detail: { attributes: ['system'] },
        image: { image: SOURCE_ICON.id },
      },
    },
    {
      id: 'data-science.transform',
      name: 'Transform',
      derivesFrom: 'essence',
      description: 'A step that cleans, joins or reshapes data into other data.',
      attributes: [
        {
          name: 'engine',
          type: 'string',
          description: 'What runs it, such as "dbt", "Spark" or "pandas".',
        },
        {
          name: 'schedule',
          type: 'string',
          description: 'When it runs, such as "hourly" or "on every event".',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#FFF0D4',
        stroke: '#865400',
        width: 176,
        height: 72,
        detail: { attributes: ['engine'] },
        image: { image: TRANSFORM_ICON.id },
      },
    },
    {
      id: 'data-science.feature-store',
      name: 'Feature store',
      derivesFrom: 'essence',
      description:
        'A store of features, computed once and served alike to training and to predictions.',
      attributes: [{ name: 'engine', type: 'string', description: 'Such as "Feast" or "Tecton".' }],
      appearance: {
        shape: 'cylinder',
        fill: '#EBE4FB',
        stroke: '#5A3A9C',
        width: 176,
        height: 80,
        detail: { attributes: ['engine'] },
        image: { image: FEATURE_STORE_ICON.id },
      },
    },
    {
      id: 'data-science.model',
      name: 'Model',
      derivesFrom: 'essence',
      description: 'A model trained on data, which predicts, classifies or generates.',
      attributes: [
        {
          name: 'framework',
          type: 'string',
          description: 'What it is built with, such as "PyTorch" or "scikit-learn".',
        },
        { name: 'metric', type: 'string', description: 'How it is judged, such as "AUC 0.91".' },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#FCE4EE',
        stroke: '#8C1F4D',
        width: 176,
        height: 72,
        detail: { attributes: ['framework'] },
        image: { image: MODEL_ICON.id },
      },
    },
    {
      id: 'data-science.dashboard',
      name: 'Dashboard',
      derivesFrom: 'essence',
      description: 'Where people read the results: charts, tables and alerts.',
      attributes: [
        {
          name: 'tool',
          type: 'string',
          description: 'Such as "Superset", "Grafana" or "Streamlit".',
        },
      ],
      appearance: {
        shape: 'rectangle',
        fill: '#DDF2F0',
        stroke: '#0D6B60',
        width: 176,
        height: 72,
        detail: { attributes: ['tool'] },
        image: { image: DASHBOARD_ICON.id },
      },
    },
  ],
  relationTypes: [
    {
      id: 'data-science.feeds',
      name: 'feeds',
      derivesFrom: 'relates-to',
      description: 'Passes data on to the next step.',
      direction: 'directed',
      attributes: [
        { name: 'format', type: 'string', description: 'Such as "Parquet", "JSON" or "Avro".' },
      ],
      appearance: { stroke: '#3D4651', width: 2 },
    },
    {
      id: 'data-science.trains',
      name: 'trains',
      derivesFrom: 'relates-to',
      description: 'Gives a model the data it learns from.',
      direction: 'directed',
      appearance: { stroke: '#5A3A9C', width: 2, dash: 'dashed' },
      limits: { to: ['data-science.model'] },
    },
  ],
  images: [SOURCE_ICON, TRANSFORM_ICON, FEATURE_STORE_ICON, MODEL_ICON, DASHBOARD_ICON],
};
