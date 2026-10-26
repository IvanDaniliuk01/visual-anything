import { describe, expect, it } from 'vitest';
import { fileKindOf } from './kinds';

describe('fileKindOf', () => {
  it('reads the kind of each project file from its extension', () => {
    expect(fileKindOf('project.vaproject')).toBe('project');
    expect(fileKindOf('model.vamodel')).toBe('model');
    expect(fileKindOf('packages/systems.vapackage')).toBe('package');
    expect(fileKindOf('views/system-overview.vaview')).toBe('view');
    expect(fileKindOf('scenarios/patient-books-appointment.vascenario')).toBe('scenario');
    expect(fileKindOf('tours/how-booking-works.vatour')).toBe('tour');
    expect(fileKindOf('comments/booking-api-k3f9q2.vacomment')).toBe('comment');
  });

  it('returns undefined for any other file', () => {
    expect(fileKindOf('README.md')).toBeUndefined();
    expect(fileKindOf('model.vamodel.bak')).toBeUndefined();
    expect(fileKindOf('model.json')).toBeUndefined();
  });
});
