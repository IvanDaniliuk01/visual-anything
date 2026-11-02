/**
 * The icons of the built-in "Healthcare" package (ADR 0079): drawn for Visual Anything as plain shapes
 * on a 24-unit grid with a 2-unit stroke, each in one colour that reads on its component's fill in both
 * themes, and stored as the core's cleaner writes them, so that cleaning them again changes nothing.
 * The kinds of clinical record share the record's blue. Tests check all of this.
 */
import type { SvgImage } from '@visual-anything/schema';
import { OWN_LICENSE, OWN_SOURCE } from './credits';

/** An icon of this package, in the cleaned SVG text given. */
function icon(id: string, name: string, svg: string): SvgImage {
  return {
    kind: 'svg',
    id: `healthcare.${id}`,
    name,
    source: OWN_SOURCE,
    license: OWN_LICENSE,
    width: 24,
    height: 24,
    svg,
  };
}

/** A person, with a cross on their chest: someone cared for. */
export const PATIENT_ICON = icon(
  'patient-icon',
  'Patient',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="6.5" fill="none" r="3.5" stroke="#C75A2A" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" fill="none" stroke="#C75A2A" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M12 15.5v4M10 17.5h4" fill="none" stroke="#C75A2A" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A day on a calendar, with a cross on it: a visit. */
export const ENCOUNTER_ICON = icon(
  'encounter-icon',
  'Encounter',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="16" rx="2" stroke="#3B73C4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="18" x="3" y="5"/><path d="M8 3v4M16 3v4M3 10h18" fill="none" stroke="#3B73C4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M12 13v5M9.5 15.5h5" fill="none" stroke="#3B73C4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A cross in a heart: care given. */
export const PROVIDER_ICON = icon(
  'provider-icon',
  'Provider',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 20s-8-4.5-8-10.5A4.5 4.5 0 0 1 12 6.5a4.5 4.5 0 0 1 8 3C20 15.5 12 20 12 20Z" fill="none" stroke="#66727F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M12 9.5v5M9.5 12h5" fill="none" stroke="#66727F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A stethoscope: its ear tubes, its tube and its chest piece. */
export const PRACTITIONER_ICON = icon(
  'practitioner-icon',
  'Practitioner',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 3v5a5 5 0 0 0 10 0V3" fill="none" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M10 13v2a5 5 0 0 0 10 0v-2" fill="none" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="20" cy="11" fill="none" r="2" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A building with a cross over its door: a clinic or a hospital. */
export const PROVIDER_ORGANIZATION_ICON = icon(
  'provider-organization-icon',
  'Provider organization',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M2 21h20" fill="none" stroke="#66727F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M12 6.5v5M9.5 9h5" fill="none" stroke="#66727F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M10 21v-4h4v4" fill="none" stroke="#66727F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A shield with a cross: who covers the cost of care. */
export const PAYER_ICON = icon(
  'payer-icon',
  'Payer',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z" fill="none" stroke="#7A5BC4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M12 9v6M9 12h6" fill="none" stroke="#7A5BC4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A member’s card, with its band and its number. */
export const PLAN_ICON = icon(
  'plan-icon',
  'Plan',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="14" rx="2" stroke="#B83F72" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="20" x="2" y="5"/><path d="M2 10h20M6 15h4M14 15h4" fill="none" stroke="#B83F72" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A page with its corner folded and its lines: a bill sent for payment. */
export const CLAIM_ICON = icon(
  'claim-icon',
  'Claim',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" fill="none" stroke="#A86A00" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M14 3v5h5M9 13h6M9 17h6" fill="none" stroke="#A86A00" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A seal with a check mark: approved before care. */
export const AUTHORIZATION_ICON = icon(
  'authorization-icon',
  'Authorization',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 20l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2Z" fill="none" stroke="#5E7F16" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M8.5 11l2.5 2.5 4.5-5" fill="none" stroke="#5E7F16" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A magnifying glass over lines: a close review. */
export const AUDIT_ICON = icon(
  'audit-icon',
  'Audit',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="10.5" cy="10.5" fill="none" r="6.5" stroke="#66727F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M15.5 15.5L21 21M8 9h5M8 12h4" fill="none" stroke="#66727F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A flag on its pole: something marked for attention. */
export const AUDIT_FINDING_ICON = icon(
  'audit-finding-icon',
  'Audit finding',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 21V4M5 4h12l-2.5 4.5L17 13H5" fill="none" stroke="#C24A3A" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A clipboard with a list of checks. */
export const CARE_PLAN_ICON = icon(
  'care-plan-icon',
  'Care plan',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="17" rx="2" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="14" x="5" y="4"/><rect fill="none" height="4" rx="1" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="6" x="9" y="2"/><path d="M8.5 11.5l1.5 1.5 2.5-2.5M14 12h2M8.5 16.5l1.5 1.5 2.5-2.5M14 17h2" fill="none" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A page with a pulse across it: something written in a patient’s chart. */
export const CLINICAL_RECORD_ICON = icon(
  'clinical-record-icon',
  'Clinical record',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="18" rx="2" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="16" x="4" y="3"/><path d="M7 12h2.5l1.5-3 2 6 1.5-3H17" fill="none" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A thermometer: something measured. */
export const OBSERVATION_ICON = icon(
  'observation-icon',
  'Observation',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0Z" fill="none" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M12 9v8" fill="none" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A heart with its beat cut short: a problem of health. */
export const CONDITION_ICON = icon(
  'condition-icon',
  'Condition',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 20s-8-4.5-8-10.5A4.5 4.5 0 0 1 12 6.5a4.5 4.5 0 0 1 8 3C20 15.5 12 20 12 20Z" fill="none" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M7 12h3l1-2 2 4 1-2h3" fill="none" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A scalpel: its handle and its blade. */
export const PROCEDURE_ICON = icon(
  'procedure-icon',
  'Procedure',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 21l8-8" fill="none" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M11 13l3-3 7-7c0 5-3 9-7 10Z" fill="none" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A capsule, across its two halves. */
export const MEDICATION_ICON = icon(
  'medication-icon',
  'Medication',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7Z" fill="none" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M7 7l7 7" fill="none" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);
