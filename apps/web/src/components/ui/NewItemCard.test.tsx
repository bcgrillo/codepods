import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewItemCard } from './NewItemCard';

describe('NewItemCard', () => {
  it('renders label and triggers onClick', async () => {
    const onClick = vi.fn();
    render(<NewItemCard onClick={onClick} label="New thing" />);
    expect(screen.getByText('New thing')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('hides label when collapsed', () => {
    render(<NewItemCard onClick={() => {}} collapsed label="New thing" />);
    expect(screen.queryByText('New thing')).not.toBeInTheDocument();
  });
});
