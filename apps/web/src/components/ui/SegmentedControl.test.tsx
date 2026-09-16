import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedControl } from './SegmentedControl';

const options = [
  { value: 'web', label: 'Web' },
  { value: 'terminal', label: 'Terminal' },
] as const;

describe('SegmentedControl', () => {
  it('marks the selected option as pressed', () => {
    render(<SegmentedControl options={[...options]} value="web" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Web' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Terminal' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('emits the clicked option value', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={[...options]} value="web" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    expect(onChange).toHaveBeenCalledWith('terminal');
  });

  it('exposes the group label and disables options', () => {
    render(
      <SegmentedControl
        options={[{ value: 'web', label: 'Web' }, { value: 'terminal', label: 'Terminal', disabled: true }]}
        value="web"
        onChange={() => {}}
        aria-label="Service type"
      />,
    );
    expect(screen.getByRole('group', { name: 'Service type' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Terminal' })).toBeDisabled();
  });

  it('applies the size variant class', () => {
    render(<SegmentedControl options={[...options]} value="web" onChange={() => {}} size="sm" />);
    expect(screen.getByRole('button', { name: 'Web' })).toHaveClass('px-2');
  });
});
