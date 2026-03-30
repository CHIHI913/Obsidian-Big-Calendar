import momentLib from 'moment';

// Obsidian re-exports moment as a named export
export const moment = momentLib;

// Also export as default-like for compatibility
export default { moment: momentLib };

export class App {}
export class TFile {
  path = '';
  basename = '';
}
export class Vault {}
export class Plugin {}
export class PluginSettingTab {}
export class Notice {}
export class Modal {}
export class Setting {}
