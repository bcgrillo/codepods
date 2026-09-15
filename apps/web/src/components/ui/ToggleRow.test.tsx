import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToggleRow } from './ToggleRow';

describe('ToggleRow', () => {
  it('renders label, hint and switch', () => {
    render(<ToggleRow label="Git proxy" hint="Routes traffic" checked onChange={() => {}} />);
    expect(screen.getByText('Git proxy')).toBeTruthy();
    expect(screen.getByText('Routes traffic')).toBeTruthy();
    expect(screen.getByRole('switch')).toBeTruthy();
  });

  it('calls onChange when toggled', () => {
    const onChange = vi.fn();
    render(<ToggleRow label="Git proxy" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('renders no hint paragraph when none is given', () => {
    const { container } = render(<ToggleRow label="Git proxy" checked onChange={() => {}} />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('renders the leading slot and is disabled when asked', () => {
    render(<ToggleRow label="Git proxy" leading={<span data-testid="mark" />} checked={false} onChange={() => {}} disabled />);
    expect(screen.getByTestId('mark')).toBeTruthy();
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});
