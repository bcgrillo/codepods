import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SaveButton } from './SaveButton';

describe('SaveButton', () => {
  it('is disabled and muted when not dirty', () => {
    render(<SaveButton onSave={() => {}} dirty={false} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is enabled when dirty and fires onSave', () => {
    const onSave = vi.fn();
    render(<SaveButton onSave={onSave} dirty />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('shows the saved label when saved', () => {
    render(<SaveButton onSave={() => {}} dirty saved savedLabel="Saved!" />);
    expect(screen.getByText('Saved!')).toBeTruthy();
  });

  it('is disabled while saving', () => {
    render(<SaveButton onSave={() => {}} dirty saving />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
