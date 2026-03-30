const moment = require('moment');
import {formatEventLine, formatAllDayEvent, cleanEventContent} from '../eventFormatters';

describe('cleanEventContent', () => {
  it('should remove 📅 date pattern', () => {
    const result = cleanEventContent(
      '[要件-定義] タスク 📅 2026-04-02',
      '[要件-定義] タスク 📅 2026-04-02',
    );
    expect(result).toBe('[要件-定義] タスク');
  });

  it('should remove 🛫 date pattern', () => {
    const result = cleanEventContent(
      '[要件-定義] タスク 🛫 2026-04-02 📅 2026-04-03',
      '[要件-定義] タスク 🛫 2026-04-02 📅 2026-04-03',
    );
    expect(result).toBe('[要件-定義] タスク');
  });

  it('should remove time range pattern', () => {
    const result = cleanEventContent(
      '10:00-11:00 Meeting',
      '10:00-11:00 Meeting',
    );
    expect(result).toBe('Meeting');
  });

  it('should remove 🛫 with no space', () => {
    const result = cleanEventContent(
      'タスク 🛫2026-04-02 📅2026-04-03',
      'タスク 🛫2026-04-02 📅2026-04-03',
    );
    expect(result).toBe('タスク');
  });

  it('should fallback to original content when content becomes empty', () => {
    const result = cleanEventContent(
      '🛫 2026-04-02 📅 2026-04-03',
      '',
    );
    expect(result).toBe('');
  });
});

describe('formatAllDayEvent', () => {
  // Core bug: dragging task from April 2 to April 3
  // react-big-calendar: start=April 3, end=April 4 (exclusive)
  // Expected: 📅 2026-04-03 ONLY, no 🛫

  it('should NOT add 🛫 when dragging single-day task to new date (exclusive end)', () => {
    const result = formatAllDayEvent(
      '[要件-定義] タスク',
      moment('2026-04-02'),  // original start
      moment('2026-04-03'),  // new start (dragged to)
      moment('2026-04-04'),  // exclusive end (start + 1 day)
      'TASK-TODO',
    );

    expect(result).toBe('- [ ] [要件-定義] タスク 📅 2026-04-03');
    expect(result).not.toContain('🛫');
  });

  it('should NOT add 🛫 when task stays on same date', () => {
    const result = formatAllDayEvent(
      'タスク',
      moment('2026-04-02'),
      moment('2026-04-02'),
      moment('2026-04-03'),  // exclusive end
      'TASK-TODO',
    );

    expect(result).toBe('- [ ] タスク 📅 2026-04-02');
    expect(result).not.toContain('🛫');
  });

  it('should add 🛫 for genuinely multi-day events (3-day span)', () => {
    const result = formatAllDayEvent(
      'マルチデイタスク',
      moment('2026-04-01'),
      moment('2026-04-01'),
      moment('2026-04-04'),  // exclusive end = 3 day span (1,2,3)
      'TASK-TODO',
    );

    expect(result).toContain('🛫 2026-04-01');
    expect(result).toContain('📅 2026-04-03');  // exclusive end - 1
  });

  it('should add 🛫 for 2-day events (end - start = 2)', () => {
    const result = formatAllDayEvent(
      '2日間タスク',
      moment('2026-04-01'),
      moment('2026-04-01'),
      moment('2026-04-03'),  // exclusive end = 2 day span (1,2)
      'TASK-TODO',
    );

    expect(result).toContain('🛫 2026-04-01');
    expect(result).toContain('📅 2026-04-02');
  });

  it('should preserve block ID', () => {
    const result = formatAllDayEvent(
      'タスク ^abc123',
      moment('2026-04-02'),
      moment('2026-04-03'),
      moment('2026-04-04'),
      'TASK-TODO',
    );

    expect(result).toBe('- [ ] タスク 📅 2026-04-03 ^abc123');
  });

  it('should handle TASK-IN_PROGRESS event type', () => {
    const result = formatAllDayEvent(
      'タスク',
      moment('2026-04-02'),
      moment('2026-04-03'),
      moment('2026-04-04'),
      'TASK-IN_PROGRESS',
    );

    expect(result).toBe('- [/] タスク 📅 2026-04-03');
  });

  it('should handle non-TASK event type (no checkbox)', () => {
    const result = formatAllDayEvent(
      'イベント',
      moment('2026-04-02'),
      moment('2026-04-03'),
      moment('2026-04-04'),
      'EVENT',
    );

    expect(result).toBe('- イベント 📅 2026-04-03');
  });
});

describe('formatEventLine', () => {
  it('should format same-day timed events without 🛫', () => {
    const result = formatEventLine(
      'ミーティング',
      moment('2026-04-03 10:00'),
      moment('2026-04-03 11:00'),
      'TASK-TODO',
    );

    expect(result).toBe('- [ ] 10:00-11:00 ミーティング');
    expect(result).not.toContain('🛫');
  });

  it('should add 🛫 for multi-day timed events', () => {
    const result = formatEventLine(
      'マルチデイ',
      moment('2026-04-03 10:00'),
      moment('2026-04-05 11:00'),
      'TASK-TODO',
    );

    expect(result).toContain('🛫 2026-04-03');
    expect(result).toContain('📅 2026-04-05');
  });
});

describe('end-to-end: drag single-day task to new date', () => {
  it('should produce clean output without 🛫 for the full flow', () => {
    // Simulate the full flow: content with 📅 → clean → format
    const originalContent = '[要件-定義] 面接対策スクリプト自動生成機能の要件定義 📅 2026-04-02';
    const content = originalContent; // same content passed through

    // Step 1: Clean content (removes 📅 and 🛫)
    const cleaned = cleanEventContent(originalContent, content);
    expect(cleaned).toBe('[要件-定義] 面接対策スクリプト自動生成機能の要件定義');

    // Step 2: Format as all-day event (dragged from April 2 to April 3)
    const result = formatAllDayEvent(
      cleaned,
      moment('2026-04-02'),  // original date
      moment('2026-04-03'),  // new date
      moment('2026-04-04'),  // exclusive end
      'TASK-TODO',
    );

    expect(result).toBe('- [ ] [要件-定義] 面接対策スクリプト自動生成機能の要件定義 📅 2026-04-03');
    expect(result).not.toContain('🛫');
  });

  it('should produce clean output when task already has 🛫 from previous bug', () => {
    // Task was previously corrupted with 🛫
    const originalContent = '[要件-定義] タスク 🛫 2026-04-02 📅 2026-04-03';
    const content = originalContent;

    const cleaned = cleanEventContent(originalContent, content);
    expect(cleaned).toBe('[要件-定義] タスク');

    const result = formatAllDayEvent(
      cleaned,
      moment('2026-04-03'),
      moment('2026-04-04'),
      moment('2026-04-05'),
      'TASK-TODO',
    );

    expect(result).toBe('- [ ] [要件-定義] タスク 📅 2026-04-04');
    expect(result).not.toContain('🛫');
  });
});
