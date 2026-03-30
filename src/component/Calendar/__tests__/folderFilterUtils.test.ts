import {buildFolderToggles, computeEnabledPaths, FolderToggle} from '../folderFilterUtils';

describe('buildFolderToggles', () => {
  it('should create daily-logs toggle and single Projects toggle', () => {
    const result = buildFolderToggles('daily-logs', [
      {path: 'projects/fy2025-4q/01-08_it_industry', color: '#ff0000'},
      {path: 'projects/fy2025-4q/01-26_user-interview', color: '#00ff00'},
      {path: 'projects/fy2025-4q/03-06_interview-prep-script'},
    ]);

    expect(result).toHaveLength(2);

    // Daily logs toggle
    expect(result[0].label).toBe('daily-logs');
    expect(result[0].path).toBe('daily-logs');
    expect(result[0].enabled).toBe(true);

    // Projects toggle (grouped)
    expect(result[1].label).toBe('Projects');
    expect(result[1].path).toBe(
      'projects/fy2025-4q/01-08_it_industry,projects/fy2025-4q/01-26_user-interview,projects/fy2025-4q/03-06_interview-prep-script',
    );
    expect(result[1].color).toBe('#80d0ff');
    expect(result[1].enabled).toBe(true);
  });

  it('should return only daily-logs when no extra folders', () => {
    const result = buildFolderToggles('daily-logs', []);

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('daily-logs');
  });

  it('should return only Projects when no daily notes path', () => {
    const result = buildFolderToggles(null, [
      {path: 'projects/fy2025-4q/01-08_it_industry'},
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Projects');
  });

  it('should return empty when no folders at all', () => {
    const result = buildFolderToggles(null, []);
    expect(result).toHaveLength(0);
  });

  it('should use last segment of daily note path as label', () => {
    const result = buildFolderToggles('some/nested/daily-logs', []);

    expect(result[0].label).toBe('daily-logs');
  });
});

describe('computeEnabledPaths', () => {
  const baseFolders: FolderToggle[] = [
    {path: 'daily-logs', label: 'daily-logs', color: 'blue', enabled: true},
    {
      path: 'projects/a,projects/b,projects/c',
      label: 'Projects',
      color: '#80d0ff',
      enabled: true,
    },
  ];

  it('should return empty array when all folders are enabled (toggle then toggle back)', () => {
    // Toggle daily-logs off, then back on → all enabled → empty
    const result = computeEnabledPaths(baseFolders, 0);
    // After toggling index 0: daily-logs=false, Projects=true → not all enabled
    expect(result).not.toEqual([]);
  });

  it('should return only Projects paths when daily-logs is toggled off', () => {
    const result = computeEnabledPaths(baseFolders, 0);

    // daily-logs toggled off → only Projects paths
    expect(result).toEqual(['projects/a', 'projects/b', 'projects/c']);
    expect(result).not.toContain('daily-logs');
  });

  it('should return only daily-logs when Projects is toggled off', () => {
    const result = computeEnabledPaths(baseFolders, 1);

    expect(result).toEqual(['daily-logs']);
  });

  it('should return empty array when re-enabling makes all enabled', () => {
    // Start with daily-logs disabled
    const withDailyOff: FolderToggle[] = [
      {...baseFolders[0], enabled: false},
      baseFolders[1],
    ];

    // Toggle daily-logs back on → all enabled → empty (show everything)
    const result = computeEnabledPaths(withDailyOff, 0);
    expect(result).toEqual([]);
  });

  it('should expand comma-separated paths in Projects toggle', () => {
    const folders: FolderToggle[] = [
      {path: 'daily-logs', label: 'daily-logs', color: 'blue', enabled: true},
      {path: 'a/1,b/2,c/3', label: 'Projects', color: '#80d0ff', enabled: true},
    ];

    // Toggle daily-logs off
    const result = computeEnabledPaths(folders, 0);
    expect(result).toEqual(['a/1', 'b/2', 'c/3']);
  });
});
