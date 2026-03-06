import {Plugin, Notice, Platform, FileView} from 'obsidian';
import {BigCalendar} from './bigCalendar';
import {CALENDAR_VIEW_TYPE} from './constants';
import addIcons from './obComponents/customIcons';
import {BigCalendarSettingTab, DEFAULT_SETTINGS, BigCalendarSettings} from './setting';
import {t} from './translations/helper';
import {fileService, eventService, globalService} from './services';

export default class BigCalendarPlugin extends Plugin {
  public settings: BigCalendarSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
    globalService.setPluginSetting(this.settings);

    this.app.workspace.onLayoutReady(() => {
      fileService.setApp(this.app);
      fileService.initAllFiles();
      globalService.refreshDynamicFolders(this.app);
      eventService.fetchAllEvents(this.app);

      this.registerEvent(
        this.app.metadataCache.on('changed', (file) => {
          const rules = this.settings.DynamicFolderRules ?? [];
          const isRelevant = rules.some((rule) => file.path.startsWith(rule.basePath + '/'));
          if (isRelevant) {
            globalService.refreshDynamicFolders(this.app);
            eventService.fetchAllEvents(this.app);
          }
        }),
      );
    });

    // Register view and add icons
    this.registerView(CALENDAR_VIEW_TYPE, (leaf) => new BigCalendar(leaf, this));
    addIcons();

    // Add ribbon icon
    this.addRibbonIcon('changeTaskStatus', 'Big Calendar', () => {
      new Notice(t('Open big calendar successfully'));
      this.openCalendar();
    });

    // Add command
    this.addCommand({
      id: 'open-big-calendar',
      name: t('Open big calendar'),
      callback: () => this.openCalendar(),
      hotkeys: [],
    });

    // Add settings tab
    this.addSettingTab(new BigCalendarSettingTab(this.app, this));
  }

  public async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Migrate ExtraFolders from old string[] format to new {path, color}[] format
    if (this.settings.ExtraFolders && this.settings.ExtraFolders.length > 0) {
      const needsMigration = this.settings.ExtraFolders.some((item: any) => typeof item === 'string');
      if (needsMigration) {
        this.settings.ExtraFolders = (this.settings.ExtraFolders as any[]).map((item: any) =>
          typeof item === 'string' ? {path: item, color: '#80d0ff'} : item,
        );
        await this.saveData(this.settings);
      }
    }

    // Migrate DynamicFolderRules
    if (!this.settings.DynamicFolderRules) {
      this.settings.DynamicFolderRules = [];
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    globalService.setPluginSetting(this.settings);
    globalService.refreshDynamicFolders(this.app);
    eventService.fetchAllEvents(this.app);
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(CALENDAR_VIEW_TYPE);
    new Notice(t('Close big calendar successfully'));
  }

  async openCalendar(): Promise<void> {
    const workspace = this.app.workspace;
    workspace.detachLeavesOfType(CALENDAR_VIEW_TYPE);

    const leaf = workspace.getLeaf(
      !Platform.isMobile && workspace.activeLeaf && workspace.activeLeaf.view instanceof FileView,
    );

    await leaf.setViewState({type: CALENDAR_VIEW_TYPE});
    workspace.revealLeaf(leaf);
  }
}
