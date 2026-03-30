import {moment} from 'obsidian';
import {getMarkBasedOnEvent} from './parser';

/**
 * Cleans the event content by removing time and date information
 */
export function cleanEventContent(originalContent: string, content: string): string {
  let cleanContent = content;

  cleanContent = cleanContent.replace(/^\d{1,2}:\d{2}(\s?-\s?\d{1,2}:\d{2})?\s+/, '').trim();
  cleanContent = cleanContent.replace(/⏲\s?\d{1,2}:\d{2}/g, '').trim();
  cleanContent = cleanContent.replace(/📅\s?\d{4}-\d{2}-\d{2}/g, '').trim();
  cleanContent = cleanContent.replace(/🛫\s?\d{4}-\d{2}-\d{2}/g, '').trim();
  cleanContent = cleanContent.replace(/\d{1,2}:\d{2}\s?-\s?\d{1,2}:\d{2}/g, '').trim();

  if (cleanContent === '' && originalContent) {
    cleanContent = originalContent
      .replace(/^\d{1,2}:\d{2}(\s?-\s?\d{1,2}:\d{2})?\s+/, '')
      .trim()
      .replace(/⏲\s?\d{1,2}:\d{2}/g, '')
      .trim()
      .replace(/📅\s?\d{4}-\d{2}-\d{2}/g, '')
      .trim()
      .replace(/🛫\s?\d{4}-\d{2}-\d{2}/g, '')
      .trim()
      .replace(/\d{1,2}:\d{2}\s?-\s?\d{1,2}:\d{2}/g, '')
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

  const blockIdMatch = cleanContent.match(/\s(\^[a-zA-Z0-9]{2,})$/);
  const blockId = blockIdMatch ? blockIdMatch[1] : '';

  let processedContent = blockId ? cleanContent.replace(blockIdMatch[0], '') : cleanContent;

  const sameDay = startMoment.isSame(endMoment, 'day');

  let newLine;

  if (sameDay) {
    newLine = mark
      ? `- [${mark}] ${timeHour}:${timeMinute}-${endMoment.format('HH:mm')} ${processedContent}`
      : `- ${timeHour}:${timeMinute}-${endMoment.format('HH:mm')} ${processedContent}`;
  } else {
    newLine = mark
      ? `- [${mark}] ${processedContent} 🛫 ${startMoment.format('YYYY-MM-DD')} 📅 ${endMoment.format('YYYY-MM-DD')}`
      : `- ${processedContent} 🛫 ${startMoment.format('YYYY-MM-DD')} 📅 ${endMoment.format('YYYY-MM-DD')}`;
  }

  if (blockId) {
    newLine += ` ${blockId}`;
  }

  return newLine;
}

/**
 * Formats an all-day event without time information
 */
export function formatAllDayEvent(
  cleanContent: string,
  originalStartDate: moment.Moment,
  eventStartMoment: moment.Moment,
  eventEndMoment: moment.Moment,
  eventType: string,
): string {
  const blockIdMatch = cleanContent.match(/\s(\^[a-zA-Z0-9]{2,})$/);
  const blockId = blockIdMatch ? blockIdMatch[1] : '';

  const mark = getMarkBasedOnEvent(eventType);

  let processedContent = blockId ? cleanContent.replace(blockIdMatch[0], '') : cleanContent;

  let newLine = mark === null ? `- ${processedContent}` : `- [${mark}] ${processedContent}`;

  // For all-day events, react-big-calendar uses exclusive end (end = start + 1 day for single-day)
  // A truly multi-day event has end > start + 1 day
  const isMultiDay = eventEndMoment.diff(eventStartMoment, 'days') > 1;

  if (isMultiDay) {
    newLine += ` 🛫 ${eventStartMoment.format('YYYY-MM-DD')}`;
    newLine += ` 📅 ${eventEndMoment.clone().subtract(1, 'day').format('YYYY-MM-DD')}`;
  } else {
    newLine += ` 📅 ${eventStartMoment.format('YYYY-MM-DD')}`;
  }

  if (blockId) {
    newLine += ` ${blockId}`;
  }

  return newLine;
}
