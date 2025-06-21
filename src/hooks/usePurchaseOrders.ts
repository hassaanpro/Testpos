import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, PurchaseOrder, PurchaseItem } from '../lib/supabase'
import toast from 'react-hot-toast'

export const usePurchaseOrders = () => {
  return useQuery({
    queryKey: ['purchase-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(*),
          purchase_items:purchase_items(
            *,
            product:products(*)
          )
        `)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data as PurchaseOrder[]
    }
  })
}

export const usePurchaseOrder = (id: string) => {
  return useQuery({
    queryKey: ['purchase-order', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(*),
          purchase_items:purchase_items(
            *,
            product:products(*)
          )
        `)
        .eq('id', id)
        .single()
      
      if (error) throw error
      return data as PurchaseOrder
    },
    enabled: !!id
  })
}

export const useCreatePurchaseOrder = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (purchaseOrder: Omit<PurchaseOrder, 'id' | 'created_at' | 'updated_at' | 'supplier' | 'purchase_items'>) => {
      // Generate PO number
      const timestamp = Date.now()
      const po_number = `PO-${timestamp}`
      
      const { data, error } = await supabase
        .from('purchase_orders')
        .insert([{ ...purchaseOrder, po_number }])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      toast.success('Purchase order created successfully')
    },
    onError: (error) => {
      toast.error('Failed to create purchase order: ' + error.message)
    }
  })
}

export const useUpdatePurchaseOrder = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PurchaseOrder> & { id: string }) => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      toast.success('Purchase order updated successfully')
    },
    onError: (error) => {
      toast.error('Failed to update purchase order: ' + error.message)
    }
  })
}

export const usePurchaseItems = (purchaseOrderId: string) => {
  return useQuery({
    queryKey: ['purchase-items', purchaseOrderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_items')
        .select(`
          *,
          product:products(*)
        `)
        .eq('purchase_order_id', purchaseOrderId)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data as PurchaseItem[]
    },
    enabled: !!purchaseOrderId
  })
}

export const useAddPurchaseItem = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (item: Omit<PurchaseItem, 'id' | 'created_at' | 'product'>) => {
      const { data, error } = await supabase
        .from('purchase_items')
        .insert([item])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-items', variables.purchase_order_id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      toast.success('Item added to purchase order')
    },
    onError: (error) => {
      toast.error('Failed to add item: ' + error.message)
    }
  })
}

export const useReceivePurchaseItem = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      itemId, 
      receivedQuantity, 
      unitCost 
    }: { 
      itemId: string
      receivedQuantity: number
      unitCost: number
    }) => {
      // Get the purchase item details
      const { data: purchaseItem, error: itemError } = await supabase
        .from('purchase_items')
        .select('*, product:products(*)')
        .eq('id', itemId)
        .single()
      
      if (itemError) throw itemError
      
      // Update the received quantity
      const { error: updateError } = await supabase
        .from('purchase_items')
        .update({ received_quantity: receivedQuantity })
        .eq('id', itemId)
      
      if (updateError) throw updateError
      
      // Update product stock and cost using the weighted average function
      const { error: stockError } = await supabase.rpc('update_product_stock_and_cost', {
        product_id: purchaseItem.product_id,
        new_quantity: receivedQuantity,
        new_unit_cost: unitCost
      })
      
      if (stockError) throw stockError
      
      return purchaseItem
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-items'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] })
      toast.success(`Stock received and cost updated for ${data.product?.name}`)
    },
    onError: (error) => {
      toast.error('Failed to receive stock: ' + error.message)
    }
  })
}

export const useDeletePurchaseOrder = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'cancelled' })
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      toast.success('Purchase order cancelled')
    },
    onError: (error) => {
      toast.error('Failed to cancel purchase order: ' + error.message)
    }
  })
}

export const useSuppliers = () => {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('is_active', true)
        .order('name')
      
      if (error) throw error
      return data
    }
  })
}

export const useCreateSupplier = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (supplier: any) => {
      const { data, error } = await supabase
        .from('suppliers')
        .insert([supplier])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success('Supplier created successfully')
    },
    onError: (error) => {
      toast.error('Failed to create supplier: ' + error.message)
    }
  })
}