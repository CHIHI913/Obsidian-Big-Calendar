import {App, PluginSettingTab, Setting, Modal} from 'obsidian';
import type BigCalendar from './index';
import {t} from './translations/helper';
import '@/less/setting.less';

export interface ExtraFolder {
  path: string;
  color: string;
}

export interface FrontmatterCondition {
  key: string;
  value: string;
  operator: 'equals' | 'not_equals';
}

export interface DynamicFolderRule {
  id: string;
  name: string;
  basePath: string;
  targetFile: string;
  conditions: FrontmatterCondition[];
  color: string;
  isEnabled: boolean;
}

export interface BigCalendarSettings {
  StartDate: string;
  InsertAfter: string;
  DefaultEventComposition: string;
  ProcessEntriesBelow: string;
  WorkspaceFilters: WorkspaceFilter[];
  DefaultFilterId: string;
  ExtraFolders: ExtraFolder[];
  DynamicFolderRules: DynamicFolderRule[];
  DayStartHour: number;
  DayEndHour: number;
}

export interface WorkspaceFilter {
  id: string;
  name: string;
  eventTypes: string[];
  contentRegex: string;
  folderPaths: string[];
  metadataKeys: string[];
  metadataValues: Record<string, string>;
  isEnabled: boolean;
}

export const DEFAULT_SETTINGS: BigCalendarSettings = {
  StartDate: 'Sunday',
  InsertAfter: '# Journal',
  ProcessEntriesBelow: '',
  DefaultEventComposition: '{TIME} {CONTENT}',
  WorkspaceFilters: [
    {
      id: 'default',
      name: 'Default',
      eventTypes: [],
      contentRegex: '',
      folderPaths: [],
      metadataKeys: [],
      metadataValues: {},
      isEnabled: true,
    },
  ],
  DefaultFilterId: 'default',
  ExtraFolders: [],
  DynamicFolderRules: [],
  DayStartHour: 0,
  DayEndHour: 24,
};

export class BigCalendarSettingTab extends PluginSettingTab {
  plugin: BigCalendar;
  //eslint-disable-next-line
  private applyDebounceTimer: number = 0;

  constructor(app: App, plugin: BigCalendar) {
    super(app, plugin);
    this.plugin = plugin;
  }

  applySettingsUpdate() {
    clearTimeout(this.applyDebounceTimer);
    const plugin = this.plugin;
    this.applyDebounceTimer = window.setTimeout(() => {
      plugin.saveSettings();
    }, 100);
  }

  //eslint-disable-next-line
  async hide() {}

  async display() {
    await this.plugin.loadSettings();

    const {containerEl} = this;
    this.containerEl.empty();

    new Setting(containerEl).setHeading().setName(t('Regular Options'));

    new Setting(containerEl)
      .setName(t('First Day of Week'))
      .setDesc(t('Choose the first day of the week. Sunday is the default.'))
      .addDropdown((dropdown) =>
        dropdown
          .addOption('sunday', t('Sunday'))
          .addOption('monday', t('Monday'))
          .setValue(this.plugin.settings.StartDate)
          .onChange(async (value) => {
            this.plugin.settings.StartDate = value;
            this.applySettingsUpdate();
          }),
      );

    new Setting(containerEl)
      .setName(t('Day Start Hour'))
      .setDesc(t('The earliest hour shown in Week/Day views.'))
      .addDropdown((dropdown) => {
        for (let h = 0; h < 24; h++) {
          dropdown.addOption(String(h), `${h}:00`);
        }
        dropdown
          .setValue(String(this.plugin.settings.DayStartHour ?? 0))
          .onChange(async (value) => {
            this.plugin.settings.DayStartHour = parseInt(value);
            this.applySettingsUpdate();
          });
      });

    new Setting(containerEl)
      .setName(t('Day End Hour'))
      .setDesc(t('The latest hour shown in Week/Day views.'))
      .addDropdown((dropdown) => {
        for (let h = 1; h <= 24; h++) {
          dropdown.addOption(String(h), h === 24 ? '24:00' : `${h}:00`);
        }
        dropdown
          .setValue(String(this.plugin.settings.DayEndHour ?? 24))
          .onChange(async (value) => {
            this.plugin.settings.DayEndHour = parseInt(value);
            this.applySettingsUpdate();
          });
      });

    new Setting(containerEl)
      .setName(t('Insert after heading'))
      .setDesc(
        t('You should set the same heading below if you want to insert and process events below the same heading.'),
      )
      .addText((text) =>
        text
          .setPlaceholder('# JOURNAL')
          .setValue(this.plugin.settings.InsertAfter)
          .onChange(async (value) => {
            this.plugin.settings.InsertAfter = value;
            this.applySettingsUpdate();
          }),
      );

    new Setting(containerEl)
      .setName(t('Process Events below'))
      .setDesc(
        t(
          'Only entries below this string/section in your notes will be processed. If it does not exist no notes will be processed for that file.',
        ),
      )
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.ProcessEntriesBelow)
          .setValue(this.plugin.settings.ProcessEntriesBelow)
          .onChange(async (value) => {
            this.plugin.settings.ProcessEntriesBelow = value;
            this.applySettingsUpdate();
          }),
      );

    // Extra Folders section
    new Setting(containerEl)
      .setHeading()
      .setName(t('Extra Folders'))
      .setDesc(t('Additional folders to collect events from (besides Daily Notes).'));

    this.plugin.settings.ExtraFolders.forEach((folder, index) => {
      new Setting(containerEl)
        .setName(folder.path)
        .addColorPicker((picker) => {
          picker.setValue(folder.color || '#80d0ff').onChange((value) => {
            this.plugin.settings.ExtraFolders[index].color = value;
            this.applySettingsUpdate();
          });
        })
        .addExtraButton((button) => {
          button.setIcon('trash').setTooltip(t('Remove')).onClick(async () => {
            this.plugin.settings.ExtraFolders.splice(index, 1);
            await this.plugin.saveSettings();
            this.display();
          });
        });
    });

    new Setting(containerEl).addButton((button) => {
      button
        .setButtonText(t('Add Folder'))
        .onClick(() => {
          const modal = new ExtraFolderAddModal(this.app, async (folderPath: string) => {
            if (folderPath && !this.plugin.settings.ExtraFolders.some((f) => f.path === folderPath)) {
              this.plugin.settings.ExtraFolders.push({path: folderPath, color: '#80d0ff'});
              await this.plugin.saveSettings();
              this.display();
            }
          });
          modal.open();
        });
    });

    // Dynamic Folder Rules section
    new Setting(containerEl)
      .setHeading()
      .setName(t('Dynamic Folder Rules'))
      .setDesc(t('Automatically include folders based on frontmatter conditions.'));

    (this.plugin.settings.DynamicFolderRules ?? []).forEach((rule, index) => {
      new Setting(containerEl)
        .setName(rule.name || `Rule ${index + 1}`)
        .setDesc(`${rule.basePath} / ${rule.targetFile || 'README.md'}`)
        .addToggle((toggle) => {
          toggle.setValue(rule.isEnabled).onChange((value) => {
            this.plugin.settings.DynamicFolderRules[index].isEnabled = value;
            this.applySettingsUpdate();
          });
        })
        .addExtraButton((button) => {
          button.setIcon('pencil').setTooltip(t('Edit')).onClick(() => {
            const modal = new DynamicRuleEditModal(this.app, rule, async (updated) => {
              this.plugin.settings.DynamicFolderRules[index] = updated;
              await this.plugin.saveSettings();
              this.display();
            });
            modal.open();
          });
        })
        .addExtraButton((button) => {
          button.setIcon('trash').setTooltip(t('Remove')).onClick(async () => {
            this.plugin.settings.DynamicFolderRules.splice(index, 1);
            await this.plugin.saveSettings();
            this.display();
          });
        });
    });

    new Setting(containerEl).addButton((button) => {
      button.setButtonText(t('Add Dynamic Rule')).onClick(() => {
        const newRule: DynamicFolderRule = {
          id: `dynrule-${Date.now()}`,
          name: '',
          basePath: '',
          targetFile: 'README.md',
          conditions: [],
          color: '#80d0ff',
          isEnabled: true,
        };
        const modal = new DynamicRuleEditModal(this.app, newRule, async (rule) => {
          this.plugin.settings.DynamicFolderRules.push(rule);
          await this.plugin.saveSettings();
          this.display();
        });
        modal.open();
      });
    });

    new Setting(containerEl)
      .setHeading()
      .setName(t('Workspace Filters'))
      .addExtraButton((button) =>
        button.setIcon('plus').onClick(() => {
          const newFilter: WorkspaceFilter = {
            id: `filter-${Date.now()}`,
            name: `Filter ${this.plugin.settings.WorkspaceFilters.length}`,
            eventTypes: [],
            contentRegex: '',
            folderPaths: [],
            metadataKeys: [],
            metadataValues: {},
            isEnabled: true,
          };
          this.plugin.settings.WorkspaceFilters.push(newFilter);
          this.applySettingsUpdate();
          this.display();
        }),
      );

    this.plugin.settings.WorkspaceFilters.forEach((filter, index) => {
      const filterSetting = new Setting(containerEl)
        .setName(filter.name)
        .setDesc(t('Configure filter settings'))
        .addExtraButton((button) =>
          button.setIcon('pencil').onClick(() => {
            this.showFilterEditModal(filter, index);
          }),
        )
        .addToggle((toggle) =>
          toggle.setValue(filter.isEnabled).onChange(async (value) => {
            this.plugin.settings.WorkspaceFilters[index].isEnabled = value;
            this.applySettingsUpdate();
          }),
        );

      if (index > 0) {
        filterSetting.addButton((button) =>
          button.setButtonText(t('Delete')).onClick(() => {
            this.plugin.settings.WorkspaceFilters.splice(index, 1);
            this.applySettingsUpdate();
            this.display();
          }),
        );
      }
    });

    new Setting(containerEl)
      .setName(t('Default Filter'))
      .setDesc(t('Choose the default filter to apply when opening the calendar'))
      .addDropdown((dropdown) => {
        this.plugin.settings.WorkspaceFilters.forEach((filter) => {
          dropdown.addOption(filter.id, filter.name);
        });
        dropdown.setValue(this.plugin.settings.DefaultFilterId);
        dropdown.onChange(async (value) => {
          this.plugin.settings.DefaultFilterId = value;
          this.applySettingsUpdate();
        });
      });

    new Setting(containerEl).setHeading().setName(t('Say Thank You'));

    new Setting(containerEl)
      .setName(t('Donate'))
      .setDesc(t('If you like this plugin, consider donating to support continued development:'))
      // .setClass("AT-extra")
      .addButton((bt) => {
        bt.buttonEl.outerHTML = `<a href="https://www.buymeacoffee.com/boninall"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=boninall&button_colour=6495ED&font_colour=ffffff&font_family=Inter&outline_colour=000000&coffee_colour=FFDD00"></a>`;
      });
  }

  private showFilterEditModal(filter: WorkspaceFilter, index: number) {
    const modal = new FilterEditModal(this.app, filter, (updatedFilter: WorkspaceFilter) => {
      // Update the filter in the settings
      this.plugin.settings.WorkspaceFilters[index] = updatedFilter;
      this.applySettingsUpdate();
      this.display();
    });
    modal.open();
  }
}

// Modal for editing filter settings
class FilterEditModal extends Modal {
  private filter: WorkspaceFilter;
  private onSubmit: (filter: WorkspaceFilter) => void;
  private eventTypesEl: HTMLElement;
  private folderPathsEl: HTMLElement;
  private metadataKeysEl: HTMLElement;
  private metadataValuesEl: HTMLElement;

  constructor(app: App, filter: WorkspaceFilter, onSubmit: (filter: WorkspaceFilter) => void) {
    super(app);
    this.filter = {...filter}; // Create a copy to avoid modifying the original
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const {contentEl} = this;
    contentEl.empty();
    contentEl.createEl('h2', {text: t('Edit Filter')});

    // Filter name
    new Setting(contentEl).setName(t('Filter Name')).addText((text) => {
      text.setValue(this.filter.name).onChange((value) => {
        this.filter.name = value;
      });
    });

    // Content Regex
    new Setting(contentEl)
      .setName(t('Content Regex'))
      .setDesc(t('Regular expression to match against event content'))
      .addText((text) => {
        text.setValue(this.filter.contentRegex).onChange((value) => {
          this.filter.contentRegex = value;
        });
      });

    // Event Types
    new Setting(contentEl)
      .setName(t('Event Types'))
      .setDesc(t('Types of events to include in this filter'))
      .addButton((button) => {
        button
          .setIcon('plus')
          .setTooltip(t('Add Event Type'))
          .onClick(() => {
            const input = new Setting(this.eventTypesEl)
              .addText((text) => {
                text.setPlaceholder(t('Enter event type'));
              })
              .addButton((btn) => {
                btn.setButtonText(t('Cancel')).onClick(() => {
                  input.clear();
                  input.settingEl.detach();
                });
              })
              .addButton((btn) => {
                btn.setButtonText(t('Add')).onClick(() => {
                  const value = (input.components[0] as any).inputEl.value;
                  if (value && !this.filter.eventTypes.includes(value)) {
                    this.filter.eventTypes.push(value);
                    this.renderEventTypes();
                  }
                });
              });
          });
      });

    this.eventTypesEl = contentEl.createDiv('event-types-container');
    this.renderEventTypes();

    // Folder Paths
    new Setting(contentEl)
      .setName(t('Folder Paths'))
      .setDesc(t('Folder paths to include in this filter'))
      .addButton((button) => {
        button
          .setIcon('plus')
          .setTooltip(t('Add Folder Path'))
          .onClick(() => {
            const input = new Setting(this.folderPathsEl)
              .addText((text) => {
                text.setPlaceholder(t('Enter folder path'));
              })
              .addButton((btn) => {
                btn.setButtonText(t('Cancel')).onClick(() => {
                  input.clear();
                  input.settingEl.detach();
                });
              })
              .addButton((btn) => {
                btn.setButtonText(t('Add')).onClick(() => {
                  const value = (input.components[0] as any).inputEl.value;
                  if (value && !this.filter.folderPaths.includes(value)) {
                    this.filter.folderPaths.push(value);
                    this.renderFolderPaths();
                  }
                });
              });
          });
      });

    this.folderPathsEl = contentEl.createDiv('folder-paths-container');
    this.renderFolderPaths();

    // Metadata Keys
    new Setting(contentEl)
      .setName(t('Metadata Keys'))
      .setDesc(t('Metadata keys that should exist in the file'))
      .addButton((button) => {
        button
          .setIcon('plus')
          .setTooltip(t('Add Metadata Key'))
          .onClick(() => {
            const input = new Setting(this.metadataKeysEl)
              .addText((text) => {
                text.setPlaceholder(t('Enter metadata key'));
              })
              .addButton((btn) => {
                btn.setButtonText(t('Cancel')).onClick(() => {
                  input.clear();
                  input.settingEl.detach();
                });
              })
              .addButton((btn) => {
                btn.setButtonText(t('Add')).onClick(() => {
                  const value = (input.components[0] as any).inputEl.value;
                  if (value && !this.filter.metadataKeys.includes(value)) {
                    this.filter.metadataKeys.push(value);
                    this.renderMetadataKeys();
                  }
                });
              });
          });
      });

    this.metadataKeysEl = contentEl.createDiv('metadata-keys-container');
    this.renderMetadataKeys();

    // Metadata Values
    new Setting(contentEl)
      .setName(t('Metadata Values'))
      .setDesc(t('Key-value pairs for matching specific metadata values'))
      .addButton((button) => {
        button
          .setIcon('plus')
          .setTooltip(t('Add Metadata Value'))
          .onClick(() => {
            const container = this.metadataValuesEl.createDiv('metadata-value-pair');
            const keyInput = new Setting(container).setName(t('Key')).addText((text) => {
              text.setPlaceholder(t('Enter metadata key'));
            });

            const valueInput = new Setting(container).setName(t('Value')).addText((text) => {
              text.setPlaceholder(t('Enter metadata value'));
            });

            new Setting(container)
              .addButton((btn) => {
                btn.setButtonText(t('Cancel')).onClick(() => {
                  container.remove();
                });
              })
              .addButton((btn) => {
                btn.setButtonText(t('Add')).onClick(() => {
                  const key = (keyInput.components[0] as any).inputEl.value;
                  const value = (valueInput.components[0] as any).inputEl.value;
                  if (key) {
                    this.filter.metadataValues[key] = value;
                    this.renderMetadataValues();
                    container.remove();
                  }
                });
              });
          });
      });

    this.metadataValuesEl = contentEl.createDiv('metadata-values-container');
    this.renderMetadataValues();

    // Save button
    new Setting(contentEl).addButton((button) => {
      button
        .setButtonText(t('Save'))
        .setCta()
        .onClick(() => {
          this.onSubmit(this.filter);
          this.close();
        });
    });
  }

  onClose() {
    const {contentEl} = this;
    contentEl.empty();
  }

  private renderEventTypes() {
    this.eventTypesEl.empty();
    this.filter.eventTypes.forEach((type, index) => {
      new Setting(this.eventTypesEl)
        .setName(type)
        .addButton((btn) => {
          btn.setButtonText(t('Remove')).onClick(() => {
            this.filter.eventTypes.splice(index, 1);
            this.renderEventTypes();
          });
        })
        .addButton((button) => {
          button.setButtonText(t('Remove')).onClick(() => {
            this.filter.eventTypes.splice(index, 1);
            this.renderEventTypes();
          });
        });
    });
  }

  private renderFolderPaths() {
    this.folderPathsEl.empty();
    this.filter.folderPaths.forEach((path, index) => {
      new Setting(this.folderPathsEl).setName(path).addButton((button) => {
        button.setButtonText(t('Remove')).onClick(() => {
          this.filter.folderPaths.splice(index, 1);
          this.renderFolderPaths();
        });
      });
    });
  }

  private renderMetadataKeys() {
    this.metadataKeysEl.empty();
    this.filter.metadataKeys.forEach((key, index) => {
      new Setting(this.metadataKeysEl).setName(key).addButton((button) => {
        button.setButtonText(t('Remove')).onClick(() => {
          this.filter.metadataKeys.splice(index, 1);
          this.renderMetadataKeys();
        });
      });
    });
  }

  private renderMetadataValues() {
    this.metadataValuesEl.empty();
    Object.entries(this.filter.metadataValues).forEach(([key, value]) => {
      new Setting(this.metadataValuesEl).setName(`${key}: ${value}`).addButton((button) => {
        button.setButtonText(t('Remove')).onClick(() => {
          delete this.filter.metadataValues[key];
          this.renderMetadataValues();
        });
      });
    });
  }
}

// Modal for adding an extra folder path
class ExtraFolderAddModal extends Modal {
  private onSubmit: (folderPath: string) => void;

  constructor(app: App, onSubmit: (folderPath: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const {contentEl} = this;
    contentEl.createEl('h2', {text: t('Add Extra Folder')});

    let inputValue = '';
    new Setting(contentEl)
      .setName(t('Folder Path'))
      .setDesc(t('Enter the vault-relative folder path (e.g. "projects")'))
      .addText((text) => {
        text.setPlaceholder('projects').onChange((value) => {
          inputValue = value;
        });
      });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText(t('Cancel')).onClick(() => {
          this.close();
        });
      })
      .addButton((button) => {
        button
          .setButtonText(t('Add'))
          .setCta()
          .onClick(() => {
            if (inputValue.trim()) {
              this.onSubmit(inputValue.trim());
              this.close();
            }
          });
      });
  }

  onClose() {
    const {contentEl} = this;
    contentEl.empty();
  }
}

// Modal for editing a Dynamic Folder Rule
class DynamicRuleEditModal extends Modal {
  private rule: DynamicFolderRule;
  private onSubmit: (rule: DynamicFolderRule) => void;
  private conditionsEl: HTMLElement;

  constructor(app: App, rule: DynamicFolderRule, onSubmit: (rule: DynamicFolderRule) => void) {
    super(app);
    this.rule = {
      ...rule,
      conditions: rule.conditions.map((c) => ({...c})),
    };
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const {contentEl} = this;
    contentEl.empty();
    contentEl.createEl('h2', {text: t('Edit Dynamic Folder Rule')});

    new Setting(contentEl).setName(t('Rule Name')).addText((text) => {
      text
        .setPlaceholder('e.g. Active Work Projects')
        .setValue(this.rule.name)
        .onChange((v) => {
          this.rule.name = v;
        });
    });

    new Setting(contentEl)
      .setName(t('Base Path'))
      .setDesc(t('Root folder to scan (e.g. "projects")'))
      .addText((text) => {
        text
          .setPlaceholder('projects')
          .setValue(this.rule.basePath)
          .onChange((v) => {
            this.rule.basePath = v;
          });
      });

    new Setting(contentEl)
      .setName(t('Target File'))
      .setDesc(t('Filename to check frontmatter in (default: README.md)'))
      .addText((text) => {
        text
          .setPlaceholder('README.md')
          .setValue(this.rule.targetFile)
          .onChange((v) => {
            this.rule.targetFile = v;
          });
      });

    // Conditions
    new Setting(contentEl)
      .setName(t('Conditions'))
      .setDesc(t('All conditions must match (AND logic)'))
      .addButton((button) => {
        button.setIcon('plus').setTooltip(t('Add Condition')).onClick(() => {
          this.rule.conditions.push({key: '', value: '', operator: 'equals'});
          this.renderConditions();
        });
      });

    this.conditionsEl = contentEl.createDiv('dynamic-rule-conditions');
    this.renderConditions();

    // Save / Cancel
    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText(t('Cancel')).onClick(() => {
          this.close();
        });
      })
      .addButton((button) => {
        button
          .setButtonText(t('Save'))
          .setCta()
          .onClick(() => {
            this.rule.conditions = this.rule.conditions.filter((c) => c.key.trim() !== '');
            this.onSubmit(this.rule);
            this.close();
          });
      });
  }

  onClose() {
    const {contentEl} = this;
    contentEl.empty();
  }

  private renderConditions() {
    this.conditionsEl.empty();
    this.rule.conditions.forEach((cond, index) => {
      const row = new Setting(this.conditionsEl)
        .addText((text) => {
          text
            .setPlaceholder('key (e.g. completed)')
            .setValue(cond.key)
            .onChange((v) => {
              this.rule.conditions[index].key = v;
            });
        })
        .addDropdown((dropdown) => {
          dropdown
            .addOption('equals', 'equals')
            .addOption('not_equals', 'not equals')
            .setValue(cond.operator)
            .onChange((v: string) => {
              this.rule.conditions[index].operator = v as 'equals' | 'not_equals';
            });
        })
        .addText((text) => {
          text
            .setPlaceholder('value (e.g. false)')
            .setValue(cond.value)
            .onChange((v) => {
              this.rule.conditions[index].value = v;
            });
        })
        .addExtraButton((button) => {
          button.setIcon('trash').setTooltip(t('Remove')).onClick(() => {
            this.rule.conditions.splice(index, 1);
            this.renderConditions();
          });
        });
    });
  }
}
