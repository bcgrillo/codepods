import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDeleteButton } from './ConfirmDeleteButton';

describe('ConfirmDeleteButton', () => {
  it('shows the delete title and fires confirm toggle on first click', () => {
    const onToggle = vi.fn();
    render(
      <ConfirmDeleteButton
        onDelete={() => {}}
        confirming={false}
        onConfirmToggle={onToggle}
        deleteTitle="Delete"
        confirmTitle="Confirm"
      />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Delete');
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('fires onDelete on a second click while confirming', () => {
    const onDelete = vi.fn();
    const onToggle = vi.fn();
    render(
      <ConfirmDeleteButton
        onDelete={onDelete}
        confirming
        onConfirmToggle={onToggle}
        deleteTitle="Delete"
        confirmTitle="Confirm"
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('is disabled while pending', () => {
    render(
      <ConfirmDeleteButton onDelete={() => {}} confirming onConfirmToggle={() => {}} pending />,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
