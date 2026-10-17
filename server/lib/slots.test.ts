import { describe, expect, it } from 'vitest';
import { computeSlots, overlaps } from './slots.js';
import { hashPassword, normalizePhone, verifyPassword } from './auth.js';
import { fmt, isValidDate, toMin, weekdayOf } from './time.js';

describe('computeSlots', () => {
  const base = { workStart: toMin('10:00'), workEnd: toMin('12:00'), duration: 45, busy: [] };

  it('stays inside working hours', () => {
    const s = computeSlots(base).map(fmt);
    expect(s).toEqual(['10:00', '10:30', '11:00']);
    expect(s).not.toContain('11:30'); // 11:30 + 45min would end after 12:00
  });

  it('never overlaps existing bookings', () => {
    const s = computeSlots({ ...base, busy: [{ start: toMin('10:00'), end: toMin('10:45') }] }).map(fmt);
    expect(s).toEqual(['11:00']);
  });

  it('allows back-to-back bookings', () => {
    expect(overlaps({ start: 600, end: 645 }, { start: 645, end: 700 })).toBe(false);
    expect(overlaps({ start: 600, end: 646 }, { start: 645, end: 700 })).toBe(true);
  });

  it('drops slots that already started', () => {
    const s = computeSlots({ ...base, notBefore: toMin('10:31') }).map(fmt);
    expect(s).toEqual(['11:00']);
  });

  it('returns nothing when the service is longer than the shift', () => {
    expect(computeSlots({ ...base, duration: 180 })).toEqual([]);
  });
});

describe('time + auth helpers', () => {
  it('validates dates and weekdays', () => {
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-10-17')).toBe(true);
    expect(weekdayOf('2026-10-17')).toBe(6);
  });

  it('hashes passwords and verifies them', () => {
    const pw = `pw-${Math.random()}`;
    const h = hashPassword(pw);
    expect(h).not.toContain(pw);
    expect(verifyPassword(pw, h)).toBe(true);
    expect(verifyPassword(pw + 'x', h)).toBe(false);
    expect(verifyPassword(pw, null)).toBe(false);
  });

  it('normalises Saudi phone numbers', () => {
    expect(normalizePhone('+966 50 123 4567')).toBe('0501234567');
    expect(normalizePhone('0501234567')).toBe('0501234567');
    expect(normalizePhone('٠٥٠١٢٣٤٥٦٧')).toBe('0501234567');
    expect(normalizePhone('12345')).toBeNull();
  });
});
