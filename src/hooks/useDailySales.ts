import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { getPakistanDayRange } from '../utils/dateUtils'

export const useDailySales = () => {
  // Get current date in YYYY-MM-DD format for the query key
  const today = new Date().toISOString().split('T')[0]
  
  return useQuery({
    queryKey: ['daily-sales', today], // Include today's date in query key
    queryFn: async () => {
      // Use Pakistan Standard Time for day range calculation
      const { startOfDay, endOfDay } = getPakistanDayRange(new Date())
      
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