import { describe, it, expect, vi } from 'vitest';
import { formatPakistanDateTimeForDisplay } from '../utils/dateUtils';

// Mock the supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => ({
          data: {
            store_name: 'Test Store',
            address: 'Test Address',
            phone: '123456789',
            ntn: '1234567-8',
            receipt_footer: 'Thank you for shopping with us!'
          },
          error: null
        }))
      }))
    })),
    rpc: vi.fn(() => ({
      data: null,
      error: null
    }))
  }
}));

describe('Receipt Generation', () => {
  it('formats dates correctly for receipts', () => {
    const saleDate = new Date('2025-01-15T12:30:45Z');
    const formattedDate = formatPakistanDateTimeForDisplay(saleDate);
    expect(formattedDate).toBe('15-01-2025 17:30:45');
  });
});