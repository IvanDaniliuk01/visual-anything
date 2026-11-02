/**
 * The built-in "Healthcare" package (P5, ADR 0079): patients and the encounters in which providers,
 * people and organizations, care for them; the payers and plans that cover that care, the claims and
 * claim lines that bill it and the authorizations that approve it beforehand; the audits that review
 * claims and records and the findings they make; care plans and their goals; and the clinical records
 * an encounter leaves, observations, conditions, procedures and medications.
 *
 * Its concepts are those any health system shares, as public standards for health data name them; it
 * copies no text or picture of theirs, and no mark names a component. Its icons are drawn for Visual
 * Anything under CC0-1.0. A claim draws its lines as rows, and a care plan its goals, as a table draws
 * its columns (ADR 0023), so that "bills", "is found in" and "measures" end on the exact line or goal.
 * Everything nests by one relation type, "is part of".
 *
 * Once projects use these ids, they change only by additions: built-in packages have no versions yet
 * (ADR 0018).
 */
import type { AttributeDefinition, PackageFile } from '@visual-anything/schema';
import { OWN_CREDITS } from './credits';
import {
  AUDIT_FINDING_ICON,
  AUDIT_ICON,
  AUTHORIZATION_ICON,
  CARE_PLAN_ICON,
  CLAIM_ICON,
  CLINICAL_RECORD_ICON,
  CONDITION_ICON,
  ENCOUNTER_ICON,
  MEDICATION_ICON,
  OBSERVATION_ICON,
  PATIENT_ICON,
  PAYER_ICON,
  PLAN_ICON,
  PRACTITIONER_ICON,
  PROCEDURE_ICON,
  PROVIDER_ICON,
  PROVIDER_ORGANIZATION_ICON,
} from './healthcare-images';

const id = (name: string) => `healthcare.${name}`;

/** What a sum of money is in: the currency of the claim it belongs to, which the package leaves open. */
const AMOUNT: AttributeDefinition = {
  name: 'amount',
  type: 'number',
  description: 'How much it comes to, in the currency of its claim.',
};

/** Where every kind of provider derives from: a person or an organization that gives care. */
const PROVIDERS = [id('provider')];

/** The clinical records, and every kind derived from them. */
const RECORDS = [id('clinical-record')];

export const HEALTHCARE: PackageFile = {
  id: 'healthcare',
  name: 'Healthcare',
  description:
    'Patients, encounters and the providers who care for them; payers and plans, claims and their lines, authorizations, audits and their findings; care plans and their goals; and clinical records.',
  ...OWN_CREDITS,
  components: [
    {
      id: id('patient'),
      name: 'Patient',
      derivesFrom: 'essence',
      description: 'A person who receives care.',
      attributes: [
        {
          name: 'birthYear',
          type: 'number',
          description: 'The year they were born, which is often all a model needs of their age.',
        },
        {
          name: 'recordNumber',
          type: 'string',
          description: 'The number their provider files them under, such as "MRN-000117".',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#FDE4D9',
        stroke: '#9A3412',
        width: 192,
        height: 72,
        image: { image: PATIENT_ICON.id },
      },
    },
    {
      id: id('encounter'),
      name: 'Encounter',
      derivesFrom: 'essence',
      description:
        'A meeting between a patient and their providers in which care is given, such as a visit, an admission or a call; it holds the clinical records it leaves.',
      attributes: [
        {
          name: 'setting',
          type: 'string',
          choices: ['ambulatory', 'emergency', 'inpatient', 'virtual', 'home'],
          description:
            'Where and how it happens: at a clinic, in an emergency room, during a stay in hospital, at a distance, or at home.',
        },
        {
          name: 'date',
          type: 'string',
          description: 'When it happens, or when it starts, such as "2026-03-04".',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#DCEBFF',
        stroke: '#1D4F91',
        width: 208,
        height: 72,
        detail: { attributes: ['date'] },
        image: { image: ENCOUNTER_ICON.id },
      },
    },
    {
      id: id('provider'),
      name: 'Provider',
      derivesFrom: 'essence',
      description: 'Someone who gives care, or bills for it: a person or an organization.',
      appearance: {
        shape: 'rectangle',
        fill: '#E5EAF0',
        stroke: '#334155',
        width: 208,
        height: 72,
        image: { image: PROVIDER_ICON.id },
      },
    },
    {
      id: id('practitioner'),
      name: 'Practitioner',
      derivesFrom: id('provider'),
      description: 'A person who gives care, such as a doctor, a nurse or a therapist.',
      attributes: [
        {
          name: 'specialty',
          type: 'string',
          description: 'What they practice, such as "family medicine" or "radiology".',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#D9F2EC',
        stroke: '#0F6B5C',
        width: 192,
        detail: { attributes: ['specialty'] },
        image: { image: PRACTITIONER_ICON.id },
      },
    },
    {
      id: id('provider-organization'),
      name: 'Provider organization',
      derivesFrom: id('provider'),
      description:
        'An organization that gives care, such as a clinic, a hospital, a laboratory or a pharmacy; it holds the practitioners who work in it.',
      attributes: [
        {
          name: 'kind',
          type: 'string',
          choices: ['clinic', 'hospital', 'laboratory', 'pharmacy', 'imaging center'],
          description: 'What kind of organization it is.',
        },
      ],
      appearance: {
        detail: { attributes: ['kind'] },
        image: { image: PROVIDER_ORGANIZATION_ICON.id },
      },
    },
    {
      id: id('payer'),
      name: 'Payer',
      derivesFrom: 'essence',
      description:
        'Who pays for care on a patient’s behalf, such as an insurer, a health fund or a public program; it holds the plans it offers.',
      attributes: [
        {
          name: 'kind',
          type: 'string',
          choices: ['insurer', 'public program', 'employer plan'],
          description: 'What kind of payer it is.',
        },
      ],
      appearance: {
        shape: 'rectangle',
        fill: '#ECE6FA',
        stroke: '#5B3B9E',
        width: 208,
        height: 72,
        detail: { attributes: ['kind'] },
        image: { image: PAYER_ICON.id },
      },
    },
    {
      id: id('plan'),
      name: 'Plan',
      derivesFrom: 'essence',
      description:
        'What a payer covers and on what terms: the care it pays for, what needs an authorization first, and what the patient pays themselves.',
      attributes: [
        {
          name: 'tier',
          type: 'string',
          description: 'Its tier among the payer’s plans, such as "Basic", "Silver" or "Gold".',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#FCE4EE',
        stroke: '#8C1F4D',
        width: 176,
        height: 72,
        detail: { attributes: ['tier'] },
        image: { image: PLAN_ICON.id },
      },
    },
    {
      id: id('claim'),
      name: 'Claim',
      derivesFrom: 'essence',
      description:
        'A provider’s request to a payer to pay for care given, line by line. It draws its lines as its rows.',
      attributes: [
        {
          name: 'number',
          type: 'string',
          description: 'The number it is filed under, such as "C-1001".',
        },
        {
          name: 'status',
          type: 'string',
          choices: ['draft', 'submitted', 'in review', 'paid', 'partly paid', 'denied'],
          description: 'Where it is: written, sent, being checked, or decided.',
        },
        {
          name: 'total',
          type: 'number',
          description: 'What its lines come to, in its currency.',
        },
      ],
      appearance: {
        shape: 'rectangle',
        fill: '#FDEBCF',
        stroke: '#8A5300',
        width: 256,
        detail: { componentName: false, attributes: ['status'] },
        contentsAsRows: true,
        image: { image: CLAIM_ICON.id },
      },
    },
    {
      id: id('claim-line'),
      name: 'Claim line',
      derivesFrom: 'essence',
      description:
        'One service a claim bills, such as a visit, a test, a procedure or a drug, with its code and its amount.',
      attributes: [
        {
          name: 'code',
          type: 'string',
          description: 'The code the service is billed under, in the coding the payer asks for.',
        },
        {
          name: 'quantity',
          type: 'number',
          description: 'How many of the service it bills.',
        },
        AMOUNT,
      ],
      appearance: {
        shape: 'rectangle',
        fill: '#FFFFFF',
        stroke: '#8A5300',
        width: 224,
        height: 32,
        detail: { componentName: false, attributes: ['amount'] },
      },
    },
    {
      id: id('authorization'),
      name: 'Authorization',
      derivesFrom: 'essence',
      description:
        'A payer’s approval, given before care, that it will pay for a service: how many of it, and until when.',
      attributes: [
        {
          name: 'number',
          type: 'string',
          description: 'The number the payer gave it, which the claim then quotes.',
        },
        {
          name: 'status',
          type: 'string',
          choices: ['requested', 'approved', 'denied', 'expired'],
          description: 'Where it is: asked for, given, refused, or past its date.',
        },
        {
          name: 'quantity',
          type: 'number',
          description: 'How many of the service it approves.',
        },
        {
          name: 'validUntil',
          type: 'string',
          description: 'The last day it can be used, such as "2026-04-30".',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#EAF4D3',
        stroke: '#4A6510',
        width: 208,
        height: 72,
        detail: { attributes: ['status'] },
        image: { image: AUTHORIZATION_ICON.id },
      },
    },
    {
      id: id('audit'),
      name: 'Audit',
      derivesFrom: 'essence',
      description:
        'A review of claims or records against the rules that apply to them, by a payer, a provider or someone on their behalf; it holds the findings it makes.',
      attributes: [
        {
          name: 'timing',
          type: 'string',
          choices: ['prepayment', 'postpayment'],
          description: 'Whether it reviews claims before they are paid, or after.',
        },
        {
          name: 'period',
          type: 'string',
          description: 'The time it covers, such as "April to June 2026".',
        },
      ],
      appearance: {
        shape: 'rectangle',
        fill: '#F1F3F5',
        stroke: '#3E4A57',
        width: 208,
        height: 72,
        detail: { attributes: ['timing'] },
        image: { image: AUDIT_ICON.id },
      },
    },
    {
      id: id('audit-finding'),
      name: 'Audit finding',
      derivesFrom: 'essence',
      description:
        'Something an audit finds wrong or missing, such as a service billed without the authorization it needs.',
      attributes: [
        {
          name: 'severity',
          type: 'string',
          choices: ['low', 'medium', 'high'],
          description: 'How much it matters.',
        },
        {
          ...AMOUNT,
          description: 'How much money it puts in question, in the currency of the claim.',
        },
        {
          name: 'status',
          type: 'string',
          choices: ['open', 'agreed', 'disputed', 'resolved'],
          description:
            'Where it is: just found, accepted or disputed by whom it concerns, or settled.',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#FBE3E1',
        stroke: '#A23B2E',
        width: 208,
        height: 80,
        detail: { attributes: ['severity'] },
        image: { image: AUDIT_FINDING_ICON.id },
      },
    },
    {
      id: id('care-plan'),
      name: 'Care plan',
      derivesFrom: 'essence',
      description:
        'What a patient and their providers mean to do about their health, and the goals it aims at. It draws its goals as its rows.',
      attributes: [
        {
          name: 'status',
          type: 'string',
          choices: ['draft', 'active', 'completed'],
          description: 'Whether it is being written, followed, or done.',
        },
        {
          name: 'period',
          type: 'string',
          description: 'The time it covers, such as "2026".',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#DDF2F0',
        stroke: '#0D6B60',
        width: 288,
        detail: { componentName: false, attributes: ['status'] },
        contentsAsRows: true,
        image: { image: CARE_PLAN_ICON.id },
      },
    },
    {
      id: id('goal'),
      name: 'Goal',
      derivesFrom: 'essence',
      description: 'An outcome a care plan aims at, such as a blood sugar kept under a target.',
      attributes: [
        {
          name: 'target',
          type: 'string',
          description: 'What counts as reaching it, such as "under 7%".',
        },
        {
          name: 'due',
          type: 'string',
          description: 'When it should be reached, such as "2026-09".',
        },
      ],
      appearance: {
        shape: 'rectangle',
        fill: '#FFFFFF',
        stroke: '#0D6B60',
        width: 224,
        height: 32,
        detail: { componentName: false, attributes: ['target'] },
      },
    },
    {
      id: id('clinical-record'),
      name: 'Clinical record',
      derivesFrom: 'essence',
      description:
        'Something written in a patient’s record about their health or their care, as an encounter leaves it.',
      attributes: [
        {
          name: 'date',
          type: 'string',
          description: 'When it was recorded, or when what it records happened.',
        },
        {
          name: 'code',
          type: 'string',
          description: 'The code it is recorded under, in the coding the provider uses.',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#DCE7F5',
        stroke: '#1F4E85',
        width: 192,
        height: 72,
        image: { image: CLINICAL_RECORD_ICON.id },
      },
    },
    {
      id: id('observation'),
      name: 'Observation',
      derivesFrom: id('clinical-record'),
      description:
        'Something measured or seen, such as a blood pressure, a lab result or a pain score.',
      attributes: [
        {
          name: 'value',
          type: 'string',
          description: 'What was measured or seen, with its unit, such as "132/84 mmHg".',
        },
      ],
      appearance: { detail: { attributes: ['value'] }, image: { image: OBSERVATION_ICON.id } },
    },
    {
      id: id('condition'),
      name: 'Condition',
      derivesFrom: id('clinical-record'),
      description: 'A diagnosis or a health problem, such as a torn ligament or diabetes.',
      attributes: [
        {
          name: 'clinicalStatus',
          type: 'string',
          choices: ['suspected', 'active', 'remission', 'resolved'],
          description: 'Whether it is still to be confirmed, present, in remission, or over.',
        },
      ],
      appearance: {
        detail: { attributes: ['clinicalStatus'] },
        image: { image: CONDITION_ICON.id },
      },
    },
    {
      id: id('procedure'),
      name: 'Procedure',
      derivesFrom: id('clinical-record'),
      description: 'Something done for a patient, such as a surgery, a scan or a vaccination.',
      appearance: { detail: { attributes: ['date'] }, image: { image: PROCEDURE_ICON.id } },
    },
    {
      id: id('medication'),
      name: 'Medication',
      derivesFrom: id('clinical-record'),
      description: 'A drug prescribed for a patient or given to them.',
      attributes: [
        {
          name: 'dose',
          type: 'string',
          description: 'How much and how often, such as "500 mg twice a day".',
        },
      ],
      appearance: { detail: { attributes: ['dose'] }, image: { image: MEDICATION_ICON.id } },
    },
  ],
  relationTypes: [
    {
      id: id('treats'),
      name: 'treats',
      derivesFrom: 'relates-to',
      description:
        'Gives care: a provider to a patient, or a procedure or a medication to a condition.',
      direction: 'directed',
      appearance: { stroke: '#0F6B5C', width: 2 },
      limits: {
        from: [...PROVIDERS, id('procedure'), id('medication')],
        to: [id('patient'), id('condition')],
      },
    },
    {
      id: id('is-for'),
      name: 'is for',
      derivesFrom: 'relates-to',
      description:
        'Says which patient an encounter, a claim, an authorization, a care plan or a clinical record is about.',
      direction: 'directed',
      appearance: { stroke: '#9A3412', width: 2, dash: 'dotted' },
      limits: {
        from: [id('encounter'), id('claim'), id('authorization'), id('care-plan'), ...RECORDS],
        to: [id('patient')],
      },
    },
    {
      id: id('is-covered-by'),
      name: 'is covered by',
      derivesFrom: 'relates-to',
      description: 'Has a patient’s care paid for by a plan, or by a payer, as its member.',
      direction: 'directed',
      attributes: [
        {
          name: 'memberId',
          type: 'string',
          description: 'The number the patient is a member under, as their card shows it.',
        },
      ],
      appearance: { stroke: '#8C1F4D', width: 2 },
      limits: { from: [id('patient')], to: [id('plan'), id('payer')] },
    },
    {
      id: id('requests'),
      name: 'requests',
      derivesFrom: 'relates-to',
      description:
        'Asks a payer for an authorization: a provider, before giving the care it covers.',
      direction: 'directed',
      appearance: { stroke: '#4A6510', width: 2, dash: 'dashed' },
      limits: { from: PROVIDERS, to: [id('authorization')] },
    },
    {
      id: id('is-submitted-to'),
      name: 'is submitted to',
      derivesFrom: 'relates-to',
      description:
        'Sends a claim, or the request for an authorization, to the payer that decides it.',
      direction: 'directed',
      attributes: [
        { name: 'date', type: 'string', description: 'When it was sent, such as "2026-03-14".' },
      ],
      appearance: { stroke: '#3D4651', width: 2 },
      limits: { from: [id('claim'), id('authorization')], to: [id('payer')] },
    },
    {
      id: id('authorizes'),
      name: 'authorizes',
      derivesFrom: 'relates-to',
      description:
        'Approves care before it is given: an authorization for a procedure, a medication, an encounter or a claim line.',
      direction: 'directed',
      appearance: { stroke: '#4A6510', width: 2 },
      limits: {
        from: [id('authorization')],
        to: [id('procedure'), id('medication'), id('encounter'), id('claim-line')],
      },
    },
    {
      id: id('bills'),
      name: 'bills',
      derivesFrom: 'relates-to',
      description:
        'Charges for care given: a claim, or one of its lines, for an encounter or a clinical record such as a procedure, a test or a drug.',
      direction: 'directed',
      appearance: { stroke: '#8A5300', width: 2 },
      limits: { from: [id('claim'), id('claim-line')], to: [id('encounter'), ...RECORDS] },
    },
    {
      id: id('pays'),
      name: 'pays',
      derivesFrom: 'relates-to',
      description: 'Pays what a claim, or one of its lines, asks for: a payer, once it decides.',
      direction: 'directed',
      appearance: { stroke: '#5B3B9E', width: 2 },
      limits: { from: [id('payer')], to: [id('claim'), id('claim-line')] },
    },
    {
      id: id('denies'),
      name: 'denies',
      derivesFrom: 'relates-to',
      description:
        'Refuses to pay for a claim or one of its lines, or refuses an authorization: a payer, for a reason it gives.',
      direction: 'directed',
      attributes: [
        {
          name: 'reason',
          type: 'string',
          description: 'Why, as the payer says it, such as "no authorization covers it".',
        },
      ],
      appearance: { stroke: '#A23B2E', width: 2, dash: 'dashed' },
      limits: {
        from: [id('payer')],
        to: [id('claim'), id('claim-line'), id('authorization')],
      },
    },
    {
      id: id('audits'),
      name: 'audits',
      derivesFrom: 'relates-to',
      description:
        'Reviews what an audit covers: claims and their lines, encounters, clinical records, authorizations or a provider’s work.',
      direction: 'directed',
      appearance: { stroke: '#3E4A57', width: 2, dash: 'dashed' },
      limits: {
        from: [id('audit')],
        to: [
          id('claim'),
          id('claim-line'),
          id('encounter'),
          id('authorization'),
          ...PROVIDERS,
          ...RECORDS,
        ],
      },
    },
    {
      id: id('is-found-in'),
      name: 'is found in',
      derivesFrom: 'relates-to',
      description:
        'Points an audit finding at where it was found: a claim or one of its lines, an encounter, a clinical record or an authorization.',
      direction: 'directed',
      appearance: { stroke: '#A23B2E', width: 2 },
      limits: {
        from: [id('audit-finding')],
        to: [id('claim'), id('claim-line'), id('encounter'), id('authorization'), ...RECORDS],
      },
    },
    {
      id: id('addresses'),
      name: 'addresses',
      derivesFrom: 'relates-to',
      description: 'Aims a care plan, or one of its goals, at a condition.',
      direction: 'directed',
      appearance: { stroke: '#0D6B60', width: 2, dash: 'dashed' },
      limits: { from: [id('care-plan'), id('goal')], to: [id('condition')] },
    },
    {
      id: id('measures'),
      name: 'measures',
      derivesFrom: 'relates-to',
      description:
        'Tells how a goal or a condition is going: an observation, as a blood sugar reading does for a diabetes goal.',
      direction: 'directed',
      appearance: { stroke: '#1F4E85', width: 2, dash: 'dashed' },
      limits: { from: [id('observation')], to: [id('goal'), id('condition')] },
    },
    {
      id: id('is-part-of'),
      name: 'is part of',
      derivesFrom: 'relates-to',
      description:
        'Places a practitioner in their organization, a plan or an audit in its payer, a line in its claim, a finding in its audit, a goal in its care plan, or a clinical record in its encounter.',
      direction: 'directed',
      nests: true,
      limits: {
        to: [
          id('provider-organization'),
          id('payer'),
          id('claim'),
          id('audit'),
          id('care-plan'),
          id('encounter'),
        ],
      },
    },
  ],
  images: [
    PATIENT_ICON,
    ENCOUNTER_ICON,
    PROVIDER_ICON,
    PRACTITIONER_ICON,
    PROVIDER_ORGANIZATION_ICON,
    PAYER_ICON,
    PLAN_ICON,
    CLAIM_ICON,
    AUTHORIZATION_ICON,
    AUDIT_ICON,
    AUDIT_FINDING_ICON,
    CARE_PLAN_ICON,
    CLINICAL_RECORD_ICON,
    OBSERVATION_ICON,
    CONDITION_ICON,
    PROCEDURE_ICON,
    MEDICATION_ICON,
  ],
};
