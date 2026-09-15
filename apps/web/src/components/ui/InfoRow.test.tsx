import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InfoRow } from './InfoRow';

describe('InfoRow', () => {
  it('renders label and value', () => {
    render(<InfoRow label="Branch" value="main" />);
    expect(screen.getByText('Branch')).toBeTruthy();
    expect(screen.getByText('main')).toBeTruthy();
  });

  it('accepts a custom label width', () => {
    render(<InfoRow label="Branch" value="main" labelWidth="w-16" />);
    expect(screen.getByText('Branch')).toHaveClass('w-16');
  });
});
