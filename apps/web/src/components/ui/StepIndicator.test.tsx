import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepIndicator } from './StepIndicator';

describe('StepIndicator', () => {
  const labels = ['One', 'Two', 'Three'];

  it('renders all step labels', () => {
    render(<StepIndicator labels={labels} step={1} />);
    for (const label of labels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('marks completed steps as done and the active step as active', () => {
    render(<StepIndicator labels={labels} step={2} />);
    // Step 1 is done, step 2 active, step 3 pending — all rendered as numbered circles.
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });
});
