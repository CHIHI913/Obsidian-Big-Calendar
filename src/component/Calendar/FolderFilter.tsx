import React, {useCallback, useEffect, useState} from 'react';
import fileService from '@/services/fileService';
import globalService from '@/services/globalService';
import locationService from '@/services/locationService';
import useEventStore from '@/stores/eventStore';

interface FolderToggle {
  path: string;
  label: string;
  color: string;
  enabled: boolean;
}

interface FolderFilterProps {
  onFilterChange: (filterType: 'metadata' | 'client') => void;
}

const FolderFilter: React.FC<FolderFilterProps> = ({onFilterChange}) => {
  const [folders, setFolders] = useState<FolderToggle[]>([]);

  // Build folder list from settings
  useEffect(() => {
    const toggles: FolderToggle[] = [];

    // Daily Notes folder
    try {
      const dailyNotePath = fileService.getDailyNotePath();
      if (dailyNotePath) {
        toggles.push({
          path: dailyNotePath,
          label: dailyNotePath.split('/').pop() || dailyNotePath,
          color: 'var(--interactive-accent)',
          enabled: true,
        });
      }
    } catch {
      // Daily notes not configured
    }

    // ExtraFolders
    const settings = globalService.getState().pluginSetting;
    if (settings?.ExtraFolders) {
      for (const folder of settings.ExtraFolders) {
        toggles.push({
          path: folder.path,
          label: folder.path.split('/').pop() || folder.path,
          color: folder.color || '#80d0ff',
          enabled: true,
        });
      }
    }

    setFolders(toggles);
  }, []);

  const handleToggle = useCallback(
    (index: number) => {
      setFolders((prev) => {
        const next = prev.map((f, i) => (i === index ? {...f, enabled: !f.enabled} : f));

        // If all enabled, clear folder filter (show everything)
        const allEnabled = next.every((f) => f.enabled);
        if (allEnabled) {
          locationService.setFolderPaths([]);
        } else {
          const enabledPaths = next.filter((f) => f.enabled).map((f) => f.path);
          locationService.setFolderPaths(enabledPaths);
        }

        // Trigger client-side filter
        onFilterChange('client');
        useEventStore.getState().setForceUpdate();

        return next;
      });
    },
    [onFilterChange],
  );

  // Don't render if there's only one folder
  if (folders.length <= 1) return null;

  return (
    <div className="folder-filter">
      {folders.map((folder, index) => (
        <div
          key={folder.path}
          className={`folder-chip ${folder.enabled ? 'active' : 'inactive'}`}
          onClick={() => handleToggle(index)}
          title={folder.path}
        >
          <span
            className="folder-chip-dot"
            style={{backgroundColor: folder.enabled ? folder.color : 'var(--text-faint)'}}
          />
          <span>{folder.label}</span>
        </div>
      ))}
    </div>
  );
};

export default FolderFilter;
