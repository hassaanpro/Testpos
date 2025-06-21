import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, InventoryReceipt } from '../lib/supabase'
import toast from 'react-hot-toast'

export const useInventoryReceipts = (dateFrom?: string, dateTo?: string, productId?: string) => {
  return useQuery({
    queryKey: ['inventory-receipts', dateFrom, dateTo, productId],
    queryFn: async () => {
      let query = supabase
        .from('inventory_receipts')
        .select(`
          *,
          product:products(*),
          supplier:suppliers(*),
          purchase_order:purchase_orders(*)
        `)
        .order('received_at', { ascending: false })
      
      if (dateFrom) query = query.gte('received_at', dateFrom)
      if (dateTo) query = query.lte('received_at', dateTo)
      if (productId) query = query.eq('product_id', productId)
      
      const { data, error } = await query
      
      if (error) throw error
      return data as InventoryReceipt[]
    }
  })
}

export const useCreateInventoryReceipt = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (receipt: Omit<InventoryReceipt, 'id' | 'created_at' | 'new_average_cost' | 'product' | 'supplier' | 'purchase_order'>) => {
      // Use the enhanced update_product_stock_and_cost function
      const { error } = await supabase.rpc('update_product_stock_and_cost', {
        p_product_id: receipt.product_id,
        p_new_quantity: receipt.quantity,
        p_new_unit_cost: receipt.unit_cost,
        p_received_by: receipt.received_by,
        p_purchase_order_id: receipt.purchase_order_id,
        p_supplier_id: receipt.supplier_id,
        p_batch_number: receipt.batch_number,
        p_expiry_date: receipt.expiry_date,
        p_notes: receipt.notes
      })
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-receipts'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] })
      queryClient.invalidateQueries({ queryKey: ['profit-analysis'] })
      toast.success('Stock received and inventory updated successfully')
    },
    onError: (error) => {
      toast.error('Failed to receive stock: ' + error.message)
    }
  })
}

export const useInventoryReceiptsByProduct = (productId: string) => {
  return useQuery({
    queryKey: ['inventory-receipts-by-product', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_receipts')
        .select(`
          *,
          supplier:suppliers(name),
          purchase_order:purchase_orders(po_number)
        `)
        .eq('product_id', productId)
        .order('received_at', { ascending: false })
      
      if (error) throw error
      return data as InventoryReceipt[]
    },
    enabled: !!productId
  })
}