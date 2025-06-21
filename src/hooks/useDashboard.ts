import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'

export const useDashboardSummary = () => {
  return useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_summary')
      
      if (error) throw error
      return data
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 0 // Don't use stale data
  })
}

export const useHourlySalesTrend = (date?: string) => {
  return useQuery({
    queryKey: ['hourly-sales-trend', date],
    queryFn: async () => {
      // Pass a Date object instead of a string to resolve function overloading ambiguity
      const dateParam = date ? new Date(date) : new Date()
      
      const { data, error } = await supabase.rpc('get_hourly_sales_trend', {
        p_date: dateParam
      })
      
      if (error) throw error
      return data
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 0 // Don't use stale data
  })
}

export const usePaymentMethodBreakdown = (startDate?: string, endDate?: string) => {
  return useQuery({
    queryKey: ['payment-method-breakdown', startDate, endDate],
    queryFn: async () => {
      const today = new Date()
      const start = startDate || today.toISOString().split('T')[0]
      const end = endDate || today.toISOString().split('T')[0]
      
      const { data, error } = await supabase
        .from('sales')
        .select('payment_method, total_amount')
        .gte('sale_date', start)
        .lte('sale_date', end + 'T23:59:59')
        .eq('payment_status', 'paid')
      
      if (error) throw error
      
      // Group by payment method
      const breakdown = data.reduce((acc, sale) => {
        const method = sale.payment_method
        if (!acc[method]) {
          acc[method] = { name: method.toUpperCase(), value: 0, count: 0 }
        }
        acc[method].value += sale.total_amount
        acc[method].count += 1
        return acc
      }, {} as Record<string, { name: string; value: number; count: number }>)
      
      return Object.values(breakdown)
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 0 // Don't use stale data
  })
}

export const useRecentSales = (limit: number = 5) => {
  return useQuery({
    queryKey: ['recent-sales', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select(`
          *,
          customer:customers(name, phone),
          sale_items:sale_items(
            *,
            product:products(name)
          )
        `)
        .order('sale_date', { ascending: false })
        .limit(limit)
      
      if (error) throw error
      return data
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 0 // Don't use stale data
  })
}