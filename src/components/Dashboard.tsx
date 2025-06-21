import React, { useState, useEffect } from 'react'
import { 
  TrendingUp, 
  Package, 
  Users, 
  DollarSign, 
  AlertTriangle,
  Calendar,
  PackageX,
  Clock,
  AlertCircle,
  XCircle,
  CreditCard,
  RefreshCw
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'
import { format } from 'date-fns'
import { useDashboardSummary, useHourlySalesTrend, usePaymentMethodBreakdown, useRecentSales } from '../hooks/useDashboard'
import { formatCurrency, formatPakistanDateTimeForDisplay } from '../utils/dateUtils'
import toast from 'react-hot-toast'

const Dashboard: React.FC = () => {
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date())
  const [refreshInterval, setRefreshInterval] = useState(30) // seconds
  
  const { 
    data: dashboardData, 
    isLoading: dashboardLoading,
    refetch: refetchDashboard
  } = useDashboardSummary()
  
  const {
    data: hourlySales,
    isLoading: hourlySalesLoading,
    refetch: refetchHourlySales
  } = useHourlySalesTrend()
  
  const {
    data: paymentMethods,
    isLoading: paymentMethodsLoading,
    refetch: refetchPaymentMethods
  } = usePaymentMethodBreakdown()
  
  const {
    data: recentSales,
    isLoading: recentSalesLoading,
    refetch: refetchRecentSales
  } = useRecentSales(5)

  // Set up auto-refresh
  useEffect(() => {
    const intervalId = setInterval(() => {
      refetchDashboard();
      refetchHourlySales();
      refetchPaymentMethods();
      refetchRecentSales();
      setLastRefreshTime(new Date());
    }, refreshInterval * 1000);
    
    return () => clearInterval(intervalId);
  }, [refreshInterval, refetchDashboard, refetchHourlySales, refetchPaymentMethods, refetchRecentSales]);

  const handleManualRefresh = () => {
    refetchDashboard();
    refetchHourlySales();
    refetchPaymentMethods();
    refetchRecentSales();
    setLastRefreshTime(new Date());
    toast.success('Dashboard refreshed');
  }

  const isLoading = dashboardLoading || hourlySalesLoading || paymentMethodsLoading || recentSalesLoading

  const StatCard: React.FC<{ title: string; value: string; icon: React.ElementType; color: string; subtitle?: string }> = ({ title, value, icon: Icon, color, subtitle }) => (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  )

  const AlertCard: React.FC<{ 
    title: string; 
    count: number; 
    icon: React.ElementType; 
    color: string; 
    bgColor: string;
    products: any[]
  }> = ({ title, count, icon: Icon, color, bgColor, products }) => (
    <div className={`flex items-center p-3 ${bgColor} rounded-lg border ${color.replace('text-', 'border-')}`}>
      <Icon className={`h-5 w-5 ${color} mr-3`} />
      <div className="flex-1">
        <p className={`text-sm font-medium ${color.replace('600', '800')}`}>{title}</p>
        <p className={`text-xs ${color.replace('600', '600')}`}>
          {count} product{count !== 1 ? 's' : ''}
          {products.length > 0 && count <= 3 && (
            <span className="block mt-1">
              {products.slice(0, 3).map(p => p.name).join(', ')}
            </span>
          )}
          {count > 3 && (
            <span className="block mt-1">
              {products.slice(0, 2).map(p => p.name).join(', ')} and {count - 2} more
            </span>
          )}
        </p>
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500 flex items-center">
            <Clock className="h-4 w-4 mr-1" />
            Last updated: {lastRefreshTime.toLocaleTimeString()}
          </div>
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="px-2 py-1 border border-gray-300 rounded-md text-sm"
          >
            <option value="15">Refresh: 15s</option>
            <option value="30">Refresh: 30s</option>
            <option value="60">Refresh: 1m</option>
            <option value="300">Refresh: 5m</option>
          </select>
          <button
            onClick={handleManualRefresh}
            className="bg-blue-500 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-600 flex items-center"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <>
          {/* Main Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Today's Sales"
              value={formatCurrency(dashboardData?.sales?.daily_sales || 0)}
              icon={DollarSign}
              color="bg-green-500"
              subtitle={`${dashboardData?.sales?.daily_transactions || 0} transactions`}
            />
            <StatCard
              title="Total Products"
              value={(dashboardData?.inventory?.total_products || 0).toString()}
              icon={Package}
              color="bg-blue-500"
              subtitle="Active inventory"
            />
            <StatCard
              title="Total Customers"
              value={(dashboardData?.customers?.total_customers || 0).toString()}
              icon={Users}
              color="bg-purple-500"
              subtitle="Registered customers"
            />
            <StatCard
              title="Monthly Revenue"
              value={formatCurrency(dashboardData?.sales?.monthly_sales || 0)}
              icon={TrendingUp}
              color="bg-orange-500"
              subtitle="Current month"
            />
          </div>

          {/* Customer Financial Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
              title="Total Outstanding"
              value={formatCurrency(dashboardData?.customers?.total_outstanding_dues || 0)}
              icon={CreditCard}
              color="bg-red-500"
              subtitle="BNPL dues"
            />
            <StatCard
              title="Loyalty Points"
              value={(dashboardData?.customers?.total_loyalty_points || 0).toLocaleString()}
              icon={Users}
              color="bg-indigo-500"
              subtitle="Total points issued"
            />
            <StatCard
              title="Avg Order Value"
              value={formatCurrency(dashboardData?.sales?.average_order_value || 0)}
              icon={TrendingUp}
              color="bg-teal-500"
              subtitle="Per transaction"
            />
          </div>

          {/* Charts and Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hourly Sales Chart */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Today's Hourly Sales</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hourlySales}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour_label" />
                  <YAxis />
                  <Tooltip formatter={(value) => [formatCurrency(value as number), 'Sales']} />
                  <Bar dataKey="avg_sales" fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Payment Methods Chart */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Methods</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={paymentMethods}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {paymentMethods?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={
                        entry.name === 'CASH' ? '#10B981' : 
                        entry.name === 'CARD' ? '#3B82F6' : 
                        '#F59E0B'
                      } />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [formatCurrency(value as number), 'Amount']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Inventory Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Inventory Alerts */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Inventory Alerts</h3>
              <div className="space-y-3">
                {dashboardData?.inventory?.out_of_stock_count > 0 && (
                  <AlertCard
                    title="Out of Stock Alert"
                    count={dashboardData.inventory.out_of_stock_count}
                    icon={PackageX}
                    color="text-red-600"
                    bgColor="bg-red-50"
                    products={dashboardData.critical_products?.filter(p => p.issues.includes('out_of_stock')) || []}
                  />
                )}
                
                {dashboardData?.inventory?.low_stock_count > 0 && (
                  <AlertCard
                    title="Low Stock Alert"
                    count={dashboardData.inventory.low_stock_count}
                    icon={AlertTriangle}
                    color="text-yellow-600"
                    bgColor="bg-yellow-50"
                    products={dashboardData.critical_products?.filter(p => p.issues.includes('low_stock')) || []}
                  />
                )}

                {dashboardData?.inventory?.expired_count > 0 && (
                  <AlertCard
                    title="Expired Products"
                    count={dashboardData.inventory.expired_count}
                    icon={XCircle}
                    color="text-red-600"
                    bgColor="bg-red-50"
                    products={dashboardData.critical_products?.filter(p => p.issues.includes('expired')) || []}
                  />
                )}

                {dashboardData?.inventory?.near_expiry_count > 0 && (
                  <AlertCard
                    title="Near Expiry Alert"
                    count={dashboardData.inventory.near_expiry_count}
                    icon={Clock}
                    color="text-orange-600"
                    bgColor="bg-orange-50"
                    products={dashboardData.critical_products?.filter(p => p.issues.includes('near_expiry')) || []}
                  />
                )}

                {(!dashboardData?.inventory?.low_stock_count && 
                  !dashboardData?.inventory?.expired_count && 
                  !dashboardData?.inventory?.near_expiry_count && 
                  !dashboardData?.inventory?.out_of_stock_count) && (
                  <div className="flex items-center p-3 bg-green-50 rounded-lg border border-green-200">
                    <AlertCircle className="h-5 w-5 text-green-600 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-green-800">All Good!</p>
                      <p className="text-xs text-green-600">No inventory alerts at this time</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              {(dashboardData?.inventory?.low_stock_count > 0 || 
                dashboardData?.inventory?.out_of_stock_count > 0 || 
                dashboardData?.inventory?.expired_count > 0 || 
                dashboardData?.inventory?.near_expiry_count > 0) && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Quick Actions</h4>
                  <div className="flex flex-wrap gap-2">
                    <button className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">
                      View Inventory
                    </button>
                    <button className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">
                      Create Purchase Order
                    </button>
                    <button className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200">
                      Generate Report
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Recent Sales */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Sales</h3>
              {recentSales && recentSales.length > 0 ? (
                <div className="space-y-3">
                  {recentSales.map((sale) => (
                    <div key={sale.id} className="p-3 border border-gray-200 rounded-lg">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-gray-900">Receipt: {sale.receipt_number}</p>
                          <p className="text-sm text-gray-600">
                            {formatPakistanDateTimeForDisplay(new Date(sale.sale_date))}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-gray-900">{formatCurrency(sale.total_amount)}</p>
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            sale.payment_method === 'cash' ? 'bg-green-100 text-green-800' :
                            sale.payment_method === 'card' ? 'bg-blue-100 text-blue-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {sale.payment_method.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        {sale.customer ? `Customer: ${sale.customer.name}` : 'Walk-in Customer'} • 
                        {sale.sale_items?.length || 0} items
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No recent sales to display
                </div>
              )}
            </div>
          </div>

          {/* Critical Products */}
          {dashboardData?.critical_products && dashboardData.critical_products.length > 0 && (
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Critical Products</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Min Level</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Issues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {dashboardData.critical_products.map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{product.name}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{product.sku}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{product.stock_quantity}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{product.min_stock_level}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {product.expiry_date ? format(new Date(product.expiry_date), 'dd-MM-yyyy') : '-'}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {product.issues.map((issue: string, index: number) => (
                              <span key={index} className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                issue === 'out_of_stock' ? 'bg-red-100 text-red-800' :
                                issue === 'low_stock' ? 'bg-yellow-100 text-yellow-800' :
                                issue === 'expired' ? 'bg-red-100 text-red-800' :
                                'bg-orange-100 text-orange-800'
                              }`}>
                                {issue.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Dashboard