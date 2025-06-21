import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export interface Category {
  id: string
  name: string
  code: string
  description?: string
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  name: string
  sku: string
  barcode?: string
  category_id: string
  cost_price: number
  sale_price: number
  stock_quantity: number
  min_stock_level: number
  expiry_date?: string
  batch_number?: string
  supplier_id?: string
  tax_rate: number
  is_active: boolean
  created_at: string
  updated_at: string
  category?: Category
}

export interface Customer {
  id: string
  name: string
  phone?: string
  email?: string
  address?: string
  credit_limit: number
  current_balance: number
  loyalty_points: number
  total_outstanding_dues: number
  available_credit: number
  gender?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Sale {
  id: string
  invoice_number: string
  receipt_number: string
  customer_id?: string
  subtotal: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  payment_method: string
  payment_status: string
  cashier_name?: string
  receipt_printed: boolean
  receipt_printed_at?: string
  notes?: string
  sale_date: string
  created_at: string
  return_status?: string
  customer?: Customer
  sale_items?: SaleItem[]
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  quantity: number
  unit_price: number
  discount_amount: number
  total_price: number
  returned_quantity?: number
  is_returned?: boolean
  created_at: string
  product?: Product
}

export interface BnplTransaction {
  id: string
  sale_id: string
  customer_id: string
  original_amount: number
  amount_paid: number
  amount_due: number
  due_date?: string
  status: 'pending' | 'partially_paid' | 'paid' | 'overdue'
  created_at: string
  updated_at: string
  sale?: Sale
  customer?: Customer
}

export interface LoyaltyRule {
  id: string
  rule_name: string
  points_per_currency: number
  min_purchase_amount: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Expense {
  id: string
  category: string
  description: string
  amount: number
  expense_date: string
  receipt_number?: string
  notes?: string
  expense_cash_ledger_id?: string
  created_at: string
}

export interface Settings {
  id: string
  key: string
  value: string
  category: string
  description?: string
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: string
  name: string
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  credit_terms: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PurchaseOrder {
  id: string
  po_number: string
  supplier_id?: string
  status: 'pending' | 'received' | 'cancelled'
  subtotal: number
  tax_amount: number
  total_amount: number
  order_date: string
  expected_date?: string
  received_date?: string
  notes?: string
  created_at: string
  updated_at: string
  supplier?: Supplier
  purchase_items?: PurchaseItem[]
}

export interface PurchaseItem {
  id: string
  purchase_order_id: string
  product_id: string
  quantity: number
  unit_cost: number
  total_cost: number
  received_quantity: number
  created_at: string
  product?: Product
}

export interface StockMovement {
  id: string
  product_id: string
  movement_type: 'in' | 'out' | 'adjustment'
  quantity: number
  reference_type?: string
  reference_id?: string
  notes?: string
  movement_date: string
  created_at: string
  product?: Product
}

// New inventory management types
export interface InventoryReceipt {
  id: string
  product_id: string
  purchase_order_id?: string
  quantity: number
  unit_cost: number
  supplier_id?: string
  batch_number?: string
  expiry_date?: string
  notes?: string
  received_by: string
  received_at: string
  new_average_cost: number
  created_at: string
  product?: Product
  supplier?: Supplier
  purchase_order?: PurchaseOrder
}

export interface DamageReport {
  id: string
  product_id: string
  quantity: number
  reason: string
  cost_impact: number
  recorded_by: string
  recorded_at: string
  notes?: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  approved_by?: string
  approved_at?: string
  created_at: string
  product?: Product
}

export interface ProfitAnalysis {
  product_id: string
  stock_value: number
  average_cost: number
  selling_price: number
  profit_per_unit: number
  profit_margin: number
  stock_quantity: number
  last_calculated: string
  product?: Product
}

// Returns and Refunds types
export interface Return {
  id: string
  sale_id: string
  customer_id?: string
  return_date: string
  return_reason: string
  return_status: 'pending' | 'approved' | 'rejected' | 'completed'
  refund_amount: number
  refund_method: string
  processed_by: string
  notes?: string
  created_at: string
  updated_at: string
  sale?: Sale
  customer?: Customer
  return_items?: ReturnItem[]
}

export interface ReturnItem {
  id: string
  return_id: string
  sale_item_id: string
  product_id: string
  quantity: number
  unit_price: number
  refund_price: number
  condition: 'good' | 'damaged' | 'defective'
  created_at: string
  product?: Product
  sale_item?: SaleItem
}

export interface RefundTransaction {
  id: string
  return_id?: string
  sale_id?: string
  customer_id?: string
  amount: number
  payment_method: string
  transaction_date: string
  status: 'pending' | 'completed' | 'failed'
  notes?: string
  created_at: string
  return?: Return
  sale?: Sale
  customer?: Customer
}

export interface ReturnableItem {
  sale_item_id: string
  product_id: string
  product_name: string
  product_sku: string
  quantity_sold: number
  quantity_returned: number
  quantity_returnable: number
  unit_price: number
  total_price: number
}

export interface ReturnEligibility {
  is_eligible: boolean
  reason: string
  days_since_sale: number
  return_window_days: number
}

// Sales for Returns types
export interface SaleForReturns {
  sale_id: string
  receipt_number: string
  invoice_number: string
  sale_date: string
  customer_id?: string
  customer_name?: string
  customer_phone?: string
  customer_email?: string
  total_amount: number
  subtotal: number
  discount_amount: number
  tax_amount: number
  payment_method: string
  payment_status: string
  cashier_name?: string
  return_status: string
  items_count: number
  returnable_items_count: number
  days_since_sale: number
}

// Receipt and payment confirmation types
export interface ReceiptData {
  id: string
  receipt_number: string
  invoice_number: string
  sale_date: string
  total_amount: number
  subtotal: number
  discount_amount: number
  tax_amount: number
  payment_method: string
  payment_status: string
  customer?: {
    name: string
    phone?: string
    email?: string
  }
  items: {
    name: string
    quantity: number
    unit_price: number
    total_price: number
  }[]
}

export interface BnplPaymentConfirmationData {
  confirmation_number: string
  bnpl_transaction_id: string
  original_sale_invoice: string
  original_sale_receipt: string
  customer: {
    name: string
    phone?: string
    email?: string
  }
  payment_amount: number
  payment_method: string
  payment_date: string
  remaining_amount: number
  transaction_status: string
}