import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the message', () => {
    render(<EmptyState message="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  it('renders the icon when provided', () => {
    render(<EmptyState message="Empty" icon={<span data-testid="icon" />} />);
    expect(screen.getByTestId('icon')).toBeTruthy();
  });

  it('applies the default list padding when no className given', () => {
    render(<EmptyState message="Empty" />);
    expect(screen.getByText('Empty').closest('div')).toHaveClass('px-4 py-4');
  });
});
