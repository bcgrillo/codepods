import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectableCard } from './SelectableCard';

describe('SelectableCard', () => {
  it('renders icon and content, and shows selection styling when selected', () => {
    render(
      <SelectableCard selected onClick={() => {}} icon={<span>ICON</span>}>
        <span>Content</span>
      </SelectableCard>,
    );
    expect(screen.getByText('ICON')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('triggers onClick', async () => {
    const onClick = vi.fn();
    render(<SelectableCard selected={false} onClick={onClick} icon={<span>ICON</span>} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('hides content when collapsed and dims when disabled', () => {
    const { rerender } = render(
      <SelectableCard selected={false} onClick={() => {}} collapsed icon={<span>ICON</span>}>
        <span>Content</span>
      </SelectableCard>,
    );
    expect(screen.queryByText('Content')).not.toBeInTheDocument();

    rerender(
      <SelectableCard selected={false} disabled onClick={() => {}} icon={<span>ICON</span>}>
        <span>Content</span>
      </SelectableCard>,
    );
    expect(screen.getByRole('button').className).toContain('opacity-60');
  });
});
