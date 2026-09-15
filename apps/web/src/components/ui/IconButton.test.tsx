import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('fires onClick and shows the title', () => {
    const onClick = vi.fn();
    render(<IconButton onClick={onClick} icon={<span>X</span>} title="Close" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Close');
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and does not fire onClick while loading', () => {
    const onClick = vi.fn();
    render(<IconButton onClick={onClick} loading icon={<span>X</span>} title="Close" />);
    expect(screen.getByRole('button')).toBeDisabled();
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
