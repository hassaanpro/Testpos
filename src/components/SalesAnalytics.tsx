import React, { useState, useEffect } from 'react'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingCart, 
  Users, 
  Clock, 
  Download,
  RefreshCw,
  Calendar,
  BarChart3,
  Target,
  Award
} from 'lucide-react'
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Area,
  AreaChart
} from 'recharts'
import { useRealTimeSalesAnalytics } from '../hooks/useSalesAnalytics'
import { format, subDays } from 'date-fns'

const SalesAnalytics: React.FC = () => {
  const [dateRange, setDateRange] = useState('7days')
  const [viewType, setViewType] = useState<'hour' | 'day' | 'month'>('day')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date())

  // Calculate date range based on selection
  const getDateRange = () => {
    const today = new Date()
    switch (dateRange) {
      case '1day':
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
  
  const {
    salesTrend,
    aovData,
    comparison,
    summaryMetrics,
    peakHours,
    todayHourly,
    isLoading,
    lastRefresh
  } = useRealTimeSalesAnalytics(startDate, endDate, viewType)

  // Update refresh time when data refreshes
  useEffect(() => {
    setLastRefreshTime(new Date())
  }, [lastRefresh])

  // Auto-adjust view type based on date range
  useEffect(() => {
    if (dateRange === '1day') {
      setViewType('hour')
    } else if (dateRange === '7days' || dateRange === '30days') {
      setViewType('day')
    }
  }, [dateRange])

  const StatCard: React.FC<{
    title: string
    value: string
    change?: number
    icon: React.ElementType
    color: string
    subtitle?: string
    trend?: 'up' | 'down' | 'neutral'
  }> = ({ title, value, change, icon: Icon, color, subtitle, trend }) => (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {change !== undefined && (
            <div className={`flex items-center mt-2 text-sm ${
              change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-600'
            }`}>
              {change > 0 ? (
                <TrendingUp className="h-4 w-4 mr-1" />
              ) : change < 0 ? (
                <TrendingDown className="h-4 w-4 mr-1" />
              ) : null}
              <span>{Math.abs(change).toFixed(1)}% vs previous period</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  )

  const exportData = () => {
    const data = {
      dateRange: `${startDate} to ${endDate}`,
      summary: summaryMetrics.data,
      aov: aovData.data,
      comparison: comparison.data,
      salesTrend: salesTrend.data,
      peakHours: peakHours.data,
      exportedAt: new Date().toISOString()
    }
    
    const dataStr = JSON.stringify(data, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sales-analytics-${startDate}-to-${endDate}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const formatCurrency = (value: number) => `₨${value.toLocaleString()}`
  const formatPercentage = (value: number) => `${value.toFixed(1)}%`

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-2 text-gray-600">Loading analytics...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time sales performance and trends
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="text-xs text-gray-500 flex items-center">
            <Clock className="h-4 w-4 mr-1" />
            Last updated: {lastRefreshTime.toLocaleTimeString()}
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

      {/* Filters */}
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
                <option value="1day">Today</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">View Type</label>
              <select
                value={viewType}
                onChange={(e) => setViewType(e.target.value as 'hour' | 'day' | 'month')}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="hour">Hourly</option>
                <option value="day">Daily</option>
                <option value="month">Monthly</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <RefreshCw className="h-4 w-4" />
            <span>Auto-refresh every 30 seconds</span>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Average Order Value"
          value={formatCurrency(aovData.data?.average_order_value || 0)}
          change={comparison.data?.aov_change_percent}
          icon={Target}
          color="bg-blue-500"
          subtitle={`${aovData.data?.paid_transactions || 0} paid transactions`}
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(aovData.data?.total_sales || 0)}
          change={comparison.data?.sales_change_percent}
          icon={DollarSign}
          color="bg-green-500"
          subtitle="Paid transactions only"
        />
        <StatCard
          title="Total Transactions"
          value={(aovData.data?.total_transactions || 0).toString()}
          change={comparison.data?.transactions_change_percent}
          icon={ShoppingCart}
          color="bg-purple-500"
          subtitle={`${aovData.data?.bnpl_transactions || 0} BNPL transactions`}
        />
        <StatCard
          title="Conversion Rate"
          value={formatPercentage(summaryMetrics.data?.conversion_rate || 0)}
          icon={Award}
          color="bg-orange-500"
          subtitle="Paid vs total transactions"
        />
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Items Sold"
          value={(summaryMetrics.data?.total_items_sold || 0).toString()}
          icon={BarChart3}
          color="bg-indigo-500"
          subtitle="Total quantity sold"
        />
        <StatCard
          title="Unique Customers"
          value={(summaryMetrics.data?.unique_customers || 0).toString()}
          icon={Users}
          color="bg-teal-500"
          subtitle={`${summaryMetrics.data?.returning_customers || 0} returning`}
        />
        <StatCard
          title="Peak Hour"
          value={`${summaryMetrics.data?.peak_hour || 0}:00`}
          icon={Clock}
          color="bg-pink-500"
          subtitle={`Peak day: ${summaryMetrics.data?.peak_day || 'N/A'}`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Trend Chart */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Sales Trend ({viewType === 'hour' ? 'Hourly' : viewType === 'day' ? 'Daily' : 'Monthly'})
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={salesTrend.data}>
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
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* AOV Trend Chart */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Average Order Value Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesTrend.data}>
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
                stroke="#10B981"
                strokeWidth={3}
                dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#10B981', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Peak Hours Analysis */}
      {peakHours.data && peakHours.data.length > 0 && (
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Peak Hours Analysis</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={peakHours.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour_label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                formatter={(value, name) => [
                  name === 'avg_sales' ? formatCurrency(Number(value)) : Number(value).toFixed(1),
                  name === 'avg_sales' ? 'Avg Sales' : 'Avg Transactions'
                ]}
                labelFormatter={(label) => `Hour: ${label}`}
              />
              <Bar dataKey="avg_sales" fill="#8B5CF6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Today's Hourly Performance (if viewing hourly) */}
      {viewType === 'hour' && todayHourly?.data && todayHourly.data.length > 0 && (
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Today's Hourly Performance
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={todayHourly.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour_label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                formatter={(value, name) => [
                  name === 'total_sales' ? formatCurrency(Number(value)) : value,
                  name === 'total_sales' ? 'Sales' : name === 'total_transactions' ? 'Transactions' : 'AOV'
                ]}
                labelFormatter={(label) => `Hour: ${label}`}
              />
              <Bar dataKey="total_sales" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Performance Summary */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2">Revenue Growth</h4>
            <p className="text-2xl font-bold text-blue-600">
              {comparison.data?.sales_change_percent > 0 ? '+' : ''}
              {formatPercentage(comparison.data?.sales_change_percent || 0)}
            </p>
            <p className="text-sm text-blue-600">vs previous period</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-medium text-green-800 mb-2">AOV Growth</h4>
            <p className="text-2xl font-bold text-green-600">
              {comparison.data?.aov_change_percent > 0 ? '+' : ''}
              {formatPercentage(comparison.data?.aov_change_percent || 0)}
            </p>
            <p className="text-sm text-green-600">vs previous period</p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h4 className="font-medium text-purple-800 mb-2">Transaction Growth</h4>
            <p className="text-2xl font-bold text-purple-600">
              {comparison.data?.transactions_change_percent > 0 ? '+' : ''}
              {formatPercentage(comparison.data?.transactions_change_percent || 0)}
            </p>
            <p className="text-sm text-purple-600">vs previous period</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h4 className="font-medium text-orange-800 mb-2">Customer Retention</h4>
            <p className="text-2xl font-bold text-orange-600">
              {summaryMetrics.data?.returning_customers && summaryMetrics.data?.unique_customers
                ? formatPercentage((summaryMetrics.data.returning_customers / summaryMetrics.data.unique_customers) * 100)
                : '0%'
              }
            </p>
            <p className="text-sm text-orange-600">returning customers</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SalesAnalytics