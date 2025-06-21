import React, { useState } from 'react'
import { 
  TrendingUp, 
  DollarSign, 
  ShoppingCart, 
  Users, 
  Calendar,
  Download,
  RefreshCw,
  BarChart3,
  PieChart,
  LineChart
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  LineChart as RechartsLineChart,
  Line,
  Area,
  AreaChart
} from 'recharts'
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns'
import { formatPakistanDateTimeForDisplay, getCurrentPakistanDate } from '../utils/dateUtils'

const SalesDashboard: React.FC = () => {
  const [dateRange, setDateRange] = useState('7days')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // Calculate date range
  const getDateRange = () => {
    const today = new Date()
    switch (dateRange) {
      case 'today':
        return {
          start: format(today, 'yyyy-MM-dd'),
          end: format(today, 'yyyy-MM-dd')
        }
      case '7days':
        return {
          start: format(subDays(today, 6), 'yyyy-MM-dd'),
          end: format(today, 'yyyy-MM-dd')
        }
      case '30days':
        return {
          start: format(subDays(today, 29), 'yyyy-MM-dd'),
          end: format(today, 'yyyy-MM-dd')
        }
      case 'thisWeek':
        return {
          start: format(startOfWeek(today), 'yyyy-MM-dd'),
          end: format(endOfWeek(today), 'yyyy-MM-dd')
        }
      case 'custom':
        return {
          start: customStartDate || format(subDays(today, 6), 'yyyy-MM-dd'),
          end: customEndDate || format(today, 'yyyy-MM-dd')
        }
      default:
        return {
          start: format(subDays(today, 6), 'yyyy-MM-dd'),
          end: format(today, 'yyyy-MM-dd')
        }
    }
  }

  const { start: startDate, end: endDate } = getDateRange()

  // Sales summary query
  const { data: salesSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['sales-dashboard-summary', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_net_sales_summary', {
        p_start_date: startDate,
        p_end_date: endDate
      })
      
      if (error) throw error
      return data[0]
    }
  })

  // Daily sales trend
  const { data: dailyTrend, isLoading: trendLoading } = useQuery({
    queryKey: ['sales-dashboard-trend', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select('sale_date, total_amount, payment_status')
        .gte('sale_date', startDate)
        .lte('sale_date', endDate)
        .eq('payment_status', 'paid')
        .order('sale_date')
      
      if (error) throw error
      
      // Group by date
      const dailyData = data.reduce((acc, sale) => {
        const date = sale.sale_date.split('T')[0]
        if (!acc[date]) {
          acc[date] = { date, sales: 0, count: 0 }
        }
        acc[date].sales += sale.total_amount
        acc[date].count += 1
        return acc
      }, {} as Record<string, { date: string; sales: number; count: number }>)
      
      return Object.values(dailyData).map(day => ({
        ...day,
        dateFormatted: format(new Date(day.date), 'MMM dd')
      }))
    }
  })

  // Payment method breakdown
  const { data: paymentBreakdown } = useQuery({
    queryKey: ['sales-dashboard-payments', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select('payment_method, total_amount')
        .gte('sale_date', startDate)
        .lte('sale_date', endDate)
        .eq('payment_status', 'paid')
      
      if (error) throw error
      
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
    }
  })

  // Top selling products
  const { data: topProducts } = useQuery({
    queryKey: ['sales-dashboard-products', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_top_selling_products', {
        start_date: startDate,
        end_date: endDate,
        limit_count: 10
      })
      
      if (error) throw error
      return data
    }
  })

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']

  const exportData = () => {
    const exportData = {
      summary: salesSummary,
      dailyTrend,
      paymentBreakdown,
      topProducts,
      dateRange: `${startDate} to ${endDate}`,
      exportedAt: new Date().toISOString()
    }
    
    const dataStr = JSON.stringify(exportData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sales-dashboard-${startDate}-to-${endDate}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Dashboard</h1>
          <p className="text-sm text-gray-600 mt-1">
            Comprehensive sales analytics and insights
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="text-xs text-gray-500">
            Last updated: {formatPakistanDateTimeForDisplay(new Date())}
          </div>
          <button
            onClick={exportData}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 flex items-center text-sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </button>
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="flex items-center space-x-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="today">Today</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="thisWeek">This Week</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {dateRange === 'custom' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}
          </div>

          <div className="text-sm text-gray-600">
            Showing data from {format(new Date(startDate), 'MMM dd, yyyy')} to {format(new Date(endDate), 'MMM dd, yyyy')}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {salesSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Gross Sales</p>
                <p className="text-2xl font-bold text-gray-900">₨{salesSummary.gross_sales.toLocaleString()}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Net Sales</p>
                <p className="text-2xl font-bold text-gray-900">₨{salesSummary.net_sales.toLocaleString()}</p>
                <p className="text-xs text-gray-500">After refunds</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Transactions</p>
                <p className="text-2xl font-bold text-gray-900">{salesSummary.transaction_count}</p>
                <p className="text-xs text-gray-500">{salesSummary.refund_count} refunds</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-purple-500" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Sale</p>
                <p className="text-2xl font-bold text-gray-900">₨{salesSummary.average_sale.toLocaleString()}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-orange-500" />
            </div>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Sales Trend */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <LineChart className="h-5 w-5 mr-2" />
            Daily Sales Trend
          </h3>
          {trendLoading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateFormatted" />
                <YAxis />
                <Tooltip formatter={(value) => [`₨${value}`, 'Sales']} />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#3B82F6"
                  fill="#3B82F6"
                  fillOpacity={0.1}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Payment Method Breakdown */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <PieChart className="h-5 w-5 mr-2" />
            Payment Methods
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <RechartsPieChart>
              <Pie
                data={paymentBreakdown}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {paymentBreakdown?.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`₨${value}`, 'Amount']} />
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Products Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Top Selling Products</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity Sold</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Price</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {topProducts?.map((product, index) => (
                <tr key={product.product_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
                      <span className="text-sm font-medium text-blue-600">#{index + 1}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{product.product_name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{product.total_quantity}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">₨{product.total_revenue?.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    ₨{product.total_revenue && product.total_quantity ? (product.total_revenue / product.total_quantity).toFixed(2) : '0'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {(!topProducts || topProducts.length === 0) && (
          <div className="text-center py-8 text-gray-500">
            No sales data available for the selected period.
          </div>
        )}
      </div>

      {/* Performance Insights */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {salesSummary && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-2">Revenue Performance</h4>
                <p className="text-sm text-blue-700">
                  Net sales of ₨{salesSummary.net_sales.toLocaleString()} from {salesSummary.transaction_count} transactions
                </p>
                {salesSummary.total_refunds > 0 && (
                  <p className="text-xs text-blue-600 mt-1">
                    Refund rate: {((salesSummary.refund_count / salesSummary.transaction_count) * 100).toFixed(1)}%
                  </p>
                )}
              </div>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-800 mb-2">Transaction Efficiency</h4>
                <p className="text-sm text-green-700">
                  Average transaction value: ₨{salesSummary.average_sale.toLocaleString()}
                </p>
                {paymentBreakdown && (
                  <p className="text-xs text-green-600 mt-1">
                    Most popular: {paymentBreakdown.reduce((prev, current) => 
                      prev.value > current.value ? prev : current
                    )?.name || 'N/A'}
                  </p>
                )}
              </div>
              
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h4 className="font-medium text-purple-800 mb-2">Product Performance</h4>
                <p className="text-sm text-purple-700">
                  {topProducts?.length || 0} products sold in this period
                </p>
                {topProducts && topProducts.length > 0 && (
                  <p className="text-xs text-purple-600 mt-1">
                    Top seller: {topProducts[0]?.product_name}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SalesDashboard