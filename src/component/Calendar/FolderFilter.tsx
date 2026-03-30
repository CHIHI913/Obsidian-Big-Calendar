import React, {useCallback, useEffect, useState} from 'react';
import fileService from '@/services/fileService';
import globalService from '@/services/globalService';
import locationService from '@/services/locationService';
import useEventStore from '@/stores/eventStore';
import useGlobalStateStore from '@/stores/globalStateStore';
import {FolderToggle, buildFolderToggles, computeEnabledPaths} from './folderFilterUtils';

interface FolderFilterProps {
  onFilterChange: (filterType: 'metadata' | 'client') => void;
}

const FolderFilter: React.FC<FolderFilterProps> = ({onFilterChange}) => {
  const [folders, setFolders] = useState<FolderToggle[]>([]);
  const pluginSetting = useGlobalStateStore((state) => state.pluginSetting);

  // Build folder list from settings (rebuilds when pluginSetting changes, e.g. dynamic folders refresh)
  useEffect(() => {
    let dailyNotePath: string | null = null;
    try {
      dailyNotePath = fileService.getDailyNotePath();
    } catch {
      // Daily notes not configured
    }

    const effectiveFolders = globalService.getEffectiveExtraFolders();
    setFolders(buildFolderToggles(dailyNotePath, effectiveFolders));
  }, [pluginSetting]);

  const handleToggle = useCallback(
    (index: number) => {
      setFolders((prev) => {
        const next = prev.map((f, i) => (i === index ? {...f, enabled: !f.enabled} : f));
        const enabledPaths = computeEnabledPaths(prev, index);
        locationService.setFolderPaths(enabledPaths);

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
