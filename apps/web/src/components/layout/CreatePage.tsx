import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface CreatePageProps {
  title: string;
  description?: string;
  onBack: () => void;
  children: React.ReactNode;
}

/**
 * Content-area page shell used to render create flows (templates, providers,
 * agents, workspaces) as full pages instead of modal overlays. Matches the
 * visual language of the detail pages (h-12 header bar + scrollable body).
 */
export function CreatePage({ title, description, onBack, children }: CreatePageProps) {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-border px-4">
        <button
          type="button"
          onClick={onBack}
          title="Back"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary-soft"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
