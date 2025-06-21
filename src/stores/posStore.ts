import { create } from 'zustand'
import { Product, Customer } from '../lib/supabase'

interface CartItem {
  product: Product
  quantity: number
  discount: number
  discountType: 'percentage' | 'amount'
}

interface POSState {
  cart: CartItem[]
  selectedCustomer: Customer | null
  subtotal: number
  globalDiscount: number
  globalDiscountType: 'percentage' | 'amount'
  tax: number
  taxRate: number
  total: number
  paymentMethod: 'cash' | 'card' | 'bnpl'
  
  // Actions
  addToCart: (product: Product, quantity?: number) => void
  removeFromCart: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  updateItemDiscount: (productId: string, discount: number, discountType: 'percentage' | 'amount') => void
  setCustomer: (customer: Customer | null) => void
  setPaymentMethod: (method: 'cash' | 'card' | 'bnpl') => void
  setGlobalDiscount: (discount: number) => void
  setGlobalDiscountType: (type: 'percentage' | 'amount') => void
  setTaxRate: (rate: number) => void
  clearCart: () => void
  calculateTotals: () => void
}

export const usePOSStore = create<POSState>((set, get) => ({
  cart: [],
  selectedCustomer: null,
  subtotal: 0,
  globalDiscount: 0,
  globalDiscountType: 'percentage',
  tax: 0,
  taxRate: 17, // Default tax rate, will be updated from settings
  total: 0,
  paymentMethod: 'cash',

  addToCart: (product, quantity = 1) => {
    const { cart } = get()
    const existingItem = cart.find(item => item.product.id === product.id)
    
    if (existingItem) {
      get().updateQuantity(product.id, existingItem.quantity + quantity)
    } else {
      set(state => ({
        cart: [...state.cart, { 
          product, 
          quantity, 
          discount: 0, 
          discountType: 'percentage' 
        }]
      }))
    }
    get().calculateTotals()
  },

  removeFromCart: (productId) => {
    set(state => ({
      cart: state.cart.filter(item => item.product.id !== productId)
    }))
    get().calculateTotals()
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeFromCart(productId)
      return
    }
    
    set(state => ({
      cart: state.cart.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    }))
    get().calculateTotals()
  },

  updateItemDiscount: (productId, discount, discountType) => {
    set(state => ({
      cart: state.cart.map(item =>
        item.product.id === productId ? { ...item, discount, discountType } : item
      )
    }))
    get().calculateTotals()
  },

  setCustomer: (customer) => {
    set({ selectedCustomer: customer })
  },

  setPaymentMethod: (method) => {
    set({ paymentMethod: method })
  },

  setGlobalDiscount: (discount) => {
    set({ globalDiscount: discount })
    get().calculateTotals()
  },

  setGlobalDiscountType: (type) => {
    set({ globalDiscountType: type })
    get().calculateTotals()
  },

  setTaxRate: (rate) => {
    set({ taxRate: rate })
    get().calculateTotals()
  },

  clearCart: () => {
    set({
      cart: [],
      selectedCustomer: null,
      subtotal: 0,
      globalDiscount: 0,
      globalDiscountType: 'percentage',
      tax: 0,
      total: 0,
      paymentMethod: 'cash'
    })
  },

  calculateTotals: () => {
    const { cart, globalDiscount, globalDiscountType, taxRate } = get()
    
    // Calculate subtotal with item-level discounts
    let subtotal = 0
    cart.forEach(item => {
      const itemTotal = item.product.sale_price * item.quantity
      let itemDiscount = 0
      
      if (item.discountType === 'percentage') {
        itemDiscount = (itemTotal * item.discount) / 100
      } else {
        itemDiscount = item.discount
      }
      
      subtotal += itemTotal - itemDiscount
    })
    
    // Apply global discount
    let globalDiscountAmount = 0
    if (globalDiscountType === 'percentage') {
      globalDiscountAmount = (subtotal * globalDiscount) / 100
    } else {
      globalDiscountAmount = globalDiscount
    }
    
    const discountedSubtotal = subtotal - globalDiscountAmount
    
    // Calculate tax on discounted amount using the dynamic tax rate
    const tax = (discountedSubtotal * taxRate) / 100
    const total = discountedSubtotal + tax
    
    set({ 
      subtotal: cart.reduce((sum, item) => sum + (item.product.sale_price * item.quantity), 0), // Original subtotal for display
      tax, 
      total: Math.max(0, total) // Ensure total is never negative
    })
  }
}))