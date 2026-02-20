import {moment, Platform, TFile} from 'obsidian';
import fileService from '../services/fileService';
import {safeExecute} from '../api';

/**
 * Open a file at a specific line number
 */
async function openFileAtLine(file: TFile, lineNum: number): Promise<void> {
  const {app} = fileService.getState();

  if (!Platform.isMobile) {
    const leaf = app.workspace.getLeaf(true);
    await leaf.openFile(file, {eState: {line: lineNum}});
  } else {
    let leaf = app.workspace.activeLeaf;
    if (leaf === null) {
      leaf = app.workspace.getLeaf(true);
    }
    await leaf.openFile(file, {eState: {line: lineNum}});
  }
}

/**
 * Show event in its source file (daily note or extra folder file)
 */
export const showEvent = async (event: {id: string; path?: string}): Promise<void> => {
  return await safeExecute(async () => {
    const {app} = fileService.getState();

    if (!/\d{14,}/.test(event.id)) {
      throw new Error('Invalid event ID format');
    }

    const lineNum = parseInt(event.id.slice(14));

    // If event has a path, try to open the file directly
    if (event.path) {
      const file = app.vault.getFileByPath(event.path);
      if (file) {
        await openFileAtLine(file, lineNum);
        return;
      }
    }

    // Fallback: resolve via daily note date
    const eventDateString = event.id.slice(0, 14);
    const date = moment(eventDateString, 'YYYYMMDDHHmmss');
    const file = await fileService.getDailyNoteByEvent(date);
    if (!file) {
      throw new Error(`File not found for event: ${event.id}`);
    }

    await openFileAtLine(file, lineNum);
  }, 'Failed to show event');
};

/**
 * Legacy wrapper — kept for backward compatibility
 */
export const showEventInDailyNotes = async (eventId: string): Promise<void> => {
  return showEvent({id: eventId});
};
