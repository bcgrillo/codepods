import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DangerConfirmField } from './DangerConfirmField';

describe('DangerConfirmField', () => {
  it('renders the prompt and placeholder', () => {
    render(<DangerConfirmField label="Type my-agent to confirm" value="" onChange={() => {}} placeholder="my-agent" />);
    expect(screen.getByText('Type my-agent to confirm')).toBeTruthy();
    expect(screen.getByPlaceholderText('my-agent')).toBeTruthy();
  });

  it('emits the typed value', () => {
    const onChange = vi.fn();
    render(<DangerConfirmField label="Confirm" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my-agent' } });
    expect(onChange).toHaveBeenCalledWith('my-agent');
  });

  it('uses the destructive focus ring', () => {
    render(<DangerConfirmField label="Confirm" value="" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveClass('focus:border-destructive');
  });
});
