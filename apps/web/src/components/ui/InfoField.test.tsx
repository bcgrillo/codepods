import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InfoField } from './InfoField';

describe('InfoField', () => {
  it('renders the label and value', () => {
    render(
      <InfoField label="Remote URL">
        <span>git@host:repo</span>
      </InfoField>,
    );
    expect(screen.getByText('Remote URL')).toBeTruthy();
    expect(screen.getByText('git@host:repo')).toBeTruthy();
  });

  it('uses reading typography for read-only values', () => {
    render(
      <InfoField label="Remote URL">
        <span data-testid="value">git@host:repo</span>
      </InfoField>,
    );
    expect(screen.getByTestId('value').parentElement).toHaveClass('text-sm');
  });

  it('keeps control typography while editing', () => {
    render(
      <InfoField label="Remote URL" editing>
        <span data-testid="value">git@host:repo</span>
      </InfoField>,
    );
    expect(screen.getByTestId('value').parentElement).not.toHaveClass('text-sm');
  });
});
