import type { Skill } from '@codepods/shared-types';
import { FileBadge } from 'lucide-react';

interface SkillCardProps {
  skill: Skill;
}

export function SkillCard({ skill }: SkillCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary-item/50 p-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary-item">
        <FileBadge className="h-4 w-4 text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{skill.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {skill.description ?? skill.path ?? '—'}
        </p>
      </div>
    </div>
  );
}