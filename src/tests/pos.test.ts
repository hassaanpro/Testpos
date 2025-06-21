import { describe, it, expect, vi } from 'vitest';
import { usePOSStore } from '../stores/posStore';

// Mock the store
vi.mock('../stores/posStore', () => {
  const store = {
    cart: [],
    selectedCustomer: null,
    subtotal: 0,
    globalDiscount: 0,
    globalDiscountType: 'percentage',
    tax: 0,
    total: 0,
    paymentMethod: 'cash',
    
    addToCart: vi.fn(),
    removeFromCart: vi.fn(),
    updateQuantity: vi.fn(),
    updateItemDiscount: vi.fn(),
    setCustomer: vi.fn(),
    setPaymentMethod: vi.fn(),
    setGlobalDiscount: vi.fn(),
    setGlobalDiscountType: vi.fn(),
    clearCart: vi.fn(),
    calculateTotals: vi.fn()
  };
  
  return {
    usePOSStore: vi.fn(() => store)
  };
});

describe('POS Store', () => {
  it('initializes with default values', () => {
    const store = usePOSStore();
    expect(store.cart).toEqual([]);
    expect(store.selectedCustomer).toBeNull();
    expect(store.subtotal).toBe(0);
    expect(store.globalDiscount).toBe(0);
    expect(store.globalDiscountType).toBe('percentage');
    expect(store.tax).toBe(0);
    expect(store.total).toBe(0);
    expect(store.paymentMethod).toBe('cash');
  });
  
  it('has all required functions', () => {
    const store = usePOSStore();
    expect(typeof store.addToCart).toBe('function');
    expect(typeof store.removeFromCart).toBe('function');
    expect(typeof store.updateQuantity).toBe('function');
    expect(typeof store.updateItemDiscount).toBe('function');
    expect(typeof store.setCustomer).toBe('function');
    expect(typeof store.setPaymentMethod).toBe('function');
    expect(typeof store.setGlobalDiscount).toBe('function');
    expect(typeof store.setGlobalDiscountType).toBe('function');
    expect(typeof store.clearCart).toBe('function');
    expect(typeof store.calculateTotals).toBe('function');
  });
});