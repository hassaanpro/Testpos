import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPakistanDateTimeForDisplay, formatPakistanDate } from '../utils/dateUtils';

describe('Currency Formatting', () => {
  it('formats currency correctly', () => {
    expect(formatCurrency(1000)).toBe('₨ 1,000.00');
    expect(formatCurrency(1234.56)).toBe('₨ 1,234.56');
    expect(formatCurrency(0)).toBe('₨ 0.00');
    expect(formatCurrency(999999.99)).toBe('₨ 999,999.99');
  });
});

describe('Date Formatting', () => {
  it('formats dates in Pakistan timezone correctly', () => {
    const testDate = new Date('2025-01-15T12:30:45Z');
    expect(formatPakistanDate(testDate)).toBe('15-01-2025');
    expect(formatPakistanDateTimeForDisplay(testDate)).toBe('15-01-2025 17:30:45');
  });
});