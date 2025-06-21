import React, { useState, useEffect, useCallback } from 'react'
import { 
  Calendar, 
  Download, 
  Search, 
  Filter, 
  RefreshCw, 
  TrendingUp, 
  DollarSign, 
  ShoppingCart, 
  Users, 
  Clock, 
  FileText, 
  Eye, 
  Printer, 
  X,
  ChevronDown,
  ChevronUp,
  CreditCard,
  BarChart3
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { 
  useSales, 
  useAllReceipts, 
  useDailyReceiptStats,
  useExportSalesData
} from '../hooks/useSales'
import { useSalesExport } from '../hooks/useSalesExport'
import { useRealTimeSalesAnalytics } from '../hooks/useSalesAnalytics'
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear } from 'date-fns'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  AreaChart, 
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import { generateReceipt } from '../utils/receiptGenerator'
import toast from 'react-hot-toast'

const SalesTransactionDashboard: React.FC = () => {
  // Time period state
  const [timePeriod, setTimePeriod] = useState('today')
  const [customDateRange, setCustomDateRange] = useState({
    startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
  })
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false)
  
  // Chart view type
  const [viewType, setViewType] = useState<'hour' | 'day' | 'month'>('day')
  
  // Filter state
  const [filters, setFilters] = useState({
    searchTerm: '',
    minAmount: '',
    maxAmount: '',
    paymentMethod: '',
    paymentStatus: '',
    customerFilter: ''
  })
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  
  // Transaction detail state
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null)
  
  // Export options state
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'pdf'>('csv')
  const [exportType, setExportType] = useState<'summary' | 'detailed'>('detailed')
  const [showExportOptions, setShowExportOptions] = useState(false)
  
  // Sorting state
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'ascending' | 'descending';
  } | null>(null)
  
  // Auto-refresh state
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date())
  
  // Calculate date range based on selected time period
  const getDateRange = useCallback(() => {
    const today = new Date()
    
    switch (timePeriod) {
      case 'today':
        return {
          startDate: format(today, 'yyyy-MM-dd'),
          endDate: format(today, 'yyyy-MM-dd')
        }
      case 'yesterday':
        const yesterday = subDays(today, 1)
        return {
          startDate: format(yesterday, 'yyyy-MM-dd'),
          endDate: format(yesterday, 'yyyy-MM-dd')
        }
      case 'last7days':
        return {
          startDate: format(subDays(today, 6), 'yyyy-MM-dd'),
          endDate: format(today, 'yyyy-MM-dd')
        }
      case 'thisWeek':
        return {
          startDate: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
          endDate: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')
        }
      case 'thisMonth':
        return {
          startDate: format(startOfMonth(today), 'yyyy-MM-dd'),
          endDate: format(endOfMonth(today), 'yyyy-MM-dd')
        }
      case 'thisQuarter':
        return {
          startDate: format(startOfQuarter(today), 'yyyy-MM-dd'),
          endDate: format(endOfQuarter(today), 'yyyy-MM-dd')
        }
      case 'ytd':
        return {
          startDate: format(startOfYear(today), 'yyyy-MM-dd'),
          endDate: format(today, 'yyyy-MM-dd')
        }
      case 'custom':
        return customDateRange
      default:
        return {
          startDate: format(today, 'yyyy-MM-dd'),
          endDate: format(today, 'yyyy-MM-dd')
        }
    }
  }, [timePeriod, customDateRange])
  
  const { startDate, endDate } = getDateRange()
  
  // Auto-adjust view type based on date range
  useEffect(() => {
    if (timePeriod === 'today' || timePeriod === 'yesterday') {
      setViewType('hour')
    } else if (timePeriod === 'last7days' || timePeriod === 'thisWeek' || timePeriod === 'thisMonth') {
      setViewType('day')
    } else if (timePeriod === 'thisQuarter' || timePeriod === 'ytd') {
      setViewType('month')
    }
  }, [timePeriod])
  
  // Convert string filters to appropriate types for the hook
  const hookFilters = {
    dateFrom: startDate,
    dateTo: endDate,
    searchTerm: filters.searchTerm || undefined,
    minAmount: filters.minAmount ? parseFloat(filters.minAmount) : undefined,
    maxAmount: filters.maxAmount ? parseFloat(filters.maxAmount) : undefined,
    paymentMethod: filters.paymentMethod || undefined,
    paymentStatus: filters.paymentStatus || undefined,
    customerFilter: filters.customerFilter || undefined
  }
  
  // Fetch data with the calculated date range and filters
  const { 
    data: sales = [], 
    isLoading: salesLoading, 
    refetch: refetchSales 
  } = useSales(hookFilters)
  
  const { 
    data: allReceipts = [], 
    isLoading: receiptsLoading, 
    refetch: refetchReceipts 
  } = useAllReceipts(hookFilters)
  
  const { data: receiptStats } = useDailyReceiptStats(startDate)
  
  // Real-time analytics data
  const {
    salesTrend,
    aovData,
    comparison,
    summaryMetrics,
    peakHours,
    todayHourly,
    isLoading: analyticsLoading,
    lastRefresh
  } = useRealTimeSalesAnalytics(startDate, endDate, viewType)
  
  // Export functions
  const salesExport = useSalesExport()
  const exportData = useExportSalesData()
  
  // Auto-refresh data every 5 minutes
  useEffect(() => {
    if (!autoRefresh) return
    
    const intervalId = setInterval(() => {
      refetchSales()
      refetchReceipts()
      setLastRefreshTime(new Date())
    }, 5 * 60 * 1000) // 5 minutes
    
    return () => clearInterval(intervalId)
  }, [autoRefresh, refetchSales, refetchReceipts])
  
  // Handle filter changes
  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }
  
  // Clear all filters
  const clearFilters = () => {
    setFilters({
      searchTerm: '',
      minAmount: '',
      maxAmount: '',
      paymentMethod: '',
      paymentStatus: '',
      customerFilter: ''
    })
  }
  
  // Handle manual refresh
  const handleRefresh = () => {
    refetchSales()
    refetchReceipts()
    setLastRefreshTime(new Date())
    toast.success('Data refreshed successfully')
  }
  
  // Handle export
  const handleExport = () => {
    if (exportFormat === 'pdf') {
      salesExport.mutate({
        format: 'pdf',
        ...hookFilters,
        exportType
      })
    } else {
      exportData.mutate({
        format: exportFormat,
        ...hookFilters
      })
    }
    setShowExportOptions(false)
  }
  
  // Handle receipt printing
  const handlePrintReceipt = async (sale: any) => {
    if (!sale) return
    
    try {
      const receiptData = {
        id: sale.id,
        receipt_number: sale.receipt_number,
        invoice_number: sale.invoice_number,
        sale_date: sale.sale_date,
        total_amount: sale.total_amount,
        subtotal: sale.subtotal,
        discount_amount: sale.discount_amount,
        tax_amount: sale.tax_amount,
        payment_method: sale.payment_method,
        payment_status: sale.payment_status,
        customer: sale.customer ? {
          name: sale.customer.name,
          phone: sale.customer.phone,
          email: sale.customer.email
        } : undefined,
        items: sale.sale_items?.map((item: any) => ({
          name: item.product?.name || 'Unknown Product',
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price
        })) || []
      }
      
      await generateReceipt(receiptData)
    } catch (error) {
      console.error('Error printing receipt:', error)
      toast.error('Failed to print receipt')
    }
  }
  
  // Sort transactions
  const requestSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending'
    }
    setSortConfig({ key, direction })
  }
  
  const sortedTransactions = React.useMemo(() => {
    if (!sortConfig) return sales
    
    return [...sales].sort((a, b) => {
      let aValue, bValue
      
      // Handle nested properties
      if (sortConfig.key === 'customer') {
        aValue = a.customer?.name || ''
        bValue = b.customer?.name || ''
      } else if (sortConfig.key === 'items') {
        aValue = a.sale_items?.length || 0
        bValue = b.sale_items?.length || 0
      } else {
        aValue = a[sortConfig.key as keyof typeof a]
        bValue = b[sortConfig.key as keyof typeof b]
      }
      
      // Handle date comparison
      if (sortConfig.key === 'sale_date') {
        aValue = new Date(aValue as string).getTime()
        bValue = new Date(bValue as string).getTime()
      }
      
      if (aValue < bValue) {
        return sortConfig.direction === 'ascending' ? -1 : 1
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'ascending' ? 1 : -1
      }
      return 0
    })
  }, [sales, sortConfig])
  
  // Helper functions for UI
  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800'
      case 'pending_bnpl': return 'bg-yellow-100 text-yellow-800'
      case 'partially_paid': return 'bg-blue-100 text-blue-800'
      case 'refunded': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }
  
  const formatCurrency = (value: number) => `₨${value.toLocaleString()}`
  
  // Loading state
  const isLoading = salesLoading || receiptsLoading || analyticsLoading
  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Transaction Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Comprehensive real-time sales data and analytics
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="text-xs text-gray-500 flex items-center">
            <Clock className="h-4 w-4 mr-1" />
            Last updated: {lastRefreshTime.toLocaleTimeString()}
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 flex items-center disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <div className="relative">
            <button
              onClick={() => setShowExportOptions(!showExportOptions)}
              className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 flex items-center"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
              {showExportOptions ? 
                <ChevronUp className="h-4 w-4 ml-2" /> : 
                <ChevronDown className="h-4 w-4 ml-2" />
              }
            </button>
            
            {showExportOptions && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg z-10 border border-gray-200">
                <div className="p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setExportFormat('csv')}
                        className={`p-2 text-xs rounded-md border ${
                          exportFormat === 'csv'
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-700 border-gray-300'
                        }`}
                      >
                        CSV
                      </button>
                      <button
                        onClick={() => setExportFormat('json')}
                        className={`p-2 text-xs rounded-md border ${
                          exportFormat === 'json'
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-700 border-gray-300'
                        }`}
                      >
                        JSON
                      </button>
                      <button
                        onClick={() => setExportFormat('pdf')}
                        className={`p-2 text-xs rounded-md border ${
                          exportFormat === 'pdf'
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-700 border-gray-300'
                        }`}
                      >
                        PDF
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setExportType('summary')}
                        className={`p-2 text-xs rounded-md border ${
                          exportType === 'summary'
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-700 border-gray-300'
                        }`}
                      >
                        Summary
                      </button>
                      <button
                        onClick={() => setExportType('detailed')}
                        className={`p-2 text-xs rounded-md border ${
                          exportType === 'detailed'
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-700 border-gray-300'
                        }`}
                      >
                        Detailed
                      </button>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleExport}
                    disabled={salesExport.isPending || exportData.isPending}
                    className="w-full bg-green-500 text-white p-2 rounded-md hover:bg-green-600 disabled:opacity-50 flex items-center justify-center"
                  >
                    {salesExport.isPending || exportData.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Export {exportFormat.toUpperCase()}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Time Period Filters */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'last7days', label: 'Last 7 Days' },
            { id: 'thisWeek', label: 'This Week' },
            { id: 'thisMonth', label: 'This Month' },
            { id: 'thisQuarter', label: 'This Quarter' },
            { id: 'ytd', label: 'Year to Date' },
            { id: 'custom', label: 'Custom Range' }
          ].map((period) => (
            <button
              key={period.id}
              onClick={() => {
                setTimePeriod(period.id)
                if (period.id === 'custom') {
                  setShowCustomDatePicker(true)
                } else {
                  setShowCustomDatePicker(false)
                }
              }}
              className={`px-3 py-1.5 text-sm rounded-md ${
                timePeriod === period.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {period.label}
            </button>
          ))}
          
          <div className="flex items-center ml-auto">
            <label className="flex items-center text-sm text-gray-600">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="mr-2 rounded border-gray-300 text-blue-600"
              />
              Auto-refresh (5 min)
            </label>
          </div>
        </div>
        
        {showCustomDatePicker && (
          <div className="mt-4 flex items-center space-x-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={customDateRange.startDate}
                onChange={(e) => setCustomDateRange({ ...customDateRange, startDate: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={customDateRange.endDate}
                onChange={(e) => setCustomDateRange({ ...customDateRange, endDate: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(summaryMetrics.data?.total_revenue || 0)}
              </p>
              {comparison.data?.sales_change_percent && (
                <div className={`flex items-center mt-2 text-sm ${
                  comparison.data.sales_change_percent > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {comparison.data.sales_change_percent > 0 ? (
                    <TrendingUp className="h-4 w-4 mr-1" />
                  ) : (
                    <TrendingUp className="h-4 w-4 mr-1 transform rotate-180" />
                  )}
                  <span>{Math.abs(comparison.data.sales_change_percent).toFixed(1)}% vs previous</span>
                </div>
              )}
            </div>
            <div className="p-3 rounded-full bg-green-100">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Transactions</p>
              <p className="text-2xl font-bold text-gray-900">
                {summaryMetrics.data?.total_transactions || 0}
              </p>
              {comparison.data?.transactions_change_percent && (
                <div className={`flex items-center mt-2 text-sm ${
                  comparison.data.transactions_change_percent > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {comparison.data.transactions_change_percent > 0 ? (
                    <TrendingUp className="h-4 w-4 mr-1" />
                  ) : (
                    <TrendingUp className="h-4 w-4 mr-1 transform rotate-180" />
                  )}
                  <span>{Math.abs(comparison.data.transactions_change_percent).toFixed(1)}% vs previous</span>
                </div>
              )}
            </div>
            <div className="p-3 rounded-full bg-blue-100">
              <ShoppingCart className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg Order Value</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(summaryMetrics.data?.average_order_value || 0)}
              </p>
              {comparison.data?.aov_change_percent && (
                <div className={`flex items-center mt-2 text-sm ${
                  comparison.data.aov_change_percent > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {comparison.data.aov_change_percent > 0 ? (
                    <TrendingUp className="h-4 w-4 mr-1" />
                  ) : (
                    <TrendingUp className="h-4 w-4 mr-1 transform rotate-180" />
                  )}
                  <span>{Math.abs(comparison.data.aov_change_percent).toFixed(1)}% vs previous</span>
                </div>
              )}
            </div>
            <div className="p-3 rounded-full bg-purple-100">
              <BarChart3 className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Unique Customers</p>
              <p className="text-2xl font-bold text-gray-900">
                {summaryMetrics.data?.unique_customers || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {summaryMetrics.data?.returning_customers || 0} returning
              </p>
            </div>
            <div className="p-3 rounded-full bg-orange-100">
              <Users className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Trend Chart */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Sales Trend ({viewType === 'hour' ? 'Hourly' : viewType === 'day' ? 'Daily' : 'Monthly'})
            </h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setViewType('hour')}
                className={`px-2 py-1 text-xs rounded ${
                  viewType === 'hour' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                Hour
              </button>
              <button
                onClick={() => setViewType('day')}
                className={`px-2 py-1 text-xs rounded ${
                  viewType === 'day' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => setViewType('month')}
                className={`px-2 py-1 text-xs rounded ${
                  viewType === 'month' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                Month
              </button>
            </div>
          </div>
          
          {analyticsLoading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={salesTrend.data || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="period_label" 
                  tick={{ fontSize: 12 }}
                  angle={viewType === 'hour' ? -45 : 0}
                  textAnchor={viewType === 'hour' ? 'end' : 'middle'}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value, name) => [
                    name === 'total_sales' ? formatCurrency(Number(value)) : value,
                    name === 'total_sales' ? 'Revenue' : 'Transactions'
                  ]}
                  labelFormatter={(label) => `Period: ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="total_sales"
                  stroke="#3B82F6"
                  fill="#3B82F6"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="total_transactions"
                  stroke="#10B981"
                  fill="#10B981"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        
        {/* Average Order Value Trend */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Average Order Value Trend</h3>
          
          {analyticsLoading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesTrend.data || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="period_label" 
                  tick={{ fontSize: 12 }}
                  angle={viewType === 'hour' ? -45 : 0}
                  textAnchor={viewType === 'hour' ? 'end' : 'middle'}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value) => [formatCurrency(Number(value)), 'AOV']}
                  labelFormatter={(label) => `Period: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="average_order_value"
                  stroke="#8B5CF6"
                  strokeWidth={3}
                  dot={{ fill: '#8B5CF6', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, stroke: '#8B5CF6', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Payment Method Distribution */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Method Distribution</h3>
        
        {analyticsLoading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="col-span-1">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Cash', value: sales.filter(s => s.payment_method === 'cash').length, color: '#10B981' },
                      { name: 'Card', value: sales.filter(s => s.payment_method === 'card').length, color: '#3B82F6' },
                      { name: 'BNPL', value: sales.filter(s => s.payment_method === 'bnpl').length, color: '#F59E0B' }
                    ].filter(item => item.value > 0)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {[
                      { name: 'Cash', value: 0, color: '#10B981' },
                      { name: 'Card', value: 0, color: '#3B82F6' },
                      { name: 'BNPL', value: 0, color: '#F59E0B' }
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} transactions`, 'Count']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="col-span-2">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <DollarSign className="h-5 w-5 text-green-600 mr-2" />
                    <h4 className="font-medium text-green-800">Cash</h4>
                  </div>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(sales.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + s.total_amount, 0))}
                  </p>
                  <p className="text-sm text-green-600">
                    {sales.filter(s => s.payment_method === 'cash').length} transactions
                  </p>
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <CreditCard className="h-5 w-5 text-blue-600 mr-2" />
                    <h4 className="font-medium text-blue-800">Card</h4>
                  </div>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatCurrency(sales.filter(s => s.payment_method === 'card').reduce((sum, s) => sum + s.total_amount, 0))}
                  </p>
                  <p className="text-sm text-blue-600">
                    {sales.filter(s => s.payment_method === 'card').length} transactions
                  </p>
                </div>
                
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <Clock className="h-5 w-5 text-yellow-600 mr-2" />
                    <h4 className="font-medium text-yellow-800">BNPL</h4>
                  </div>
                  <p className="text-2xl font-bold text-yellow-600">
                    {formatCurrency(sales.filter(s => s.payment_method === 'bnpl').reduce((sum, s) => sum + s.total_amount, 0))}
                  </p>
                  <p className="text-sm text-yellow-600">
                    {sales.filter(s => s.payment_method === 'bnpl').length} transactions
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Filters */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Transaction Data</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="text-blue-600 hover:text-blue-800 flex items-center text-sm"
            >
              <Filter className="h-4 w-4 mr-1" />
              {showAdvancedFilters ? 'Hide' : 'Show'} Filters
            </button>
            <button
              onClick={clearFilters}
              className="text-gray-600 hover:text-gray-800 flex items-center text-sm"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </button>
          </div>
        </div>
        
        {/* Basic Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search by receipt #, invoice #, customer name..."
              value={filters.searchTerm}
              onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Amount (₨)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={filters.minAmount}
                onChange={(e) => handleFilterChange('minAmount', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Amount (₨)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={filters.maxAmount}
                onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select
                value={filters.paymentMethod}
                onChange={(e) => handleFilterChange('paymentMethod', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Methods</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bnpl">BNPL</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
              <select
                value={filters.paymentStatus}
                onChange={(e) => handleFilterChange('paymentStatus', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Status</option>
                <option value="paid">Paid</option>
                <option value="pending_bnpl">Pending BNPL</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
          </div>
        )}
        
        {/* Filter Summary */}
        {(filters.searchTerm || filters.minAmount || filters.maxAmount || filters.paymentMethod || filters.paymentStatus) && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="text-sm text-blue-800">
                <span className="font-medium">Active Filters:</span>
                {filters.searchTerm && <span className="ml-2 bg-blue-200 px-2 py-1 rounded">Search: {filters.searchTerm}</span>}
                {filters.minAmount && <span className="ml-2 bg-blue-200 px-2 py-1 rounded">Min: ₨{filters.minAmount}</span>}
                {filters.maxAmount && <span className="ml-2 bg-blue-200 px-2 py-1 rounded">Max: ₨{filters.maxAmount}</span>}
                {filters.paymentMethod && <span className="ml-2 bg-blue-200 px-2 py-1 rounded">Payment: {filters.paymentMethod.toUpperCase()}</span>}
                {filters.paymentStatus && <span className="ml-2 bg-blue-200 px-2 py-1 rounded">Status: {filters.paymentStatus.replace('_', ' ').toUpperCase()}</span>}
              </div>
              <span className="text-sm text-blue-600 font-medium">
                {sales.length} results
              </span>
            </div>
          </div>
        )}
        
        {/* Transactions Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mr-3" />
            <span className="text-gray-600 text-lg">Loading transaction data...</span>
          </div>
        ) : sales.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Transactions Found</h3>
            <p className="text-gray-600">Try adjusting your filters or date range</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => requestSort('receipt_number')}
                  >
                    Receipt #
                    {sortConfig?.key === 'receipt_number' && (
                      <span className="ml-1">
                        {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => requestSort('sale_date')}
                  >
                    Date & Time
                    {sortConfig?.key === 'sale_date' && (
                      <span className="ml-1">
                        {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => requestSort('customer')}
                  >
                    Customer
                    {sortConfig?.key === 'customer' && (
                      <span className="ml-1">
                        {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => requestSort('items')}
                  >
                    Items
                    {sortConfig?.key === 'items' && (
                      <span className="ml-1">
                        {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => requestSort('total_amount')}
                  >
                    Total
                    {sortConfig?.key === 'total_amount' && (
                      <span className="ml-1">
                        {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => requestSort('payment_method')}
                  >
                    Payment
                    {sortConfig?.key === 'payment_method' && (
                      <span className="ml-1">
                        {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => requestSort('payment_status')}
                  >
                    Status
                    {sortConfig?.key === 'payment_status' && (
                      <span className="ml-1">
                        {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedTransactions.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-mono text-blue-600">{sale.receipt_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {format(new Date(sale.sale_date), 'MMM dd, yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div>{sale.customer?.name || 'Walk-in Customer'}</div>
                      {sale.customer?.phone && (
                        <div className="text-xs text-gray-500">{sale.customer.phone}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {sale.sale_items?.length || 0} items
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      ₨{sale.total_amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        sale.payment_method === 'cash' ? 'bg-green-100 text-green-800' :
                        sale.payment_method === 'card' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {sale.payment_method.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPaymentStatusColor(sale.payment_status)}`}>
                        {sale.payment_status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setSelectedTransaction(sale)}
                          className="text-blue-600 hover:text-blue-900"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handlePrintReceipt(sale)}
                          className="text-green-600 hover:text-green-900"
                          title="Print Receipt"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Transaction Details</h3>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Transaction Header */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Receipt Number</p>
                  <p className="font-mono font-semibold text-blue-600">{selectedTransaction.receipt_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Invoice Number</p>
                  <p className="font-semibold">{selectedTransaction.invoice_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Date & Time</p>
                  <p className="font-medium">{format(new Date(selectedTransaction.sale_date), 'MMM dd, yyyy HH:mm')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Cashier</p>
                  <p className="font-medium">{selectedTransaction.cashier_name || 'N/A'}</p>
                </div>
              </div>

              {/* Customer Information */}
              {selectedTransaction.customer && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Customer Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Name</p>
                      <p className="font-medium">{selectedTransaction.customer.name}</p>
                    </div>
                    {selectedTransaction.customer.phone && (
                      <div>
                        <p className="text-sm text-gray-600">Phone</p>
                        <p className="font-medium">{selectedTransaction.customer.phone}</p>
                      </div>
                    )}
                    {selectedTransaction.customer.email && (
                      <div>
                        <p className="text-sm text-gray-600">Email</p>
                        <p className="font-medium">{selectedTransaction.customer.email}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Items */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Items Purchased</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Product</th>
                        <th className="px-4 py-2 text-left">SKU</th>
                        <th className="px-4 py-2 text-left">Qty</th>
                        <th className="px-4 py-2 text-left">Unit Price</th>
                        <th className="px-4 py-2 text-left">Discount</th>
                        <th className="px-4 py-2 text-left">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTransaction.sale_items?.map((item: any) => (
                        <tr key={item.id} className="border-t">
                          <td className="px-4 py-2 font-medium">{item.product?.name}</td>
                          <td className="px-4 py-2 text-gray-600">{item.product?.sku}</td>
                          <td className="px-4 py-2">{item.quantity}</td>
                          <td className="px-4 py-2">₨{item.unit_price}</td>
                          <td className="px-4 py-2">₨{item.discount_amount}</td>
                          <td className="px-4 py-2 font-medium">₨{item.total_price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>₨{selectedTransaction.subtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Discount:</span>
                      <span>-₨{selectedTransaction.discount_amount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tax:</span>
                      <span>₨{selectedTransaction.tax_amount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg border-t pt-2">
                      <span>Total:</span>
                      <span>₨{selectedTransaction.total_amount.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Payment Method:</span>
                      <span className="font-medium">{selectedTransaction.payment_method.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Payment Status:</span>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPaymentStatusColor(selectedTransaction.payment_status)}`}>
                        {selectedTransaction.payment_status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Receipt Printed:</span>
                      <span className={selectedTransaction.receipt_printed ? 'text-green-600' : 'text-gray-400'}>
                        {selectedTransaction.receipt_printed ? 'Yes' : 'No'}
                      </span>
                    </div>
                    {selectedTransaction.receipt_printed_at && (
                      <div className="flex justify-between">
                        <span>Printed At:</span>
                        <span className="text-sm">{format(new Date(selectedTransaction.receipt_printed_at), 'MMM dd, yyyy HH:mm')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={() => handlePrintReceipt(selectedTransaction)}
                  className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 flex items-center"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print Receipt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SalesTransactionDashboard