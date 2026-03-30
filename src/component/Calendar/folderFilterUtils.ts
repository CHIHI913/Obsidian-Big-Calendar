export interface FolderToggle {
  path: string;
  label: string;
  color: string;
  enabled: boolean;
}

export interface ExtraFolder {
  path: string;
  color?: string;
}

/**
 * Build folder toggle list from daily note path and extra folders.
 * Extra folders are grouped into a single "Projects" toggle.
 */
export function buildFolderToggles(
  dailyNotePath: string | null,
  effectiveFolders: ExtraFolder[],
): FolderToggle[] {
  const toggles: FolderToggle[] = [];

  if (dailyNotePath) {
    toggles.push({
      path: dailyNotePath,
      label: dailyNotePath.split('/').pop() || dailyNotePath,
      color: 'var(--interactive-accent)',
      enabled: true,
    });
  }

  if (effectiveFolders.length > 0) {
    const allPaths = effectiveFolders.map((f) => f.path).join(',');
    toggles.push({
      path: allPaths,
      label: 'Projects',
      color: '#80d0ff',
      enabled: true,
    });
  }

  return toggles;
}

/**
 * Compute the enabled folder paths after toggling a folder.
 * Returns empty array when all folders are enabled (= show everything).
 */
export function computeEnabledPaths(folders: FolderToggle[], toggleIndex: number): string[] {
  const next = folders.map((f, i) => (i === toggleIndex ? {...f, enabled: !f.enabled} : f));

  const allEnabled = next.every((f) => f.enabled);
  if (allEnabled) {
    return [];
  }

  return next.filter((f) => f.enabled).flatMap((f) => f.path.split(','));
}
