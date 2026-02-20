import {App, TFile, Vault, moment} from 'obsidian';
import fileService from '../services/fileService';
import globalService from '../services/globalService';
import {stringOrDate} from 'react-big-calendar';
import {createTimeRegex, getAllLinesFromFile, extractEventTime, safeExecute} from '../api';
import {getDailyNote, getAllDailyNotes} from 'obsidian-daily-notes-interface';
import {getMarkBasedOnEvent} from './parser';

/**
 * Check if a file path belongs to an ExtraFolder
 */
function isExtraFolderPath(filePath: string): boolean {
  const settings = globalService.getState().pluginSetting;
  return settings.ExtraFolders?.some((f) => filePath.startsWith(f.path + '/')) ?? false;
}

/**
 * Changes an existing event with new content and dates
 *
 * @param eventid The ID of the event to change
 * @param originalContent The original content of the event
 * @param content The new content for the event
 * @param eventType The type of the event
 * @param eventStartDate The new start date
 * @param eventEndDate The new end date
 * @param originalEndDate The original end date
 * @returns Promise resolving to the updated event
 */
export async function changeEvent(
  eventid: string,
  originalContent: string,
  content: string,
  eventType: string,
  eventStartDate: stringOrDate,
  eventEndDate: stringOrDate,
  originalEndDate: Date,
  originalPath: string,
): Promise<Model.Event> {
  return await safeExecute(async () => {
    const {app} = fileService.getState();
    const files = await getAllDailyNotes();

    // Parse dates
    const startTimeString = eventid.slice(0, 13) + '00';
    const originalStartDate = moment(startTimeString, 'YYYYMMDDHHmmSS');
    const eventStartMoment = moment(eventStartDate);
    const eventEndMoment = moment(eventEndDate);
    const originalEndMoment = moment(originalEndDate);

    // Check what has changed
    const startDateChanged = !originalStartDate.isSame(eventStartMoment, 'day');
    const endDateChanged = !originalEndMoment.isSame(eventEndMoment, 'day');
    const sameDayEvent = eventStartMoment.isSame(eventEndMoment, 'day');
    const timeIntervalChanged =
      !eventStartMoment.isSame(originalStartDate, 'minute') || !eventEndMoment.isSame(originalEndMoment, 'minute');

    // Check if the event is an all-day event without time information
    const isAllDayWithoutTime = eventType.startsWith('TASK-') && !originalContent.match(/^\d{1,2}:\d{2}/);

    const originalEventId = eventid;
    let result: Model.Event;

    // For all-day events without time information, handle specially
    if (isAllDayWithoutTime) {
      const isExtraFile = isExtraFolderPath(originalPath);
      const sourceFile = app.vault.getFileByPath(originalPath);

      if (!sourceFile) {
        throw new Error(`File not found: ${originalPath}`);
      }

      // Read file content
      const fileContent = await app.vault.read(sourceFile);
      const fileLines = getAllLinesFromFile(fileContent);

      // Find the line with the event using the accurate method
      const lineIndex = findEventLine(fileLines, eventid, originalContent, originalStartDate, eventType);
      if (lineIndex === -1) {
        throw new Error('Could not find the event line in the file');
      }

      let newLine;

      if (isExtraFile) {
        // ExtraFolders: update 📅 date in-place, no 🛫, no file move
        // Use eventStartMoment because react-big-calendar sets end to next day for all-day events (exclusive end)
        const targetDate = eventStartMoment.format('YYYY-MM-DD');
        const originalLine = fileLines[lineIndex];
        // Replace existing 📅 date
        if (/📅\s?\d{4}-\d{2}-\d{2}/.test(originalLine)) {
          newLine = originalLine.replace(/📅\s?\d{4}-\d{2}-\d{2}/, `📅 ${targetDate}`);
        } else {
          // No 📅 found — append it
          newLine = `${originalLine} 📅 ${targetDate}`;
        }
      } else {
        // Daily Notes: existing behavior
        const cleanContent = cleanEventContent(originalContent, content);
        if (!content.match(/^\d{1,2}:\d{2}/)) {
          newLine = formatAllDayEvent(cleanContent, originalStartDate, eventStartMoment, eventEndMoment, eventType);
        } else {
          newLine = formatEventLine(cleanContent, eventStartMoment, eventEndMoment, eventType);
        }
      }

      // Update the file in-place
      fileLines[lineIndex] = newLine;
      const newFileContent = fileLines.join('\n');
      await app.vault.modify(sourceFile, newFileContent);

      const cleanContent = cleanEventContent(originalContent, content);

      // Return the updated event
      return {
        id: eventid,
        title: cleanContent,
        start: eventStartMoment.toDate(),
        end: eventEndMoment.toDate(),
        allDay: true,
        eventType: eventType,
        originalEventId: originalEventId,
        path: sourceFile.path,
      };
    }

    // Case 1: Only time interval changed, dates remain the same
    if (timeIntervalChanged && !startDateChanged && !endDateChanged) {
      result = await updateTimeIntervalOnly(
        eventid,
        originalContent,
        content,
        eventType,
        originalStartDate,
        eventStartMoment,
        eventEndMoment,
        files,
        app,
      );
    }
    // Case 2: Only end date changed
    else if (!startDateChanged && endDateChanged) {
      result = await updateEndDateOnly(
        eventid,
        originalContent,
        content,
        eventType,
        originalStartDate,
        eventStartMoment,
        eventEndMoment,
        app,
        originalPath,
      );
    }
    // Case 3: Both start and end dates changed
    else if (startDateChanged) {
      result = await moveEventToNewDay(
        eventid,
        originalContent,
        content,
        eventType,
        originalStartDate,
        eventStartMoment,
        eventEndMoment,
        sameDayEvent,
        files,
        app,
        originalPath,
      );
    }
    // Fallback - should not normally reach here
    else {
      result = await updateTimeIntervalOnly(
        eventid,
        originalContent,
        content,
        eventType,
        originalStartDate,
        eventStartMoment,
        eventEndMoment,
        files,
        app,
      );
    }

    // 添加原始事件ID到结果中，帮助状态管理跟踪
    return {
      ...result,
      originalEventId: originalEventId,
    };
  }, 'Failed to update event');
}

/**
 * Updates only the time interval of an event
 * Case 1: Start and end dates remain the same, only time interval changed
 */
async function updateTimeIntervalOnly(
  eventid: string,
  originalContent: string,
  content: string,
  eventType: string,
  originalStartDate: moment.Moment,
  eventStartMoment: moment.Moment,
  eventEndMoment: moment.Moment,
  files: Record<string, TFile>,
  app: App,
): Promise<Model.Event> {
  // Check if this is an all-day event without time information
  const isAllDayWithoutTime = eventType.startsWith('TASK-') && !originalContent.match(/^\d{1,2}:\d{2}/);
  const contentHasTimeInfo = content.match(/^\d{1,2}:\d{2}/);

  // Get the original daily note
  const dailyNote = getDailyNote(originalStartDate, files);
  if (!dailyNote) {
    throw new Error(`Daily note not found for date: ${originalStartDate.format('YYYY-MM-DD')}`);
  }

  // Read file content
  const fileContent = await app.vault.read(dailyNote);
  const fileLines = getAllLinesFromFile(fileContent);

  // Find the line with the event
  let lineIndex = -1;
  let originalLine = '';

  for (let i = 0; i < fileLines.length; i++) {
    const line = fileLines[i];
    if (line.includes(originalContent)) {
      lineIndex = i;
      originalLine = line;
      break;
    }
  }

  if (lineIndex === -1) {
    throw new Error('Could not find the event line in the file');
  }

  // Clean the content
  const cleanContent = cleanEventContent(originalContent, content);

  // Format the line
  let newLine;

  // If this is an all-day event without time and the content still doesn't have time
  if (isAllDayWithoutTime && !contentHasTimeInfo) {
    // Use the special formatting for all-day events
    newLine = formatAllDayEvent(cleanContent, originalStartDate, eventStartMoment, eventEndMoment, eventType);
  } else {
    // For regular events or if time was added, use standard formatting
    newLine = formatEventLine(cleanContent, eventStartMoment, eventEndMoment, eventType);
  }

  // Update the file
  fileLines[lineIndex] = newLine;
  const newFileContent = fileLines.join('\n');
  await app.vault.modify(dailyNote, newFileContent);

  // Return the updated event
  return {
    id: eventid,
    title: cleanContent,
    start: eventStartMoment.toDate(),
    end: eventEndMoment.toDate(),
    allDay: isAllDayWithoutTime && !contentHasTimeInfo,
    eventType,
    path: dailyNote.path,
  };
}

/**
 * Updates only the end date of an event
 * Case 2: Start date remains the same, only end date changed
 */
async function updateEndDateOnly(
  eventid: string,
  originalContent: string,
  content: string,
  eventType: string,
  originalStartDate: moment.Moment,
  eventStartMoment: moment.Moment,
  eventEndMoment: moment.Moment,
  app: App,
  originalPath: string,
): Promise<Model.Event> {
  // Check if this is an all-day event without time information
  const isAllDayWithoutTime = eventType.startsWith('TASK-') && !originalContent.match(/^\d{1,2}:\d{2}/);
  const contentHasTimeInfo = content.match(/^\d{1,2}:\d{2}/);

  // This is similar to Case 1, but makes sure to update end date reference
  const dailyNote = app.vault.getFileByPath(originalPath);
  if (!dailyNote) {
    throw new Error(`Daily note not found for date: ${originalStartDate.format('YYYY-MM-DD')}`);
  }

  // Read file content
  const fileContent = await app.vault.read(dailyNote);
  const fileLines = getAllLinesFromFile(fileContent);

  // Find the line with the event using the accurate method
  const lineIndex = findEventLine(fileLines, eventid, originalContent, originalStartDate, eventType);
  if (lineIndex === -1) {
    throw new Error('Could not find the event line in the file');
  }

  // Clean the content
  const cleanContent = cleanEventContent(originalContent, content);
  const sameDay = eventStartMoment.isSame(eventEndMoment, 'day');

  // Format the line
  let newLine;

  // If this is an all-day event without time and the content still doesn't have time
  if (isAllDayWithoutTime && !contentHasTimeInfo) {
    // For all-day events, the end date is less important - use the standard all-day formatting
    newLine = formatAllDayEvent(cleanContent, originalStartDate, eventStartMoment, eventEndMoment, eventType);
  } else if (sameDay) {
    // For same-day events, manually format with time range
    const startTime = eventStartMoment.format('HH:mm');
    const endTime = eventEndMoment.format('HH:mm');
    const mark = getMarkBasedOnEvent(eventType);
    newLine = mark
      ? `- [${mark}] ${startTime}-${endTime} ${cleanContent}`
      : `- ${startTime}-${endTime} ${cleanContent}`;
  } else {
    // Otherwise use the standard formatting function
    newLine = formatEventLine(cleanContent, eventStartMoment, eventEndMoment, eventType);
  }

  // Update the file
  fileLines[lineIndex] = newLine;
  const newFileContent = fileLines.join('\n');
  await app.vault.modify(dailyNote, newFileContent);

  // Return the updated event
  return {
    id: eventid,
    title: cleanContent,
    start: eventStartMoment.toDate(),
    end: eventEndMoment.toDate(),
    allDay: isAllDayWithoutTime && !contentHasTimeInfo,
    eventType: eventType || 'default',
    path: dailyNote.path,
  };
}

/**
 * Moves an event to a new day
 * Case 3: Start date has changed, potentially end date too
 */
async function moveEventToNewDay(
  eventid: string,
  originalContent: string,
  content: string,
  eventType: string,
  originalStartDate: moment.Moment,
  eventStartMoment: moment.Moment,
  eventEndMoment: moment.Moment,
  sameDayEvent: boolean,
  files: Record<string, TFile>,
  app: App,
  originalPath: string,
): Promise<Model.Event> {
  // Check if this is an all-day event without time information
  const isAllDayWithoutTime = eventType.startsWith('TASK-') && !originalContent.match(/^\d{1,2}:\d{2}/);
  const contentHasTimeInfo = content.match(/^\d{1,2}:\d{2}/);

  // Get the original and target daily notes
  const originalDailyNote = app.vault.getFileByPath(originalPath);
  let targetDailyNote = getDailyNote(eventStartMoment, files);

  if (!originalDailyNote) {
    throw new Error(`Original daily note not found for date: ${originalStartDate.format('YYYY-MM-DD')}`);
  }

  // If target daily note doesn't exist, create it
  if (!targetDailyNote) {
    targetDailyNote = await fileService.createDailyNote(eventEndMoment);
  }

  // Read original file content
  const originalFileContent = await app.vault.read(originalDailyNote);
  const originalFileLines = getAllLinesFromFile(originalFileContent);

  // Find the line with the event using the accurate method
  const lineIndex = findEventLine(originalFileLines, eventid, originalContent, originalStartDate, eventType);
  if (lineIndex === -1) {
    throw new Error('Could not find the event line in the file');
  }

  // Clean the content
  const cleanContent = cleanEventContent(originalContent, content);
  const mark = getMarkBasedOnEvent(eventType);

  // Format the line appropriately
  let newLine;
  if (isAllDayWithoutTime && !contentHasTimeInfo) {
    // For all-day events without time, use the special formatting
    newLine = formatAllDayEvent(cleanContent, originalStartDate, eventStartMoment, eventEndMoment, eventType);
  } else if (sameDayEvent) {
    // For same-day events, manually format with time range
    const startTime = eventStartMoment.format('HH:mm');
    const endTime = eventEndMoment.format('HH:mm');
    newLine = mark
      ? `- [${mark}] ${startTime}-${endTime} ${cleanContent}`
      : `- ${startTime}-${endTime} ${cleanContent}`;
  } else {
    newLine = formatEventLine(cleanContent, eventStartMoment, eventEndMoment, eventType);
  }

  // Remove from original file
  originalFileLines.splice(lineIndex, 1);
  const newOriginalFileContent = originalFileLines.join('\n');
  await app.vault.modify(originalDailyNote, newOriginalFileContent);

  // Read target file content
  const targetFileContent = await app.vault.read(targetDailyNote);
  let targetFileLines = getAllLinesFromFile(targetFileContent);

  // Find the insert position
  const insertPosition = findInsertPosition(targetFileLines, eventType);
  if (insertPosition !== -1) {
    targetFileLines.splice(insertPosition, 0, newLine);
  } else {
    targetFileLines.push(newLine);
  }

  const newTargetFileContent = targetFileLines.join('\n');
  await app.vault.modify(targetDailyNote, newTargetFileContent);

  // Return the updated event
  return {
    id: eventid,
    title: cleanContent,
    start: eventStartMoment.toDate(),
    end: eventEndMoment.toDate(),
    allDay: isAllDayWithoutTime && !contentHasTimeInfo,
    eventType,
    path: targetDailyNote.path,
  };
}

/**
 * Cleans the event content by removing time and date information
 */
function cleanEventContent(originalContent: string, content: string): string {
  // Always start with the new content provided by the user
  let cleanContent = content;

  // Remove any existing time patterns
  cleanContent = cleanContent.replace(/^\d{1,2}:\d{2}(-\d{1,2}:\d{2})?\s+/, '').trim();
  // Remove any existing end time patterns
  cleanContent = cleanContent.replace(/⏲\s?\d{1,2}:\d{2}/g, '').trim();
  // Remove any existing date patterns
  cleanContent = cleanContent.replace(/📅\s?\d{4}-\d{2}-\d{2}/g, '').trim();
  // Remove any time range patterns
  cleanContent = cleanContent.replace(/\d{1,2}:\d{2}-\d{1,2}:\d{2}/g, '').trim();

  // If the original content had special formatting that we want to preserve,
  // we can check for that here, but we prioritize the new content
  if (cleanContent === '' && originalContent) {
    // Fallback to cleaned original content if new content is empty after cleaning
    cleanContent = originalContent
      .replace(/^\d{1,2}:\d{2}(-\d{1,2}:\d{2})?\s+/, '')
      .trim()
      .replace(/⏲\s?\d{1,2}:\d{2}/g, '')
      .trim()
      .replace(/📅\s?\d{4}-\d{2}-\d{2}/g, '')
      .trim()
      .replace(/\d{1,2}:\d{2}-\d{1,2}:\d{2}/g, '')
      .trim();
  }

  return cleanContent;
}

/**
 * Formats an event line with the provided content and timestamps
 */
export function formatEventLine(
  cleanContent: string,
  startMoment: moment.Moment,
  endMoment: moment.Moment,
  eventType: string,
): string {
  const timeHour = startMoment.format('HH');
  const timeMinute = startMoment.format('mm');

  const mark = getMarkBasedOnEvent(eventType);

  // Extract block ID if present
  const blockIdMatch = cleanContent.match(/\s(\^[a-zA-Z0-9]{2,})$/);
  const blockId = blockIdMatch ? blockIdMatch[1] : '';

  // Remove block ID from content for processing
  let processedContent = blockId ? cleanContent.replace(blockIdMatch[0], '') : cleanContent;

  // Check if the start and end dates are the same
  const sameDay = startMoment.isSame(endMoment, 'day');

  let newLine;

  if (sameDay) {
    // For same-day events, use a time range format (HH:MM-HH:MM)
    newLine = mark
      ? `- [${mark}] ${timeHour}:${timeMinute}-${endMoment.format('HH:mm')} ${processedContent}`
      : `- ${timeHour}:${timeMinute}-${endMoment.format('HH:mm')} ${processedContent}`;
  } else {
    // For multi-day events, use the format with start and end date emojis
    newLine = mark
      ? `- [${mark}] ${processedContent} 🛫 ${startMoment.format('YYYY-MM-DD')} 📅 ${endMoment.format('YYYY-MM-DD')}`
      : `- ${processedContent} 🛫 ${startMoment.format('YYYY-MM-DD')} 📅 ${endMoment.format('YYYY-MM-DD')}`;
  }

  // Add block ID back at the end if it exists
  if (blockId) {
    newLine += ` ${blockId}`;
  }

  return newLine;
}

/**
 * Formats an all-day event without time information
 *
 * @param cleanContent The content of the event
 * @param originalStartDate The original start date
 * @param eventStartMoment The new start date
 * @returns Formatted event line
 */
function formatAllDayEvent(
  cleanContent: string,
  originalStartDate: moment.Moment,
  eventStartMoment: moment.Moment,
  eventEndMoment: moment.Moment,
  eventType: string,
): string {
  // Extract block ID if present
  const blockIdMatch = cleanContent.match(/\s(\^[a-zA-Z0-9]{2,})$/);
  const blockId = blockIdMatch ? blockIdMatch[1] : '';

  const mark = getMarkBasedOnEvent(eventType);

  // Remove block ID from content for processing
  let processedContent = blockId ? cleanContent.replace(blockIdMatch[0], '') : cleanContent;

  console.log(eventType, mark);

  let newLine = mark === null ? `- ${processedContent}` : `- [${mark}] ${processedContent}`;

  // Check if start date has changed
  const startDateChanged = !originalStartDate.isSame(eventStartMoment, 'day');
  const sameDay = eventStartMoment.isSame(eventEndMoment, 'day');

  if (!sameDay || startDateChanged) {
    // If start date has changed, add takeoff emoji with date
    newLine += ` 🛫 ${eventStartMoment.format('YYYY-MM-DD')}`;
  }

  newLine += ` 📅 ${eventEndMoment.format('YYYY-MM-DD')}`;

  // Add block ID back at the end if it exists
  if (blockId) {
    newLine += ` ${blockId}`;
  }

  return newLine;
}

/**
 * Gets the file associated with an event
 *
 * @param eventid The ID of the event
 * @returns The file containing the event
 */
export function getFile(event: Model.Event): TFile {
  return fileService.getFile(event);
}

/**
 * Gets the path to the daily notes folder
 *
 * @returns The path to the daily notes folder
 */
export function getDailyNotePath(): string {
  return fileService.getDailyNotePath();
}

/**
 * Extracts the end hour from a line
 *
 * @param line The line to extract from
 * @returns The end hour or 0 if not found
 */
export function extractEventEndHourFromLine(line: string): number {
  // First check for the time range format (HH:MM-HH:MM)
  const rangeMatch = /(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/.exec(line);
  if (rangeMatch) {
    return parseInt(rangeMatch[3]);
  }

  // Then try the timer emoji format
  const match = /⏲\s?(\d{1,2}):(\d{2})/.exec(line);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Extracts the end minute from a line
 *
 * @param line The line to extract from
 * @returns The end minute or 0 if not found
 */
export function extractEventEndMinFromLine(line: string): number {
  // First check for the time range format (HH:MM-HH:MM)
  const rangeMatch = /(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/.exec(line);
  if (rangeMatch) {
    return parseInt(rangeMatch[4]);
  }

  // Then try the timer emoji format
  const match = /⏲\s?(\d{1,2}):(\d{2})/.exec(line);
  return match ? parseInt(match[2]) : 0;
}

/**
 * Finds the appropriate position to insert an event line in a file
 *
 * @param fileLines The lines of the file
 * @param eventType The type of event to find ('TASK-TODO', 'TASK-DONE', etc.)
 * @returns The line index where the event should be inserted
 */
function findInsertPosition(fileLines: string[], eventType: string): number {
  // For todos, prefer to insert after an existing todo section
  if (eventType === 'TASK-TODO' || eventType === 'default') {
    // 首先尝试找到事件或任务块的结尾
    let eventBlockEnd = -1;

    // 查找任务块的结束位置
    for (let i = 0; i < fileLines.length; i++) {
      const line = fileLines[i];

      // 检查是否是任务或事件行（通过时间格式或任务标记）
      const isTaskOrEvent =
        line.match(/^- \d{1,2}:\d{2}/) || // 事件行有时间
        line.includes('- [ ]') || // 未完成任务
        line.includes('- [x]') || // 已完成任务
        line.includes('- [-]') || // 取消的任务
        (line.startsWith('- ') && (line.includes(' 📅 ') || line.includes(' 🛫 '))); // 带日期的条目

      if (isTaskOrEvent) {
        // 找到最后一个任务或事件行
        eventBlockEnd = i + 1;
      }
    }

    // 如果找到了事件块，返回它的结束位置
    if (eventBlockEnd > 0) {
      return eventBlockEnd;
    }
  }

  // 如果没找到适合的位置，尝试在指定的标题后插入
  const {pluginSetting} = globalService.getState();
  const insertAfterText = pluginSetting.InsertAfter;

  if (insertAfterText && insertAfterText.trim() !== '') {
    for (let i = 0; i < fileLines.length; i++) {
      if (fileLines[i].includes(insertAfterText)) {
        // 找到标题后的第一个非空行
        let j = i + 1;
        while (j < fileLines.length && fileLines[j].trim() === '') {
          j++;
        }
        return j;
      }
    }
  }

  // 如果存在处理下方标记，尝试在该标记后插入
  const processBelow = pluginSetting.ProcessEntriesBelow;
  if (processBelow && processBelow.trim() !== '') {
    for (let i = 0; i < fileLines.length; i++) {
      if (fileLines[i].includes(processBelow)) {
        return i + 1;
      }
    }
  }

  // 默认情况：
  // 1. 如果文件为空，在第一行插入
  if (fileLines.length === 0) {
    return 0;
  }

  // 2. 否则尝试在第一个标题下插入
  for (let i = 0; i < fileLines.length; i++) {
    if (fileLines[i].startsWith('#')) {
      return i + 1;
    }
  }

  // 3. 如果都失败了，在文件末尾添加
  return fileLines.length;
}

/**
 * 根据事件ID和内容查找事件在文件中的位置
 *
 * @param fileLines 文件内容行
 * @param eventid 事件ID
 * @param originalContent 原始内容
 * @param originalStartDate 原始开始日期
 * @param eventType 事件类型
 * @returns 找到的行索引，未找到则返回-1
 */
function findEventLine(
  fileLines: string[],
  eventid: string,
  originalContent: string,
  originalStartDate: moment.Moment,
  eventType: string,
): number {
  // 从事件ID提取时间信息和行号（如果存在）
  const timeString = eventid.slice(0, 12); // 格式: YYYYMMDDHHmm

  // 检查eventId是否包含行号信息
  const lineNumberMatch = eventid.match(/_L(\d+)$/);
  if (lineNumberMatch) {
    const lineNumber = parseInt(lineNumberMatch[1]);
    // 确认该行存在且包含原始内容
    if (lineNumber < fileLines.length && fileLines[lineNumber].includes(originalContent)) {
      return lineNumber;
    }
  }

  const mark = getMarkBasedOnEvent(eventType);

  // 首先尝试精确匹配内容
  for (let i = 0; i < fileLines.length; i++) {
    const line = fileLines[i];

    // 如果行包含原始内容，并且格式正确
    if (line.includes(originalContent) && line.startsWith('- ')) {
      // 检查是否是任务行（对于任务类型的事件）
      if (eventType.startsWith('TASK-') && (line.includes(`- [${mark}]`) || line.match(/- \[[^\]]\]/))) {
        return i;
      }

      // 检查是否有时间信息
      const timeInfo = extractEventTime(line);
      if (timeInfo) {
        // 重建时间并检查是否匹配
        const {hour, minute} = timeInfo;
        const lineTime = originalStartDate.clone().set({hour, minute});
        if (lineTime.format('YYYYMMDDHHmm') === timeString) {
          return i;
        }
      } else if (
        line.trim() === `- ${originalContent.trim()}` ||
        line.includes(`- ${originalContent.trim()} 📅`) ||
        line.includes(`- ${originalContent.trim()} 🛫`) ||
        (eventType.startsWith('TASK-') && line.includes(`- [${mark}] ${originalContent.trim()}`))
      ) {
        // 对于没有时间信息的全天事件
        return i;
      }
    }
  }

  // 如果没有找到精确匹配，尝试更模糊的匹配
  for (let i = 0; i < fileLines.length; i++) {
    if (fileLines[i].includes(originalContent)) {
      return i;
    }
  }

  // 最后，尝试匹配日期和时间信息
  const timeRegex = createTimeRegex();
  for (let i = 0; i < fileLines.length; i++) {
    const line = fileLines[i];
    if (line.startsWith('- ') && timeRegex.test(line)) {
      const timeInfo = extractEventTime(line);
      if (timeInfo) {
        const {hour, minute} = timeInfo;
        const lineTime = originalStartDate.clone().set({hour, minute});
        if (lineTime.format('YYYYMMDDHHmm') === timeString) {
          return i;
        }
      }
    }
  }

  return -1;
}
