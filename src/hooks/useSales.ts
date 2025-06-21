import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Sale, SaleItem } from '../lib/supabase'
import toast from 'react-hot-toast'

export const useSales = (dateFrom?: string, dateTo?: string) => {
  return useQuery({
    queryKey: ['sales', dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('sales')
        .select(`
          *,
          customer:customers(*),
          sale_items:sale_items(
            *,
            product:products(*)
          )
        `)
        .order('created_at', { ascending: false })
      
      if (dateFrom) query = query.gte('sale_date', dateFrom)
      if (dateTo) query = query.lte('sale_date', dateTo + 'T23:59:59')
      
      const { data, error } = await query
      
      if (error) throw error
      return data as Sale[]
    },
    refetchInterval: 30000 // Refetch every 30 seconds
  })
}

export const useCreateSale = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (saleData: {
      customer_id?: string
      items: { product_id: string; quantity: number; unit_price: number; discount_amount: number }[]
      subtotal: number
      discount_amount: number
      tax_amount: number
      total_amount: number
      payment_method: string
      payment_status?: string
      cashier_name?: string
    }) => {
      // Generate invoice number
      const timestamp = Date.now()
      const invoice_number = `INV-${timestamp}`
      
      // Generate receipt number using database function
      const { data: receiptNumberData, error: receiptError } = await supabase.rpc('generate_receipt_number')
      if (receiptError) throw receiptError
      
      // Create sale
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert([{
          invoice_number,
          receipt_number: receiptNumberData,
          customer_id: saleData.customer_id,
          subtotal: saleData.subtotal,
          discount_amount: saleData.discount_amount,
          tax_amount: saleData.tax_amount,
          total_amount: saleData.total_amount,
          payment_method: saleData.payment_method,
          payment_status: saleData.payment_status || 'paid',
          cashier_name: saleData.cashier_name || 'System'
        }])
        .select()
        .single()
      
      if (saleError) throw saleError
      
      // Create sale items
      const saleItems = saleData.items.map(item => ({
        sale_id: sale.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_amount: item.discount_amount,
        total_price: (item.unit_price * item.quantity) - item.discount_amount
      }))
      
      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems)
      
      if (itemsError) throw itemsError
      
      // Update product stock
      for (const item of saleData.items) {
        const { error: stockError } = await supabase.rpc('update_product_stock', {
          product_id: item.product_id,
          quantity_sold: item.quantity
        })
        if (stockError) console.error('Stock update error:', stockError)
        
        // Record stock movement
        await supabase
          .from('stock_movements')
          .insert([{
            product_id: item.product_id,
            movement_type: 'out',
            quantity: -item.quantity,
            reference_type: 'sale',
            reference_id: sale.id
          }])
      }
      
      // Handle BNPL transaction if payment method is BNPL
      if (saleData.payment_method === 'bnpl' && saleData.customer_id) {
        const { error: bnplError } = await supabase.rpc('create_bnpl_transaction', {
          p_sale_id: sale.id,
          p_customer_id: saleData.customer_id,
          p_amount: saleData.total_amount
        })
        
        if (bnplError) {
          console.error('BNPL transaction error:', bnplError)
          // Don't fail the sale, but log the error
        }
      }
      
      // Award loyalty points for immediate payments (cash/card)
      if ((saleData.payment_method === 'cash' || saleData.payment_method === 'card') && saleData.customer_id) {
        const { error: loyaltyError } = await supabase.rpc('award_loyalty_points', {
          p_customer_id: saleData.customer_id,
          p_purchase_amount: saleData.total_amount
        })
        
        if (loyaltyError) {
          console.error('Loyalty points error:', loyaltyError)
          // Don't fail the sale, but log the error
        }
      }
      
      return sale
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['daily-sales'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['customer-financial-summary'] })
      toast.success('Sale completed successfully')
    },
    onError: (error) => {
      toast.error('Failed to complete sale: ' + error.message)
    }
  })
}

export const useDailySales = () => {
  // Get current date in YYYY-MM-DD format for the query key
  const today = new Date().toISOString().split('T')[0]
  
  return useQuery({
    queryKey: ['daily-sales', today], // Include today's date in query key
    queryFn: async () => {
      // Calculate start and end of today in local timezone
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      
      const endOfDay = new Date()
      endOfDay.setHours(23, 59, 59, 999)
      
      const { data, error } = await supabase
        .from('sales')
        .select('total_amount, payment_status')
        .gte('sale_date', startOfDay.toISOString())
        .lte('sale_date', endOfDay.toISOString())
      
      if (error) throw error
      
      // Only count paid sales for revenue
      const paidSales = data.filter(sale => sale.payment_status === 'paid')
      const total = paidSales.reduce((sum, sale) => sum + sale.total_amount, 0)
      
      return { 
        total, 
        count: paidSales.length,
        totalTransactions: data.length // All transactions including BNPL
      }
    },
    // Refetch every 30 seconds to keep data fresh during the day
    refetchInterval: 30000,
    // Keep data fresh and don't use stale data
    staleTime: 0
  })
}

export const useReceiptHistory = (
  startDate?: string,
  endDate?: string,
  customerFilter?: string,
  paymentMethodFilter?: string
) => {
  return useQuery({
    queryKey: ['receipt-history', startDate, endDate, customerFilter, paymentMethodFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_receipt_history', {
        p_start_date: startDate || null,
        p_end_date: endDate ? endDate + 'T23:59:59' : null,
        p_customer_filter: customerFilter || null,
        p_payment_method_filter: paymentMethodFilter || null,
        p_limit: 100
      })
      
      if (error) throw error
      return data
    },
    refetchInterval: 30000 // Refetch every 30 seconds
  })
}

export const useDailyReceiptStats = (date?: string) => {
  return useQuery({
    queryKey: ['daily-receipt-stats', date],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_daily_receipt_stats', {
        p_date: date || new Date().toISOString().split('T')[0]
      })
      
      if (error) throw error
      return data[0]
    },
    refetchInterval: 30000 // Refetch every 30 seconds
  })
}

export const useMarkReceiptPrinted = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (saleId: string) => {
      const { error } = await supabase.rpc('mark_receipt_printed', {
        p_sale_id: saleId
      })
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['receipt-history'] })
      queryClient.invalidateQueries({ queryKey: ['daily-receipt-stats'] })
    }
  })
}

// Get sales summary for dashboard
export const useSalesSummary = () => {
  return useQuery({
    queryKey: ['sales-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_summary')
      
      if (error) throw error
      return data
    },
    refetchInterval: 30000 // Refetch every 30 seconds
  })
}