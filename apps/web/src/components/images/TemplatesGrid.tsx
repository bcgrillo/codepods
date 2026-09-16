import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, SwatchBook } from 'lucide-react';
import { useImageTemplates } from '../../hooks/useAgents';
import { useDiscoveredTemplates } from '../../hooks/useCentralRepos';
import { ConfiguredCard, DiscoveredCard, CustomCard } from './TemplateCard';
import type { DiscoveredTemplate, ImageTemplate } from '@codepods/shared-types';

/** Match a discovered template to a configured one by repoUrl + repoPath */
function isMaterialized(dt: DiscoveredTemplate, templates: ImageTemplate[]): boolean {
  return templates.some((t) => t.repoUrl === dt.repoUrl && t.repoPath === dt.repoPath);
}

export function TemplatesGrid() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: templates, isLoading: templatesLoading } = useImageTemplates();
  const { data: discovered, isLoading: discoveredLoading } = useDiscoveredTemplates();

  const loading = templatesLoading || discoveredLoading;

  // Sort configured templates: enabled first, then by name
  const sortedTemplates = useMemo(() => {
    if (!templates) return [];
    return [...templates].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [templates]);

  // Filter discovered: exclude those already materialized
  const availableDiscovered = useMemo(() => {
    if (!discovered || !templates) return [];
    return discovered.filter((dt) => !isMaterialized(dt, templates));
  }, [discovered, templates]);

  const handleSelectTemplate = (template: ImageTemplate) => {
    navigate(`/agents/templates/${encodeURIComponent(template.name)}`);
  };

  const handleEditTemplate = (template: ImageTemplate) => {
    navigate(`/agents/templates/${encodeURIComponent(template.name)}`);
  };

  const handleCreateCustom = () => {
    navigate('/agents/templates/new');
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const totalCards = sortedTemplates.length + availableDiscovered.length + 1;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <SwatchBook className="h-5 w-5 text-primary-soft shrink-0" />
          <h1 className="font-semibold truncate">{t('images.title')}</h1>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{totalCards}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {sortedTemplates.map((template) => (
            <ConfiguredCard
              key={`cfg-${template.id}`}
              template={template}
              onSelect={() => handleSelectTemplate(template)}
              onEdit={() => handleEditTemplate(template)}
            />
          ))}
          {availableDiscovered.map((dt) => (
            <DiscoveredCard
              key={`dsc-${dt.repoUrl}-${dt.repoPath}`}
              discovered={dt}
            />
          ))}
          <CustomCard onClick={handleCreateCustom} />
        </div>
      </div>
    </div>
  );
}