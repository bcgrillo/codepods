import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextField } from './TextField';

describe('TextField', () => {
  it('renders the label and input with the value', () => {
    render(<TextField label="Name" value="foo" onChange={() => {}} />);
    expect(screen.getByLabelText('Name')).toHaveValue('foo');
  });

  it('calls onChange with the new value', () => {
    const onChange = vi.fn();
    render(<TextField label="Name" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'bar' } });
    expect(onChange).toHaveBeenCalledWith('bar');
  });
});
