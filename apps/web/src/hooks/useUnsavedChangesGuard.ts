import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Guards against losing unsaved changes.
 *
 * - In-app navigation: intercepts the route transition (useBlocker) and shows a
 *   native window.confirm. Confirming calls proceed() and lets the navigation
 *   continue; cancelling keeps the user on the current page.
 * - Browser close/reload: registers a `beforeunload` handler while `dirty` so
 *   the browser shows its own "leave site?" dialog.
 *
 * Use in any page with editable state (settings, security, agent settings…):
 *
 *   const guard = useUnsavedChangesGuard(dirty, t('settings.unsavedWarning'));
 */
export function useUnsavedChangesGuard(dirty: boolean, message?: string) {
  const { t } = useTranslation();

  const blocker = useBlocker(
    dirty
      ? ({ currentLocation, nextLocation }) =>
          currentLocation.pathname !== nextLocation.pathname
      : false,
  );

  // Browser-level guard (tab close / hard reload).
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Required by some browsers to show the confirmation dialog.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // In-app navigation guard — resolve the blocked transition.
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const text = message ?? t('settings.unsavedWarning');
    if (window.confirm(text)) {
      blocker.proceed?.();
    } else {
      blocker.reset?.();
    }
  }, [blocker, message, t]);
}
