import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field } from './Field';

describe('Field', () => {
  it('renders the label and its control', () => {
    render(
      <Field label="Port">
        <input aria-label="port" />
      </Field>,
    );
    expect(screen.getByText('Port')).toBeTruthy();
    expect(screen.getByLabelText('port')).toBeTruthy();
  });

  it('renders the hint when there is no error', () => {
    render(
      <Field label="Port" hint="1-65535">
        <input />
      </Field>,
    );
    expect(screen.getByText('1-65535')).toBeTruthy();
  });

  it('prefers the error over the hint', () => {
    render(
      <Field label="Port" hint="1-65535" error="Invalid">
        <input />
      </Field>,
    );
    expect(screen.getByText('Invalid')).toHaveClass('text-destructive');
    expect(screen.queryByText('1-65535')).toBeNull();
  });

  it('merges the className onto the wrapper', () => {
    const { container } = render(
      <Field label="Port" className="w-1/2">
        <input />
      </Field>,
    );
    expect(container.firstElementChild).toHaveClass('w-1/2');
  });
});
