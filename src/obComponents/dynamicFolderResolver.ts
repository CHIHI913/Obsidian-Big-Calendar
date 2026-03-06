import {App, TFolder, TFile} from 'obsidian';
import type {DynamicFolderRule, ExtraFolder} from '@/setting';

// Distinct color palette for auto-assignment
const COLOR_PALETTE = [
  '#80ffb0', // mint
  '#ffb080', // peach
  '#d080ff', // purple
  '#ffdf80', // gold
  '#ff80b0', // pink
  '#80ffd0', // teal
  '#ff8080', // coral
  '#80ff80', // green
  '#ffa0d0', // rose
  '#e0c080', // sand
  '#c0ff80', // lime
  '#ffc0c0', // salmon
];

export function resolveDynamicFolders(app: App, rules: DynamicFolderRule[]): ExtraFolder[] {
  const results: ExtraFolder[] = [];

  for (const rule of rules) {
    if (!rule.isEnabled) continue;

    const baseFolder = app.vault.getFolderByPath(rule.basePath);
    if (!baseFolder) continue;

    let colorIndex = 0;
    const subFolders = collectSubFolders(baseFolder);
    for (const folder of subFolders) {
      const targetFileName = rule.targetFile || 'README.md';
      const targetPath = `${folder.path}/${targetFileName}`;
      const file = app.vault.getFileByPath(targetPath);
      if (!file) continue;

      const cache = app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm) continue;

      const allMatch = rule.conditions.every((cond) => {
        const actual = String(fm[cond.key] ?? '');
        const expected = cond.value;
        if (cond.operator === 'equals') return actual === expected;
        if (cond.operator === 'not_equals') return actual !== expected;
        return false;
      });

      if (allMatch) {
        const color = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
        colorIndex++;
        results.push({path: folder.path, color});
      }
    }
  }

  return results;
}

function collectSubFolders(folder: TFolder): TFolder[] {
  const folders: TFolder[] = [];
  for (const child of folder.children) {
    if (child instanceof TFolder) {
      folders.push(child);
      folders.push(...collectSubFolders(child));
    }
  }
  return folders;
}
