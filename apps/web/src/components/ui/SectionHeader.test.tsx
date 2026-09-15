import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionHeader } from './SectionHeader';

describe('SectionHeader', () => {
  it('renders the title for the default (lg) size', () => {
    render(<SectionHeader title="Models" />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Models');
  });

  it('renders the icon for the lg size', () => {
    render(<SectionHeader title="Repos" icon={<span data-testid="icon" />} />);
    expect(screen.getByTestId('icon')).toBeTruthy();
  });

  it('renders the uppercase sm variant', () => {
    render(<SectionHeader size="sm" title="Repo Info" />);
    expect(screen.getByText('Repo Info')).toHaveClass('uppercase');
  });

  it('renders the optional description under the title', () => {
    render(<SectionHeader title="Models" description="Pick one" />);
    expect(screen.getByText('Pick one')).toBeTruthy();
  });

  it('merges the className onto the heading', () => {
    render(<SectionHeader title="X" className="mb-3" />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveClass('mb-3');
  });
});
