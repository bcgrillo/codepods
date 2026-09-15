import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionButton } from './ActionButton';

describe('ActionButton', () => {
  it('renders as a button and triggers onClick', async () => {
    const onClick = vi.fn();
    render(<ActionButton onClick={onClick} icon={<span>I</span>} label="Do" hoverClass="hover:text-zinc-200" />);
    expect(screen.getByTitle('Do')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a spinner when loading', () => {
    render(<ActionButton loading icon={<span>I</span>} label="Do" hoverClass="hover:text-zinc-200" />);
    expect(document.querySelector('svg')).not.toBeNull();
  });

  it('renders as a link when href is set', () => {
    render(<ActionButton href="https://example.com" icon={<span>I</span>} label="Open" hoverClass="hover:text-sky-400" />);
    const link = screen.getByTitle('Open');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'https://example.com');
  });
});
