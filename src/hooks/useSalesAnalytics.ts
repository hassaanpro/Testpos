import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { subDays, format } from 'date-fns'

interface SalesTrendData {
  period_label: string
  period_date: string
  total_sales: number
  total_transactions: number
  average_order_value: number
  paid_transactions: number
  bnpl_transactions: number
}

interface AOVData {
  total_sales: number
  total_transactions: number
  average_order_value: number
  paid_transactions: number
  bnpl_transactions: number
  total_items_sold: number
}

interface SalesComparison {
  current_sales: number
  current_transactions: number
  current_aov: number
  previous_sales: number
  previous_transactions: number
  previous_aov: number
  sales_change_percent: number
  transactions_change_percent: number
  aov_change_percent: number
}

interface HourlySalesData {
  hour_label: string
  hour_value: number
  total_sales: number
  total_transactions: number
  average_order_value: number
}

interface SalesSummaryMetrics {
  total_revenue: number
  total_transactions: number
  average_order_value: number
  total_items_sold: number
  unique_customers: number
  returning_customers: number
  peak_hour: number
  peak_day: string
  conversion_rate: number
}

export const useSalesTrend = (
  startDate: string, 
  endDate: string, 
  groupBy: 'hour' | 'day' | 'month' = 'day'
) => {
  return useQuery({
    queryKey: ['sales-trend', startDate, endDate, groupBy],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sales_trend', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_group_by: groupBy
      })
      
      if (error) throw error
      return data as SalesTrendData[]
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 0
  })
}

export const useAverageOrderValue = (startDate: string, endDate: string) => {
  return useQuery({
    queryKey: ['average-order-value', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_average_order_value', {
        p_start_date: startDate,
        p_end_date: endDate
      })
      
      if (error) throw error
      return data[0] as AOVData
    },
    refetchInterval: 30000,
    staleTime: 0
  })
}

export const useSalesComparison = (
  currentStart: string,
  currentEnd: string,
  previousStart: string,
  previousEnd: string
) => {
  return useQuery({
    queryKey: ['sales-comparison', currentStart, currentEnd, previousStart, previousEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sales_comparison', {
        p_current_start: currentStart,
        p_current_end: currentEnd,
        p_previous_start: previousStart,
        p_previous_end: previousEnd
      })
      
      if (error) throw error
      return data[0] as SalesComparison
    },
    refetchInterval: 30000,
    staleTime: 0
  })
}

export const useHourlySalesTrend = (date: string) => {
  return useQuery({
    queryKey: ['hourly-sales-trend', date],
    queryFn: async () => {
      // Convert string date to Date object to resolve function overloading ambiguity
      const dateParam = new Date(date + 'T00:00:00')
      
      const { data, error } = await supabase.rpc('get_hourly_sales_trend', {
        p_date: dateParam
      })
      
      if (error) throw error
      return data as HourlySalesData[]
    },
    refetchInterval: 30000,
    staleTime: 0
  })
}

export const useSalesSummaryMetrics = (startDate: string, endDate: string) => {
  return useQuery({
    queryKey: ['sales-summary-metrics', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sales_summary_metrics', {
        p_start_date: startDate,
        p_end_date: endDate
      })
      
      if (error) throw error
      return data[0] as SalesSummaryMetrics
    },
    refetchInterval: 30000,
    staleTime: 0
  })
}

export const usePeakHoursAnalysis = (startDate: string, endDate: string) => {
  return useQuery({
    queryKey: ['peak-hours-analysis', startDate, endDate],
    queryFn: async () => {
      // Pass the date strings directly - the server-side function now expects text parameters
      const { data, error } = await supabase.rpc('get_peak_hours_analysis', {
        p_start_date: startDate,
        p_end_date: endDate
      })
      
      if (error) throw error
      return data as Array<{
        hour_value: number
        hour_label: string
        avg_sales: number
        avg_transactions: number
        total_days: number
      }>
    },
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000
  })
}

// Helper function to calculate date ranges for comparison
export const getComparisonDates = (startDate: string, endDate: string) => {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  
  const previousEnd = subDays(start, 1)
  const previousStart = subDays(previousEnd, daysDiff - 1)
  
  return {
    previousStart: format(previousStart, 'yyyy-MM-dd'),
    previousEnd: format(previousEnd, 'yyyy-MM-dd')
  }
}

// Real-time analytics hook with auto-refresh
export const useRealTimeSalesAnalytics = (
  startDate: string, 
  endDate: string, 
  viewType: 'hour' | 'day' | 'month' = 'day'
) => {
  const { previousStart, previousEnd } = getComparisonDates(startDate, endDate)
  
  const salesTrend = useSalesTrend(startDate, endDate, viewType)
  const aovData = useAverageOrderValue(startDate, endDate)
  const comparison = useSalesComparison(startDate, endDate, previousStart, previousEnd)
  const summaryMetrics = useSalesSummaryMetrics(startDate, endDate)
  const peakHours = usePeakHoursAnalysis(startDate, endDate)
  
  // For hourly view, also get today's hourly data
  const todayHourly = useHourlySalesTrend(format(new Date(), 'yyyy-MM-dd'))
  
  return {
    salesTrend,
    aovData,
    comparison,
    summaryMetrics,
    peakHours,
    todayHourly: viewType === 'hour' ? todayHourly : null,
    isLoading: salesTrend.isLoading || aovData.isLoading || comparison.isLoading,
    lastRefresh: new Date().toLocaleTimeString()
  }
}