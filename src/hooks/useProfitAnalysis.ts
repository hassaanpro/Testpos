import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, ProfitAnalysis } from '../lib/supabase'
import toast from 'react-hot-toast'

export const useProfitAnalysis = () => {
  return useQuery({
    queryKey: ['profit-analysis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profit_analysis')
        .select(`
          *,
          product:products(*)
        `)
        .order('profit_margin', { ascending: false })
      
      if (error) throw error
      return data as ProfitAnalysis[]
    }
  })
}

export const useProductProfitAnalysis = (productId: string) => {
  return useQuery({
    queryKey: ['profit-analysis', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profit_analysis')
        .select(`
          *,
          product:products(*)
        `)
        .eq('product_id', productId)
        .single()
      
      if (error) throw error
      return data as ProfitAnalysis
    },
    enabled: !!productId
  })
}

export const useUpdateProfitAnalysis = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (productId?: string) => {
      if (productId) {
        // Update specific product
        const { error } = await supabase.rpc('update_profit_analysis', {
          p_product_id: productId
        })
        if (error) throw error
      } else {
        // Update all products
        const { error } = await supabase.rpc('update_all_profit_analysis')
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profit-analysis'] })
      toast.success('Profit analysis updated successfully')
    },
    onError: (error) => {
      toast.error('Failed to update profit analysis: ' + error.message)
    }
  })
}

export const useProfitAnalysisSummary = () => {
  return useQuery({
    queryKey: ['profit-analysis-summary'],
    queryFn: async () => {
      // Get profit analysis data
      const { data: profitData, error: profitError } = await supabase
        .from('profit_analysis')
        .select('*')
      
      if (profitError) throw profitError
      
      // Get products data for retail value calculation
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('stock_quantity, sale_price, is_active')
        .eq('is_active', true)
      
      if (productsError) throw productsError
      
      // Calculate total retail value
      const totalRetailValue = productsData.reduce((sum, product) => 
        sum + (product.stock_quantity * product.sale_price), 0
      )
      
      const summary = {
        totalStockValue: profitData.reduce((sum, item) => sum + item.stock_value, 0),
        totalRetailValue,
        totalProducts: profitData.length,
        averageProfitMargin: profitData.length > 0 
          ? profitData.reduce((sum, item) => sum + item.profit_margin, 0) / profitData.length 
          : 0,
        totalPotentialProfit: totalRetailValue - profitData.reduce((sum, item) => sum + item.stock_value, 0),
        highProfitProducts: profitData.filter(item => item.profit_margin > 30).length,
        lowProfitProducts: profitData.filter(item => item.profit_margin < 10).length,
        negativeMarginProducts: profitData.filter(item => item.profit_margin < 0).length,
        totalStockQuantity: profitData.reduce((sum, item) => sum + item.stock_quantity, 0)
      }
      
      return summary
    }
  })
}

export const useTopProfitableProducts = (limit: number = 10) => {
  return useQuery({
    queryKey: ['top-profitable-products', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profit_analysis')
        .select(`
          *,
          product:products(*)
        `)
        .gt('stock_quantity', 0)
        .order('profit_margin', { ascending: false })
        .limit(limit)
      
      if (error) throw error
      return data as ProfitAnalysis[]
    }
  })
}

export const useLowProfitProducts = (threshold: number = 10) => {
  return useQuery({
    queryKey: ['low-profit-products', threshold],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profit_analysis')
        .select(`
          *,
          product:products(*)
        `)
        .lt('profit_margin', threshold)
        .gt('stock_quantity', 0)
        .order('profit_margin', { ascending: true })
      
      if (error) throw error
      return data as ProfitAnalysis[]
    }
  })
}

export const useInventoryValueTrend = () => {
  return useQuery({
    queryKey: ['inventory-value-trend'],
    queryFn: async () => {
      // Get last 30 days of inventory receipts for trend analysis
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const { data, error } = await supabase
        .from('inventory_receipts')
        .select('received_at, quantity, unit_cost, new_average_cost')
        .gte('received_at', thirtyDaysAgo.toISOString())
        .order('received_at', { ascending: true })
      
      if (error) throw error
      
      // Group by date and calculate daily inventory value changes
      const dailyChanges = data.reduce((acc, receipt) => {
        const date = receipt.received_at.split('T')[0]
        if (!acc[date]) {
          acc[date] = { date, valueAdded: 0, quantityAdded: 0 }
        }
        acc[date].valueAdded += receipt.quantity * receipt.unit_cost
        acc[date].quantityAdded += receipt.quantity
        return acc
      }, {} as Record<string, { date: string; valueAdded: number; quantityAdded: number }>)
      
      return Object.values(dailyChanges)
    }
  })
}