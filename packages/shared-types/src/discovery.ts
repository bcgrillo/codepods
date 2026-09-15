import type { ImageTemplateManifestService, ManifestCommand } from './image-template';

/**
 * A template discovered from a central templates repository.
 *
 * Discovered templates are NOT persisted to the database — they are listed on
 * the fly from the cached repo. Only when the user materializes one (e.g. by
 * compiling/building it) does the backend create a persistent record.
 */
export interface DiscoveredTemplate {
  /** Folder name inside the repo (stable id for the discovery listing). */
  slug: string;
  repoUrl: string;
  /** Folder path inside the repo, e.g. `claude`. */
  repoPath: string;
  branch: string;
  displayName: string;
  description: string;
  icon: string | null;
  iconDark: string | null;
  workspacePath: string | null;
  services: ImageTemplateManifestService[];
  commands: ManifestCommand[];
}

/**
 * An AI provider discovered from a central providers repository.
 *
 * Discovered providers are shown in the "new provider" flow as marketplace
 * options. Selecting one pre-fills data (base url, display name, icon) and
 * shows the description + API key link. They are only persisted to the DB when
 * the user actually creates a provider from them.
 */
export interface DiscoveredProvider {
  /** Folder name inside the repo (stable id). */
  slug: string;
  repoUrl: string;
  repoPath: string;
  branch: string;
  displayName: string;
  description: string;
  icon: string | null;
  iconDark: string | null;
  baseUrl: string;
  docUrl: string | null;
}
