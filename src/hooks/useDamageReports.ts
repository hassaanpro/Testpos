import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, DamageReport } from '../lib/supabase'
import toast from 'react-hot-toast'

export const useDamageReports = (status?: string, dateFrom?: string, dateTo?: string) => {
  return useQuery({
    queryKey: ['damage-reports', status, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('damage_reports')
        .select(`
          *,
          product:products(*)
        `)
        .order('recorded_at', { ascending: false })
      
      if (status) query = query.eq('status', status)
      if (dateFrom) query = query.gte('recorded_at', dateFrom)
      if (dateTo) query = query.lte('recorded_at', dateTo)
      
      const { data, error } = await query
      
      if (error) throw error
      return data as DamageReport[]
    }
  })
}

export const useCreateDamageReport = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (report: Omit<DamageReport, 'id' | 'created_at' | 'status' | 'approved_by' | 'approved_at' | 'product' | 'cost_impact'>) => {
      // Calculate cost impact based on current product cost
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('cost_price')
        .eq('id', report.product_id)
        .single()
      
      if (productError) throw productError
      
      const cost_impact = product.cost_price * report.quantity
      
      const { data, error } = await supabase
        .from('damage_reports')
        .insert([{
          ...report,
          cost_impact,
          status: 'PENDING'
        }])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damage-reports'] })
      toast.success('Damage report created successfully')
    },
    onError: (error) => {
      toast.error('Failed to create damage report: ' + error.message)
    }
  })
}

export const useApproveDamageReport = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, approvedBy }: { id: string; approvedBy: string }) => {
      const { error } = await supabase.rpc('approve_damage_report', {
        p_damage_report_id: id,
        p_approved_by_user: approvedBy
      })
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damage-reports'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] })
      queryClient.invalidateQueries({ queryKey: ['profit-analysis'] })
      toast.success('Damage report approved and stock adjusted')
    },
    onError: (error) => {
      toast.error('Failed to approve damage report: ' + error.message)
    }
  })
}

export const useRejectDamageReport = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, rejectedBy }: { id: string; rejectedBy: string }) => {
      const { error } = await supabase.rpc('reject_damage_report', {
        p_damage_report_id: id,
        p_rejected_by_user: rejectedBy
      })
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damage-reports'] })
      toast.success('Damage report rejected')
    },
    onError: (error) => {
      toast.error('Failed to reject damage report: ' + error.message)
    }
  })
}

export const usePendingDamageReports = () => {
  return useQuery({
    queryKey: ['pending-damage-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('damage_reports')
        .select(`
          *,
          product:products(*)
        `)
        .eq('status', 'PENDING')
        .order('recorded_at', { ascending: false })
      
      if (error) throw error
      return data as DamageReport[]
    }
  })
}

export const useTotalDamageCost = (dateFrom?: string, dateTo?: string) => {
  return useQuery({
    queryKey: ['total-damage-cost', dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('damage_reports')
        .select('cost_impact, status, recorded_at')
      
      if (dateFrom) query = query.gte('recorded_at', dateFrom)
      if (dateTo) query = query.lte('recorded_at', dateTo)
      
      const { data, error } = await query
      
      if (error) throw error
      
      const summary = {
        totalDamageCost: data.reduce((sum, report) => sum + report.cost_impact, 0),
        approvedDamageCost: data
          .filter(report => report.status === 'APPROVED')
          .reduce((sum, report) => sum + report.cost_impact, 0),
        pendingDamageCost: data
          .filter(report => report.status === 'PENDING')
          .reduce((sum, report) => sum + report.cost_impact, 0),
        totalReports: data.length,
        approvedReports: data.filter(report => report.status === 'APPROVED').length,
        pendingReports: data.filter(report => report.status === 'PENDING').length
      }
      
      return summary
    }
  })
}