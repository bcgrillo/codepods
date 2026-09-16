import { useTranslation } from 'react-i18next';
import { Bug, Book, Heart, ExternalLink, Info } from 'lucide-react';
import { ContentShell } from '../ContentShell';
import { CodepodsLogo } from '../icons/CodepodsLogo';

const APP_VERSION = '0.1.0-beta';
const REPO_URL = 'https://github.com/bcgrillo/codepods';
const ISSUES_URL = 'https://github.com/bcgrillo/codepods/issues';
const DOCS_URL = 'https://github.com/bcgrillo/codepods#readme';

export function AboutPage() {
  const { t } = useTranslation();

  return (
    <ContentShell title={t('settings.about')} icon={Info}>
      <div className="absolute inset-0 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-8">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <CodepodsLogo className="h-9 w-9" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">CodePods</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm text-muted-foreground">{t('about.version')}</span>
                <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary-soft border border-primary/30">
                  {APP_VERSION}
                </span>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            {t('about.description')}
          </p>

          {/* Links */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">{t('about.resources')}</h2>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-secondary-item/50"
            >
              <ExternalLink className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t('about.repository')}</p>
                <p className="text-xs text-muted-foreground truncate">{REPO_URL}</p>
              </div>
            </a>
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-secondary-item/50"
            >
              <Bug className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t('about.reportIssue')}</p>
                <p className="text-xs text-muted-foreground">{t('about.reportIssueHint')}</p>
              </div>
            </a>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-secondary-item/50"
            >
              <Book className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t('about.documentation')}</p>
                <p className="text-xs text-muted-foreground">{t('about.documentationHint')}</p>
              </div>
            </a>
          </div>

          {/* Beta notice */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <div className="flex items-start gap-2">
              <Heart className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('about.betaNotice')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </ContentShell>
  );
}