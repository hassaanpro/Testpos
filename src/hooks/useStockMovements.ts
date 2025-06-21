import { useQuery } from '@tanstack/react-query'
import { supabase, StockMovement } from '../lib/supabase'

export const useStockMovements = (productId?: string, dateFrom?: string, dateTo?: string) => {
  return useQuery({
    queryKey: ['stock-movements', productId, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('stock_movements')
        .select(`
          *,
          product:products(*)
        `)
        .order('movement_date', { ascending: false })
      
      if (productId) query = query.eq('product_id', productId)
      if (dateFrom) query = query.gte('movement_date', dateFrom)
      if (dateTo) query = query.lte('movement_date', dateTo)
      
      const { data, error } = await query
      
      if (error) throw error
      return data as StockMovement[]
    }
  })
}

export const useProductStockHistory = (productId: string) => {
  return useQuery({
    queryKey: ['product-stock-history', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('product_id', productId)
        .order('movement_date', { ascending: true })
      
      if (error) throw error
      
      // Calculate running stock balance
      let runningBalance = 0
      const history = data.map(movement => {
        if (movement.movement_type === 'in') {
          runningBalance += movement.quantity
        } else {
          runningBalance -= Math.abs(movement.quantity)
        }
        
        return {
          ...movement,
          running_balance: runningBalance
        }
      })
      
      return history
    },
    enabled: !!productId
  })
}