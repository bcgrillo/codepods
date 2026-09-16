import React from 'react';

interface StepIndicatorProps {
  labels: string[];
  step: number;
}

/**
 * Horizontal wizard step indicator. Highlights the current step and marks
 * completed steps as done. Shared by the agent and workspace create flows.
 */
export function StepIndicator({ labels, step }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      {labels.map((label, idx) => {
        const stepNum = idx + 1;
        const active = step === stepNum;
        const done = step > stepNum;
        return (
          <React.Fragment key={label}>
            <div className="flex items-center gap-1.5">
              <span
                className={
                  active
                    ? 'flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-white'
                    : done
                      ? 'flex h-5 w-5 items-center justify-center rounded-full bg-primary/30 text-[10px] font-medium text-primary-soft'
                      : 'flex h-5 w-5 items-center justify-center rounded-full bg-secondary-item text-[10px] font-medium text-muted-foreground'
                }
              >
                {stepNum}
              </span>
              <span className={active ? 'text-xs text-foreground' : 'text-xs text-muted-foreground'}>{label}</span>
            </div>
            {idx < labels.length - 1 && <div className="h-px flex-1 bg-secondary-item" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}
