import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SecondaryList, type SecondaryItem } from './SecondaryList';

const items: SecondaryItem[] = [
  { id: 'a', icon: <span />, label: 'Agent A' },
  { id: 'b', icon: <span />, label: 'Agent B' },
];

describe('SecondaryList context menu', () => {
  it('opens on right-click and executes the action', async () => {
    const onStart = vi.fn();
    render(
      <SecondaryList
        items={items}
        contextMenuActions={(item) => [
          { id: 'start', label: `Start ${item.label}`, onClick: onStart },
        ]}
      />,
    );

    // Right-click the card to open the context menu
    const card = screen.getByText('Agent A');
    fireEvent.contextMenu(card);
    const menuItem = await waitFor(() => screen.getByText('Start Agent A'));
    fireEvent.click(menuItem);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('renders separators and opens href items in a new tab', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <SecondaryList
        items={items}
        contextMenuActions={() => [
          { id: 'open-console', label: 'Open console', href: '/console/a' },
          { id: '__separator__', label: '' },
          { id: 'stop', label: 'Stop', onClick: vi.fn() },
        ]}
      />,
    );

    const card = screen.getByText('Agent A');
    fireEvent.contextMenu(card);
    await waitFor(() => screen.getByText('Open console'));
    fireEvent.click(screen.getByText('Open console'));
    expect(openSpy).toHaveBeenCalledWith('/console/a', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  it('opens the context menu from collapsed (icon-only) buttons', async () => {
    const onStart = vi.fn();
    render(
      <SecondaryList
        collapsed
        items={items}
        contextMenuActions={(item) => [
          { id: 'start', label: `Start ${item.label}`, onClick: onStart },
        ]}
      />,
    );

    // Compact buttons have no label text; find by aria-label-able element or
    // by role. The icon-only button renders the item icon; use getByRole.
    const buttons = screen.getAllByRole('button');
    // Right-click the first card button (Agent A)
    fireEvent.contextMenu(buttons[0]);
    const menuItem = await waitFor(() => screen.getByText('Start Agent A'));
    fireEvent.click(menuItem);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
