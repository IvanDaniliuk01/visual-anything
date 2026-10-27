/** The Motion and Fades preferences in the tours panel (ADR 0077, ADR 0032). */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { appliedPreferences, resetPreferencesForTests } from '../theme/store';
import { MotionPreferences } from './MotionPreferences';

afterEach(() => {
  resetPreferencesForTests();
});

describe('MotionPreferences', () => {
  it('follows the system and fades by default', () => {
    render(<MotionPreferences />);
    expect(screen.getByRole('radio', { name: 'As the system says (full now)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Fades' })).toBeChecked();
  });

  it('applies a choice of Motion and of Fades in the tab at once', () => {
    render(<MotionPreferences />);
    fireEvent.click(screen.getByRole('radio', { name: 'Reduced' }));
    expect(appliedPreferences().preferences.motion).toBe('reduced');
    expect(screen.getByRole('radio', { name: 'Reduced' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Full' }));
    expect(appliedPreferences().preferences.motion).toBe('full');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fades' }));
    expect(appliedPreferences().preferences.fades).toBe(false);
    expect(screen.getByRole('checkbox', { name: 'Fades' })).not.toBeChecked();
  });
});
