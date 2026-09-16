import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToggleSwitch } from './ToggleSwitch';

describe('ToggleSwitch', () => {
  it('renders a switch with the correct title for checked state', () => {
    render(<ToggleSwitch checked onChange={() => {}} labelOn="Enabled" labelOff="Disabled" />);
    expect(screen.getByRole('switch')).toHaveAttribute('title', 'Enabled');
  });

  it('renders the off label when unchecked', () => {
    render(<ToggleSwitch checked={false} onChange={() => {}} labelOn="Enabled" labelOff="Disabled" />);
    expect(screen.getByRole('switch')).toHaveAttribute('title', 'Disabled');
  });

  it('calls onChange when clicked', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('is disabled and does not fire onChange when disabled', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} disabled />);
    const sw = screen.getByRole('switch');
    expect(sw).toBeDisabled();
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });
});