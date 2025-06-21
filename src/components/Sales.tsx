import React, { useState, useEffect } from 'react'
import { Calendar, Download, Eye, Receipt, Filter, TrendingUp, FileText, Printer, RefreshCw } from 'lucide-react'
import { useSales, useReceiptHistory, useDailyReceiptStats } from '../hooks/useSales'
import { format } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { formatCurrency, formatPakistanDateTimeForDisplay } from '../utils/dateUtils'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

const Sales: React.FC = () => {
  const [dateRange, setDateRange] = useState('today')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [selectedSale, setSelectedSale] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('sales')
  const [exportFormat, setExportFormat] = useState('csv')
  const [refreshInterval, setRefreshInterval] = useState(30) // seconds
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date())
  
  // Calculate date range based on selection
  const getDateRange = () => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    const last7Days = new Date(today)
    last7Days.setDate(last7Days.getDate() - 6)
    
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    
    const firstDayOfQuarter = new Date(today)
    firstDayOfQuarter.setMonth(Math.floor(today.getMonth() / 3) * 3, 1)
    
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1)
    
    switch (dateRange) {
      case 'today':
        return {
          from: format(today, 'yyyy-MM-dd'),
          to: format(today, 'yyyy-MM-dd')
        }
      case 'yesterday':
        return {
          from: format(yesterday, 'yyyy-MM-dd'),
          to: format(yesterday, 'yyyy-MM-dd')
        }
      case '7days':
        return {
          from: format(last7Days, 'yyyy-MM-dd'),
          to: format(today, 'yyyy-MM-dd')
        }
      case 'month':
        return {
          from: format(firstDayOfMonth, 'yyyy-MM-dd'),
          to: format(today, 'yyyy-MM-dd')
        }
      case 'quarter':
        return {
          from: format(firstDayOfQuarter, 'yyyy-MM-dd'),
          to: format(today, 'yyyy-MM-dd')
        }
      case 'year':
        return {
          from: format(firstDayOfYear, 'yyyy-MM-dd'),
          to: format(today, 'yyyy-MM-dd')
        }
      case 'custom':
        return {
          from: customDateFrom || format(last7Days, 'yyyy-MM-dd'),
          to: customDateTo || format(today, 'yyyy-MM-dd')
        }
      default:
        return {
          from: format(today, 'yyyy-MM-dd'),
          to: format(today, 'yyyy-MM-dd')
        }
    }
  }

  const { from: dateFrom, to: dateTo } = getDateRange()
  
  const { data: sales = [], isLoading: salesLoading, refetch: refetchSales } = useSales(dateFrom, dateTo)
  const { data: receiptHistory = [], isLoading: receiptLoading, refetch: refetchReceipts } = useReceiptHistory(dateFrom, dateTo)
  const { data: receiptStats, isLoading: statsLoading, refetch: refetchStats } = useDailyReceiptStats(dateFrom)

  // Set up auto-refresh
  useEffect(() => {
    const intervalId = setInterval(() => {
      refetchSales();
      refetchReceipts();
      refetchStats();
      setLastRefreshTime(new Date());
    }, refreshInterval * 1000);
    
    return () => clearInterval(intervalId);
  }, [refreshInterval, refetchSales, refetchReceipts, refetchStats]);

  const totalSales = sales.reduce((sum, sale) => sum + sale.total_amount, 0)
  const totalTransactions = sales.length
  const avgTransaction = totalTransactions > 0 ? totalSales / totalTransactions : 0

  const paymentMethodData = [
    { name: 'Cash', value: sales.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + s.total_amount, 0), color: '#10B981' },
    { name: 'Card', value: sales.filter(s => s.payment_method === 'card').reduce((sum, s) => sum + s.total_amount, 0), color: '#3B82F6' },
    { name: 'BNPL', value: sales.filter(s => s.payment_method === 'bnpl').reduce((sum, s) => sum + s.total_amount, 0), color: '#F59E0B' }
  ].filter(item => item.value > 0)

  const hourlySales = sales.reduce((acc, sale) => {
    const hour = new Date(sale.sale_date).getHours()
    const hourKey = `${hour}:00`
    acc[hourKey] = (acc[hourKey] || 0) + sale.total_amount
    return acc
  }, {} as Record<string, number>)

  const hourlyData = Object.entries(hourlySales).map(([hour, amount]) => ({
    hour,
    amount
  })).sort((a, b) => parseInt(a.hour) - parseInt(b.hour))

  const exportToCSV = () => {
    let csvData = []
    let headers = []
    
    if (activeTab === 'sales') {
      headers = ['Invoice', 'Receipt', 'Date', 'Customer', 'Items', 'Subtotal', 'Discount', 'Tax', 'Total', 'Payment Method', 'Status']
      csvData = sales.map(sale => [
        sale.invoice_number,
        sale.receipt_number,
        formatPakistanDateTimeForDisplay(new Date(sale.sale_date)),
        sale.customer?.name || 'Walk-in',
        sale.sale_items?.length || 0,
        sale.subtotal,
        sale.discount_amount,
        sale.tax_amount,
        sale.total_amount,
        sale.payment_method.toUpperCase(),
        sale.payment_status.toUpperCase()
      ])
    } else {
      headers = ['Receipt', 'Date', 'Customer', 'Items', 'Total', 'Payment Method', 'Status', 'Cashier', 'Printed']
      csvData = receiptHistory.map(receipt => [
        receipt.receipt_number,
        formatPakistanDateTimeForDisplay(new Date(receipt.sale_date)),
        receipt.customer_name || 'Walk-in',
        receipt.items_count,
        receipt.total_amount,
        receipt.payment_method.toUpperCase(),
        receipt.payment_status.replace('_', ' ').toUpperCase(),
        receipt.cashier_name || 'N/A',
        receipt.receipt_printed ? 'Yes' : 'No'
      ])
    }

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeTab}-report-${dateFrom}-to-${dateTo}.csv`
    link.click()
    URL.revokeObjectURL(url)
    
    toast.success(`${activeTab === 'sales' ? 'Sales' : 'Receipt'} data exported as CSV`)
  }

  const exportToPDF = () => {
    const doc = new jsPDF() as any
    
    // Add title
    doc.setFontSize(18)
    doc.text(`${activeTab === 'sales' ? 'Sales' : 'Receipt'} Report`, 14, 22)
    
    // Add date range
    doc.setFontSize(12)
    doc.text(`Period: ${dateFrom} to ${dateTo}`, 14, 30)
    doc.text(`Generated on: ${format(new Date(), 'dd-MM-yyyy HH:mm:ss')}`, 14, 38)
    
    // Add summary
    doc.setFontSize(14)
    doc.text('Summary', 14, 50)
    
    doc.setFontSize(10)
    doc.text(`Total Sales: ${formatCurrency(totalSales)}`, 20, 60)
    doc.text(`Total Transactions: ${totalTransactions}`, 20, 68)
    doc.text(`Average Transaction: ${formatCurrency(avgTransaction)}`, 20, 76)
    
    // Prepare table data
    let tableData = []
    
    if (activeTab === 'sales') {
      tableData = sales.map(sale => [
        sale.invoice_number,
        sale.receipt_number,
        formatPakistanDateTimeForDisplay(new Date(sale.sale_date)),
        sale.customer?.name || 'Walk-in',
        formatCurrency(sale.total_amount),
        sale.payment_method.toUpperCase(),
        sale.payment_status.replace('_', ' ').toUpperCase()
      ])
      
      // Create table with autotable
      doc.autoTable({
        startY: 85,
        head: [['Invoice', 'Receipt', 'Date', 'Customer', 'Total', 'Method', 'Status']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [66, 139, 202] },
        styles: { overflow: 'linebreak' },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 25 },
          2: { cellWidth: 35 },
          3: { cellWidth: 40 },
          4: { cellWidth: 25 },
          5: { cellWidth: 20 },
          6: { cellWidth: 20 }
        }
      })
    } else {
      tableData = receiptHistory.map(receipt => [
        receipt.receipt_number,
        formatPakistanDateTimeForDisplay(new Date(receipt.sale_date)),
        receipt.customer_name || 'Walk-in',
        receipt.items_count,
        formatCurrency(receipt.total_amount),
        receipt.payment_method.toUpperCase(),
        receipt.receipt_printed ? 'Yes' : 'No'
      ])
      
      // Create table with autotable
      doc.autoTable({
        startY: 85,
        head: [['Receipt', 'Date', 'Customer', 'Items', 'Total', 'Method', 'Printed']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [66, 139, 202] },
        styles: { overflow: 'linebreak' },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 35 },
          2: { cellWidth: 40 },
          3: { cellWidth: 15 },
          4: { cellWidth: 25 },
          5: { cellWidth: 20 },
          6: { cellWidth: 20 }
        }
      })
    }
    
    // Add payment method breakdown
    const finalY = (doc as any).lastAutoTable.finalY + 10
    
    doc.setFontSize(14)
    doc.text('Payment Method Breakdown', 14, finalY)
    
    doc.setFontSize(10)
    let paymentY = finalY + 10
    
    paymentMethodData.forEach((method, index) => {
      doc.text(`${method.name}: ${formatCurrency(method.value)} (${((method.value / totalSales) * 100).toFixed(1)}%)`, 20, paymentY)
      paymentY += 8
    })
    
    // Save the PDF
    doc.save(`${activeTab}-report-${dateFrom}-to-${dateTo}.pdf`)
    
    toast.success(`${activeTab === 'sales' ? 'Sales' : 'Receipt'} data exported as PDF`)
  }

  const exportSingleSaleToPDF = (sale: any) => {
    const doc = new jsPDF() as any
    
    doc.setFontSize(16)
    doc.text('Sale Details', 14, 20)
    
    doc.setFontSize(10)
    doc.text(`Invoice: ${sale.invoice_number}`, 14, 30)
    doc.text(`Receipt: ${sale.receipt_number}`, 14, 36)
    doc.text(`Date: ${formatPakistanDateTimeForDisplay(new Date(sale.sale_date))}`, 14, 42)
    doc.text(`Customer: ${sale.customer?.name || 'Walk-in Customer'}`, 14, 48)
    doc.text(`Payment: ${sale.payment_method.toUpperCase()}`, 14, 54)
    doc.text(`Status: ${sale.payment_status.replace('_', ' ').toUpperCase()}`, 14, 60)
    
    // Items table
    const tableData = sale.sale_items?.map((item: any) => [
      item.product?.name || 'Unknown Product',
      item.quantity,
      formatCurrency(item.unit_price),
      formatCurrency(item.total_price)
    ]) || []
    
    doc.autoTable({
      startY: 70,
      head: [['Product', 'Qty', 'Price', 'Total']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [66, 139, 202] }
    })
    
    // Totals
    const finalY = (doc as any).lastAutoTable.finalY + 10
    
    doc.text('Subtotal:', 120, finalY)
    doc.text(formatCurrency(sale.subtotal), 170, finalY, { align: 'right' })
    
    doc.text('Discount:', 120, finalY + 8)
    doc.text('-' + formatCurrency(sale.discount_amount), 170, finalY + 8, { align: 'right' })
    
    doc.text('Tax:', 120, finalY + 16)
    doc.text(formatCurrency(sale.tax_amount), 170, finalY + 16, { align: 'right' })
    
    doc.line(120, finalY + 20, 170, finalY + 20)
    
    doc.setFontSize(12)
    doc.text('Total:', 120, finalY + 28)
    doc.text(formatCurrency(sale.total_amount), 170, finalY + 28, { align: 'right' })
    
    doc.save(`sale-${sale.invoice_number}.pdf`)
    toast.success('Sale details exported as PDF')
  }

  const handleManualRefresh = () => {
    refetchSales();
    refetchReceipts();
    refetchStats();
    setLastRefreshTime(new Date());
    toast.success('Data refreshed successfully');
  }

  const isLoading = salesLoading || receiptLoading || statsLoading

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sales & Receipts</h1>
        <div className="flex items-center space-x-3">
          <div className="text-sm text-gray-600 flex items-center">
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Last updated: {format(lastRefreshTime, 'HH:mm:ss')}</span>
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
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          >
            <option value="csv">CSV</option>
            <option value="pdf">PDF</option>
          </select>
          <button
            onClick={exportFormat === 'csv' ? exportToCSV : exportToPDF}
            className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 flex items-center"
            disabled={isLoading}
          >
            {isLoading ? (
              <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Download className="h-5 w-5 mr-2" />
            )}
            Export
          </button>
        </div>
      </div>

      {/* Date Filter */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {dateRange === 'custom' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          <div className="ml-auto flex items-center text-sm text-gray-600">
            <Calendar className="h-4 w-4 mr-1" />
            {dateFrom === dateTo ? dateFrom : `${dateFrom} to ${dateTo}`}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Sales</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSales)}</p>
                </div>
                <div className="p-3 rounded-full bg-green-100">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Transactions</p>
                  <p className="text-2xl font-bold text-gray-900">{totalTransactions}</p>
                </div>
                <div className="p-3 rounded-full bg-blue-100">
                  <Receipt className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Avg Transaction</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(avgTransaction)}</p>
                </div>
                <div className="p-3 rounded-full bg-purple-100">
                  <Calendar className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Receipts Printed</p>
                  <p className="text-2xl font-bold text-gray-900">{receiptStats?.printed_receipts || 0}</p>
                  <p className="text-xs text-gray-500">of {receiptStats?.total_receipts || 0} total</p>
                </div>
                <div className="p-3 rounded-full bg-orange-100">
                  <Printer className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Hourly Sales Chart */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Hourly Sales</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip formatter={(value) => [formatCurrency(value as number), 'Sales']} />
                  <Bar dataKey="amount" fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Payment Methods Chart */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Methods</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={paymentMethodData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [formatCurrency(value as number), 'Amount']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="border-b border-gray-200">
              <nav className="flex space-x-8 px-6">
                {[
                  { id: 'sales', label: 'Sales Transactions', icon: Receipt },
                  { id: 'receipts', label: 'Receipt History', icon: FileText }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <tab.icon className="h-4 w-4 mr-2" />
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-6">
              {activeTab === 'sales' && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {sales.map((sale) => (
                        <tr key={sale.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">{sale.invoice_number}</td>
                          <td className="px-6 py-4 text-sm text-blue-600 font-mono">{sale.receipt_number}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {formatPakistanDateTimeForDisplay(new Date(sale.sale_date))}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {sale.customer?.name || 'Walk-in Customer'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {sale.sale_items?.length || 0} items
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {formatCurrency(sale.total_amount)}
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
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              sale.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
                              sale.payment_status === 'pending_bnpl' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {sale.payment_status.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => setSelectedSale(sale)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'receipts' && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt #</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cashier</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Printed</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {receiptHistory.map((receipt) => (
                        <tr key={receipt.receipt_number} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm font-mono text-blue-600">{receipt.receipt_number}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {formatPakistanDateTimeForDisplay(new Date(receipt.sale_date))}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            <div>{receipt.customer_name || 'Walk-in Customer'}</div>
                            {receipt.customer_phone && (
                              <div className="text-xs text-gray-500">{receipt.customer_phone}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">{receipt.items_count}</td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {formatCurrency(receipt.total_amount)}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              receipt.payment_method === 'cash' ? 'bg-green-100 text-green-800' :
                              receipt.payment_method === 'card' ? 'bg-blue-100 text-blue-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {receipt.payment_method.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              receipt.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
                              receipt.payment_status === 'pending_bnpl' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {receipt.payment_status.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">{receipt.cashier_name || 'N/A'}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              {receipt.receipt_printed ? (
                                <span className="text-green-600 flex items-center">
                                  <Printer className="h-4 w-4 mr-1" />
                                  Yes
                                </span>
                              ) : (
                                <span className="text-gray-400">No</span>
                              )}
                              {receipt.receipt_printed_at && (
                                <div className="text-xs text-gray-500 ml-2">
                                  {format(new Date(receipt.receipt_printed_at), 'HH:mm')}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {((activeTab === 'sales' && sales.length === 0) || 
                (activeTab === 'receipts' && receiptHistory.length === 0)) && !isLoading && (
                <div className="text-center py-8 text-gray-500">
                  No {activeTab === 'sales' ? 'sales' : 'receipts'} found for the selected date range.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Sale Detail Modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Sale Details</h3>
              <button
                onClick={() => setSelectedSale(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Invoice Number</p>
                  <p className="font-medium">{selectedSale.invoice_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Receipt Number</p>
                  <p className="font-medium font-mono text-blue-600">{selectedSale.receipt_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Date</p>
                  <p className="font-medium">{formatPakistanDateTimeForDisplay(new Date(selectedSale.sale_date))}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Customer</p>
                  <p className="font-medium">{selectedSale.customer?.name || 'Walk-in Customer'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Payment Method</p>
                  <p className="font-medium">{selectedSale.payment_method.toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Payment Status</p>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    selectedSale.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
                    selectedSale.payment_status === 'pending_bnpl' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {selectedSale.payment_status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Items</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Product</th>
                        <th className="px-3 py-2 text-left">Qty</th>
                        <th className="px-3 py-2 text-left">Price</th>
                        <th className="px-3 py-2 text-left">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSale.sale_items?.map((item: any) => (
                        <tr key={item.id} className="border-t">
                          <td className="px-3 py-2">{item.product?.name}</td>
                          <td className="px-3 py-2">{item.quantity}</td>
                          <td className="px-3 py-2">{formatCurrency(item.unit_price)}</td>
                          <td className="px-3 py-2">{formatCurrency(item.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(selectedSale.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount:</span>
                    <span>-{formatCurrency(selectedSale.discount_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax:</span>
                    <span>{formatCurrency(selectedSale.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Total:</span>
                    <span>{formatCurrency(selectedSale.total_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Receipt Information */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <h4 className="font-medium text-blue-800 mb-2">Receipt Information</h4>
                <div className="text-sm text-blue-700 space-y-1">
                  <div>Receipt Number: <span className="font-mono">{selectedSale.receipt_number}</span></div>
                  <div>Printed: {selectedSale.receipt_printed ? 'Yes' : 'No'}</div>
                  {selectedSale.receipt_printed_at && (
                    <div>Printed At: {formatPakistanDateTimeForDisplay(new Date(selectedSale.receipt_printed_at))}</div>
                  )}
                  {selectedSale.cashier_name && (
                    <div>Cashier: {selectedSale.cashier_name}</div>
                  )}
                </div>
              </div>

              {/* BNPL Information */}
              {selectedSale.payment_method === 'bnpl' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <h4 className="font-medium text-yellow-800 mb-2">BNPL Transaction</h4>
                  <div className="text-sm text-yellow-700">
                    <p>This sale was processed as Buy Now Pay Later. Payment confirmations will be generated when payments are received.</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={() => exportSingleSaleToPDF(selectedSale)}
                  className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 flex items-center"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Export PDF
                </button>
                <button
                  onClick={() => {
                    // Trigger receipt print
                    window.open(`/receipt/${selectedSale.receipt_number}`, '_blank');
                  }}
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

export default Sales