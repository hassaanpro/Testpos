import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Product } from '../lib/supabase'
import toast from 'react-hot-toast'

export const useProducts = () => {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          category:categories(*)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data as Product[]
    }
  })
}

export const useCreateProduct = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
      // Server-side barcode validation
      if (product.barcode && product.barcode.trim() !== '') {
        const barcode = product.barcode.trim()
        
        // Validate barcode format (numbers only, 8-13 digits)
        if (!/^\d+$/.test(barcode)) {
          throw new Error('Barcode must contain only numbers.')
        }
        
        if (barcode.length < 8 || barcode.length > 13) {
          throw new Error('Barcode must be between 8 and 13 digits long.')
        }
        
        // Check if barcode already exists
        const { data: existingProduct, error: checkError } = await supabase
          .from('products')
          .select('id')
          .eq('barcode', barcode)
          .eq('is_active', true)
          .single()
        
        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError
        }
        
        if (existingProduct) {
          throw new Error('A product with this barcode already exists.')
        }
      }
      
      // Generate SKU
      const { data: category } = await supabase
        .from('categories')
        .select('code')
        .eq('id', product.category_id)
        .single()
      
      const timestamp = Date.now().toString().slice(-4)
      const sku = `${category?.code || 'GEN'}-${timestamp}`
      
      // Prepare product data with proper barcode handling
      const productData = {
        ...product,
        sku,
        barcode: product.barcode && product.barcode.trim() !== '' ? product.barcode.trim() : null
      }
      
      const { data, error } = await supabase
        .from('products')
        .insert([productData])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Product created successfully')
    },
    onError: (error) => {
      toast.error('Failed to create product: ' + error.message)
    }
  })
}

export const useUpdateProduct = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Product> & { id: string }) => {
      // Server-side barcode validation for updates
      if (updates.barcode !== undefined) {
        if (updates.barcode && updates.barcode.trim() !== '') {
          const barcode = updates.barcode.trim()
          
          // Validate barcode format (numbers only, 8-13 digits)
          if (!/^\d+$/.test(barcode)) {
            throw new Error('Barcode must contain only numbers.')
          }
          
          if (barcode.length < 8 || barcode.length > 13) {
            throw new Error('Barcode must be between 8 and 13 digits long.')
          }
          
          // Check if barcode already exists (excluding current product)
          const { data: existingProduct, error: checkError } = await supabase
            .from('products')
            .select('id')
            .eq('barcode', barcode)
            .eq('is_active', true)
            .neq('id', id)
            .single()
          
          if (checkError && checkError.code !== 'PGRST116') {
            throw checkError
          }
          
          if (existingProduct) {
            throw new Error('A product with this barcode already exists.')
          }
          
          updates.barcode = barcode
        } else {
          updates.barcode = null
        }
      }
      
      const { data, error } = await supabase
        .from('products')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Product updated successfully')
    },
    onError: (error) => {
      toast.error('Failed to update product: ' + error.message)
    }
  })
}

export const useDeleteProduct = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('products')
        .update({ is_active: false })
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Product deleted successfully')
    },
    onError: (error) => {
      toast.error('Failed to delete product: ' + error.message)
    }
  })
}

export const useLowStockProducts = () => {
  return useQuery({
    queryKey: ['low-stock-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .gt('stock_quantity', 0)
      
      if (error) throw error
      
      // Filter client-side to compare stock_quantity with min_stock_level
      return (data as Product[]).filter(product => 
        product.stock_quantity <= (product.min_stock_level || 10)
      )
    }
  })
}

export const useExpiredProducts = () => {
  return useQuery({
    queryKey: ['expired-products'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .not('expiry_date', 'is', null)
        .lte('expiry_date', today)
      
      if (error) throw error
      return data as Product[]
    }
  })
}

export const useNearExpiryProducts = () => {
  return useQuery({
    queryKey: ['near-expiry-products'],
    queryFn: async () => {
      const today = new Date()
      const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .not('expiry_date', 'is', null)
        .gt('expiry_date', today.toISOString().split('T')[0])
        .lte('expiry_date', thirtyDaysFromNow.toISOString().split('T')[0])
      
      if (error) throw error
      return data as Product[]
    }
  })
}

export const useOutOfStockProducts = () => {
  return useQuery({
    queryKey: ['out-of-stock-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .eq('stock_quantity', 0)
      
      if (error) throw error
      return data as Product[]
    }
  })
}