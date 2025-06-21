import React, { useState } from 'react'
import { Download, TrendingUp, Package, Users, DollarSign, Calendar, FileText, Filter, RefreshCw, CreditCard, TrendingDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'
import { format, subDays, startOfMonth, endOfMonth, startOfYear, subMonths, subYears } from 'date-fns'
import { formatCurrency, formatPakistanDateTimeForDisplay } from '../utils/dateUtils'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { useExpenses } from '../hooks/useExpenses'
import { useCashLedger } from '../hooks/useCashLedger'

const Reports: React.FC = () => {
  const [reportType, setReportType] = useState('sales')
  const [dateRange, setDateRange] = useState('7days')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [exportFormat, setExportFormat] = useState('pdf')
  
  // Calculate date range based on selection
  const getDateRange = () => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    switch (dateRange) {
      case 'today':
        return { start: today, end: today }
      case 'yesterday':
        return { start: yesterday, end: yesterday }
      case '7days':
        return { start: subDays(today, 6), end: today }
      case '30days':
        return { start: subDays(today, 29), end: today }
      case 'month':
        return { start: startOfMonth(today), end: today }
      case 'quarter':
        return { start: subMonths(today, 3), end: today }
      case 'year':
        return { start: startOfYear(today), end: today }
      case 'custom':
        return { 
          start: customDateFrom ? new Date(customDateFrom) : subDays(today, 6), 
          end: customDateTo ? new Date(customDateTo) : today 
        }
      default:
        return { start: subDays(today, 6), end: today }
    }
  }

  const { start: startDate, end: endDate } = getDateRange()
  const formattedStartDate = format(startDate, 'yyyy-MM-dd')
  const formattedEndDate = format(endDate, 'yyyy-MM-dd')

  // Sales Summary Query
  const { data: salesSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['sales-summary', formattedStartDate, formattedEndDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sales_summary', {
        start_date: formattedStartDate,
        end_date: formattedEndDate
      })
      if (error) throw error
      return data[0]
    }
  })

  // Top Selling Products Query
  const { data: topProducts, isLoading: productsLoading } = useQuery({
    queryKey: ['top-products', formattedStartDate, formattedEndDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_top_selling_products', {
        start_date: formattedStartDate,
        end_date: formattedEndDate,
        limit_count: 10
      })
      if (error) throw error
      return data
    }
  })

  // Daily Sales Trend
  const { data: dailySales, isLoading: trendLoading } = useQuery({
    queryKey: ['daily-sales', formattedStartDate, formattedEndDate],
    queryFn: async () => {
      const days = []
      const current = new Date(startDate)
      
      while (current <= endDate) {
        const dateStr = format(current, 'yyyy-MM-dd')
        const nextDay = new Date(current)
        nextDay.setDate(nextDay.getDate() + 1)
        const nextDayStr = format(nextDay, 'yyyy-MM-dd')
        
        const { data } = await supabase
          .from('sales')
          .select('total_amount')
          .gte('sale_date', dateStr)
          .lt('sale_date', nextDayStr)
        
        const total = data?.reduce((sum, sale) => sum + sale.total_amount, 0) || 0
        days.push({
          date: format(current, 'dd-MM'),
          sales: total
        })
        
        current.setDate(current.getDate() + 1)
      }
      
      return days
    }
  })

  // Inventory Status
  const { data: inventoryStatus, isLoading: inventoryLoading } = useQuery({
    queryKey: ['inventory-status'],
    queryFn: async () => {
      const { data: products, error } = await supabase
        .from('products')
        .select('stock_quantity, min_stock_level, sale_price, cost_price')
        .eq('is_active', true)
      
      if (error) throw error
      
      const totalValue = products.reduce((sum, p) => sum + (p.stock_quantity * p.sale_price), 0)
      const totalCost = products.reduce((sum, p) => sum + (p.stock_quantity * p.cost_price), 0)
      const lowStock = products.filter(p => p.stock_quantity <= p.min_stock_level).length
      const outOfStock = products.filter(p => p.stock_quantity === 0).length
      
      return {
        totalProducts: products.length,
        totalValue,
        totalCost,
        lowStock,
        outOfStock,
        potentialProfit: totalValue - totalCost
      }
    }
  })

  // Customer Analysis
  const { data: customerAnalysis, isLoading: customerLoading } = useQuery({
    queryKey: ['customer-analysis', formattedStartDate, formattedEndDate],
    queryFn: async () => {
      const { data: sales, error } = await supabase
        .from('sales')
        .select('customer_id, total_amount')
        .gte('sale_date', formattedStartDate)
        .lte('sale_date', formattedEndDate)
      
      if (error) throw error
      
      const walkInSales = sales.filter(s => !s.customer_id).reduce((sum, s) => sum + s.total_amount, 0)
      const registeredSales = sales.filter(s => s.customer_id).reduce((sum, s) => sum + s.total_amount, 0)
      
      return [
        { name: 'Walk-in Customers', value: walkInSales, color: '#3B82F6' },
        { name: 'Registered Customers', value: registeredSales, color: '#10B981' }
      ]
    }
  })

  // Financial data - Expenses
  const { data: expenses = [], isLoading: expensesLoading } = useExpenses(formattedStartDate, formattedEndDate)
  
  // Financial data - Cash Ledger
  const { data: cashTransactions = [], isLoading: cashLoading } = useCashLedger(formattedStartDate, formattedEndDate)

  // Calculate financial summaries
  const totalRevenue = salesSummary?.total_sales || 0
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const netProfit = totalRevenue - totalExpenses
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
  
  const cashIn = cashTransactions.filter(t => t.transaction_type === 'in').reduce((sum, t) => sum + t.amount, 0)
  const cashOut = cashTransactions.filter(t => t.transaction_type === 'out').reduce((sum, t) => sum + t.amount, 0)
  const cashBalance = cashIn - cashOut

  // Group expenses by category
  const expensesByCategory = expenses.reduce((acc, expense) => {
    const category = expense.category
    if (!acc[category]) acc[category] = 0
    acc[category] += expense.amount
    return acc
  }, {} as Record<string, number>)

  // Customer metrics
  const { data: customerMetrics, isLoading: customerMetricsLoading } = useQuery({
    queryKey: ['customer-metrics', formattedStartDate, formattedEndDate],
    queryFn: async () => {
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('id, name, loyalty_points, total_outstanding_dues, available_credit, credit_limit')
        .eq('is_active', true)
      
      if (customersError) throw customersError
      
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('customer_id, total_amount')
        .gte('sale_date', formattedStartDate)
        .lte('sale_date', formattedEndDate)
        .not('customer_id', 'is', null)
      
      if (salesError) throw salesError
      
      // Calculate customer metrics
      const totalCustomers = customers.length
      const totalLoyaltyPoints = customers.reduce((sum, c) => sum + c.loyalty_points, 0)
      const totalOutstandingDues = customers.reduce((sum, c) => sum + c.total_outstanding_dues, 0)
      const totalCreditLimit = customers.reduce((sum, c) => sum + c.credit_limit, 0)
      const totalAvailableCredit = customers.reduce((sum, c) => sum + c.available_credit, 0)
      
      // Calculate active customers (made a purchase in the period)
      const activeCustomerIds = new Set(sales.map(s => s.customer_id))
      const activeCustomers = activeCustomerIds.size
      
      // Calculate average purchase per customer
      const customerPurchases: Record<string, number> = {}
      sales.forEach(sale => {
        if (!customerPurchases[sale.customer_id]) customerPurchases[sale.customer_id] = 0
        customerPurchases[sale.customer_id] += sale.total_amount
      })
      
      const avgPurchasePerCustomer = Object.keys(customerPurchases).length > 0
        ? Object.values(customerPurchases).reduce((sum, amount) => sum + amount, 0) / Object.keys(customerPurchases).length
        : 0
      
      return {
        totalCustomers,
        activeCustomers,
        totalLoyaltyPoints,
        totalOutstandingDues,
        totalCreditLimit,
        totalAvailableCredit,
        creditUtilizationRate: totalCreditLimit > 0 ? (totalOutstandingDues / totalCreditLimit) * 100 : 0,
        avgPurchasePerCustomer
      }
    }
  })

  const exportReport = () => {
    try {
      const reportData = {
        reportType,
        dateRange: `${format(startDate, 'dd-MM-yyyy')} to ${format(endDate, 'dd-MM-yyyy')}`,
        salesSummary,
        topProducts,
        dailySales,
        inventoryStatus,
        customerAnalysis,
        financialSummary: {
          totalRevenue,
          totalExpenses,
          netProfit,
          profitMargin,
          cashIn,
          cashOut,
          cashBalance,
          expensesByCategory
        },
        customerMetrics,
        generatedAt: new Date().toISOString()
      }
      
      if (exportFormat === 'json') {
        const dataStr = JSON.stringify(reportData, null, 2)
        const dataBlob = new Blob([dataStr], { type: 'application/json' })
        const url = URL.createObjectURL(dataBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${reportType}-report-${format(startDate, 'yyyy-MM-dd')}-to-${format(endDate, 'yyyy-MM-dd')}.json`
        link.click()
        URL.revokeObjectURL(url)
        toast.success('Report exported as JSON')
      } else if (exportFormat === 'csv') {
        let csvContent = ''
        
        // Report header
        csvContent += `"${reportType.toUpperCase()} REPORT"\n`
        csvContent += `"Period: ${format(startDate, 'dd-MM-yyyy')} to ${format(endDate, 'dd-MM-yyyy')}"\n`
        csvContent += `"Generated: ${format(new Date(), 'dd-MM-yyyy HH:mm:ss')}"\n\n`
        
        // Sales Summary
        if (salesSummary) {
          csvContent += `"SALES SUMMARY"\n`
          csvContent += `"Total Sales","₨ ${salesSummary.total_sales.toLocaleString('en-PK')}"\n`
          csvContent += `"Total Transactions","${salesSummary.total_transactions}"\n`
          csvContent += `"Average Transaction","₨ ${salesSummary.avg_transaction.toLocaleString('en-PK')}"\n\n`
        }
        
        // Financial Summary
        csvContent += `"FINANCIAL SUMMARY"\n`
        csvContent += `"Total Revenue","₨ ${totalRevenue.toLocaleString('en-PK')}"\n`
        csvContent += `"Total Expenses","₨ ${totalExpenses.toLocaleString('en-PK')}"\n`
        csvContent += `"Net Profit","₨ ${netProfit.toLocaleString('en-PK')}"\n`
        csvContent += `"Profit Margin","${profitMargin.toFixed(2)}%"\n`
        csvContent += `"Cash Balance","₨ ${cashBalance.toLocaleString('en-PK')}"\n\n`
        
        // Expense Categories
        csvContent += `"EXPENSE BREAKDOWN"\n`
        csvContent += `"Category","Amount"\n`
        Object.entries(expensesByCategory)
          .sort((a, b) => b[1] - a[1]) // Sort by amount (descending)
          .forEach(([category, amount]) => {
            csvContent += `"${category}","₨ ${amount.toLocaleString('en-PK')}"\n`
          })
        csvContent += `\n`
        
        // Customer Metrics
        if (customerMetrics) {
          csvContent += `"CUSTOMER METRICS"\n`
          csvContent += `"Total Customers","${customerMetrics.totalCustomers}"\n`
          csvContent += `"Active Customers","${customerMetrics.activeCustomers}"\n`
          csvContent += `"Total Loyalty Points","${customerMetrics.totalLoyaltyPoints.toLocaleString('en-PK')}"\n`
          csvContent += `"Total Outstanding Dues","₨ ${customerMetrics.totalOutstandingDues.toLocaleString('en-PK')}"\n`
          csvContent += `"Credit Utilization Rate","${customerMetrics.creditUtilizationRate.toFixed(2)}%"\n`
          csvContent += `"Average Purchase Per Customer","₨ ${customerMetrics.avgPurchasePerCustomer.toLocaleString('en-PK')}"\n\n`
        }
        
        // Top Products
        if (topProducts && topProducts.length > 0) {
          csvContent += `"TOP SELLING PRODUCTS"\n`
          csvContent += `"Product","Quantity Sold","Revenue"\n`
          topProducts.forEach(product => {
            csvContent += `"${product.product_name}","${product.total_quantity}","₨ ${product.total_revenue.toLocaleString('en-PK')}"\n`
          })
          csvContent += `\n`
        }
        
        // Inventory Status
        if (inventoryStatus) {
          csvContent += `"INVENTORY STATUS"\n`
          csvContent += `"Total Products","${inventoryStatus.totalProducts}"\n`
          csvContent += `"Total Value","₨ ${inventoryStatus.totalValue.toLocaleString('en-PK')}"\n`
          csvContent += `"Total Cost","₨ ${inventoryStatus.totalCost.toLocaleString('en-PK')}"\n`
          csvContent += `"Potential Profit","₨ ${inventoryStatus.potentialProfit.toLocaleString('en-PK')}"\n`
          csvContent += `"Low Stock Products","${inventoryStatus.lowStock}"\n`
          csvContent += `"Out of Stock Products","${inventoryStatus.outOfStock}"\n\n`
        }
        
        const blob = new Blob([csvContent], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${reportType}-report-${format(startDate, 'yyyy-MM-dd')}-to-${format(endDate, 'yyyy-MM-dd')}.csv`
        link.click()
        URL.revokeObjectURL(url)
        toast.success('Report exported as CSV')
      } else {
        // PDF Export
        const doc = new jsPDF() as any
        
        // Title
        doc.setFontSize(18)
        doc.text(`${reportType.toUpperCase()} REPORT`, 14, 22)
        
        // Date range
        doc.setFontSize(12)
        doc.text(`Period: ${format(startDate, 'dd-MM-yyyy')} to ${format(endDate, 'dd-MM-yyyy')}`, 14, 30)
        doc.text(`Generated: ${format(new Date(), 'dd-MM-yyyy HH:mm:ss')}`, 14, 38)
        
        // Sales Summary
        if (salesSummary) {
          doc.setFontSize(14)
          doc.text('Sales Summary', 14, 50)
          
          const salesData = [
            ['Total Sales', formatCurrency(salesSummary.total_sales)],
            ['Total Transactions', salesSummary.total_transactions.toString()],
            ['Average Transaction', formatCurrency(salesSummary.avg_transaction)]
          ]
          
          doc.autoTable({
            startY: 55,
            head: [['Metric', 'Value']],
            body: salesData,
            theme: 'striped',
            headStyles: { fillColor: [66, 139, 202] }
          })
        }
        
        // Financial Summary
        const financialY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : 100
        
        doc.setFontSize(14)
        doc.text('Financial Summary', 14, financialY)
        
        const financialData = [
          ['Total Revenue', formatCurrency(totalRevenue)],
          ['Total Expenses', formatCurrency(totalExpenses)],
          ['Net Profit', formatCurrency(netProfit)],
          ['Profit Margin', `${profitMargin.toFixed(2)}%`],
          ['Cash Balance', formatCurrency(cashBalance)]
        ]
        
        doc.autoTable({
          startY: financialY + 5,
          head: [['Metric', 'Value']],
          body: financialData,
          theme: 'striped',
          headStyles: { fillColor: [66, 139, 202] }
        })
        
        // Expense Categories
        const expensesY = (doc as any).lastAutoTable.finalY + 10
        
        doc.setFontSize(14)
        doc.text('Expense Breakdown', 14, expensesY)
        
        const expensesData = Object.entries(expensesByCategory)
          .sort((a, b) => b[1] - a[1]) // Sort by amount (descending)
          .map(([category, amount]) => [category, formatCurrency(amount)])
        
        if (expensesData.length > 0) {
          doc.autoTable({
            startY: expensesY + 5,
            head: [['Category', 'Amount']],
            body: expensesData,
            theme: 'striped',
            headStyles: { fillColor: [66, 139, 202] }
          })
        } else {
          doc.setFontSize(10)
          doc.text('No expenses recorded for this period', 14, expensesY + 10)
        }
        
        // Check if we need a new page for customer metrics
        if ((doc as any).lastAutoTable.finalY > 220) {
          doc.addPage()
        }
        
        // Customer Metrics
        const customerY = (doc as any).lastAutoTable.finalY + 10
        
        if (customerY > 240) {
          doc.addPage()
          doc.setFontSize(14)
          doc.text('Customer Metrics', 14, 20)
          
          if (customerMetrics) {
            const customerData = [
              ['Total Customers', customerMetrics.totalCustomers.toString()],
              ['Active Customers', customerMetrics.activeCustomers.toString()],
              ['Total Loyalty Points', customerMetrics.totalLoyaltyPoints.toLocaleString('en-PK')],
              ['Total Outstanding Dues', formatCurrency(customerMetrics.totalOutstandingDues)],
              ['Credit Utilization Rate', `${customerMetrics.creditUtilizationRate.toFixed(2)}%`],
              ['Average Purchase Per Customer', formatCurrency(customerMetrics.avgPurchasePerCustomer)]
            ]
            
            doc.autoTable({
              startY: 25,
              head: [['Metric', 'Value']],
              body: customerData,
              theme: 'striped',
              headStyles: { fillColor: [66, 139, 202] }
            })
          }
        } else {
          doc.setFontSize(14)
          doc.text('Customer Metrics', 14, customerY)
          
          if (customerMetrics) {
            const customerData = [
              ['Total Customers', customerMetrics.totalCustomers.toString()],
              ['Active Customers', customerMetrics.activeCustomers.toString()],
              ['Total Loyalty Points', customerMetrics.totalLoyaltyPoints.toLocaleString('en-PK')],
              ['Total Outstanding Dues', formatCurrency(customerMetrics.totalOutstandingDues)],
              ['Credit Utilization Rate', `${customerMetrics.creditUtilizationRate.toFixed(2)}%`],
              ['Average Purchase Per Customer', formatCurrency(customerMetrics.avgPurchasePerCustomer)]
            ]
            
            doc.autoTable({
              startY: customerY + 5,
              head: [['Metric', 'Value']],
              body: customerData,
              theme: 'striped',
              headStyles: { fillColor: [66, 139, 202] }
            })
          }
        }
        
        // Top Products
        if (topProducts && topProducts.length > 0) {
          // Check if we need a new page
          if ((doc as any).lastAutoTable.finalY > 220) {
            doc.addPage()
            doc.setFontSize(14)
            doc.text('Top Selling Products', 14, 20)
            
            const productData = topProducts.map(product => [
              product.product_name,
              product.total_quantity.toString(),
              formatCurrency(product.total_revenue)
            ])
            
            doc.autoTable({
              startY: 25,
              head: [['Product', 'Quantity', 'Revenue']],
              body: productData,
              theme: 'striped',
              headStyles: { fillColor: [66, 139, 202] }
            })
          } else {
            const topProductsY = (doc as any).lastAutoTable.finalY + 10
            
            doc.setFontSize(14)
            doc.text('Top Selling Products', 14, topProductsY)
            
            const productData = topProducts.map(product => [
              product.product_name,
              product.total_quantity.toString(),
              formatCurrency(product.total_revenue)
            ])
            
            doc.autoTable({
              startY: topProductsY + 5,
              head: [['Product', 'Quantity', 'Revenue']],
              body: productData,
              theme: 'striped',
              headStyles: { fillColor: [66, 139, 202] }
            })
          }
        }
        
        // Inventory Status
        if (inventoryStatus) {
          // Check if we need a new page
          if ((doc as any).lastAutoTable.finalY > 220) {
            doc.addPage()
            doc.setFontSize(14)
            doc.text('Inventory Status', 14, 20)
            
            const inventoryData = [
              ['Total Products', inventoryStatus.totalProducts.toString()],
              ['Total Value', formatCurrency(inventoryStatus.totalValue)],
              ['Total Cost', formatCurrency(inventoryStatus.totalCost)],
              ['Potential Profit', formatCurrency(inventoryStatus.potentialProfit)],
              ['Low Stock Products', inventoryStatus.lowStock.toString()],
              ['Out of Stock Products', inventoryStatus.outOfStock.toString()]
            ]
            
            doc.autoTable({
              startY: 25,
              head: [['Metric', 'Value']],
              body: inventoryData,
              theme: 'striped',
              headStyles: { fillColor: [66, 139, 202] }
            })
          } else {
            const inventoryY = (doc as any).lastAutoTable.finalY + 10
            
            doc.setFontSize(14)
            doc.text('Inventory Status', 14, inventoryY)
            
            const inventoryData = [
              ['Total Products', inventoryStatus.totalProducts.toString()],
              ['Total Value', formatCurrency(inventoryStatus.totalValue)],
              ['Total Cost', formatCurrency(inventoryStatus.totalCost)],
              ['Potential Profit', formatCurrency(inventoryStatus.potentialProfit)],
              ['Low Stock Products', inventoryStatus.lowStock.toString()],
              ['Out of Stock Products', inventoryStatus.outOfStock.toString()]
            ]
            
            doc.autoTable({
              startY: inventoryY + 5,
              head: [['Metric', 'Value']],
              body: inventoryData,
              theme: 'striped',
              headStyles: { fillColor: [66, 139, 202] }
            })
          }
        }
        
        doc.save(`${reportType}-report-${format(startDate, 'yyyy-MM-dd')}-to-${format(endDate, 'yyyy-MM-dd')}.pdf`)
        toast.success('Report exported as PDF')
      }
    } catch (error) {
      console.error('Error exporting report:', error)
      toast.error('Failed to export report')
    }
  }

  const isLoading = summaryLoading || productsLoading || trendLoading || inventoryLoading || customerLoading || expensesLoading || cashLoading || customerMetricsLoading

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Business Reports</h1>
        <div className="flex items-center space-x-3">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          >
            <option value="pdf">PDF</option>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
          <button
            onClick={exportReport}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 flex items-center"
            disabled={isLoading}
          >
            {isLoading ? (
              <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Download className="h-5 w-5 mr-2" />
            )}
            Export Report
          </button>
        </div>
      </div>

      {/* Report Type & Filters */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="sales">Sales Report</option>
              <option value="inventory">Inventory Report</option>
              <option value="customer">Customer Report</option>
              <option value="financial">Financial Report</option>
            </select>
          </div>
          
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
              <option value="30days">Last 30 Days</option>
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
            {format(startDate, 'dd-MM-yyyy')} to {format(endDate, 'dd-MM-yyyy')}
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
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(salesSummary?.total_sales || 0)}</p>
                </div>
                <div className="p-3 rounded-full bg-green-100">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Net Profit</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(netProfit)}</p>
                </div>
                <div className="p-3 rounded-full bg-blue-100">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Inventory Value</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(inventoryStatus?.totalValue || 0)}</p>
                </div>
                <div className="p-3 rounded-full bg-purple-100">
                  <Package className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Cash Balance</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(cashBalance)}</p>
                </div>
                <div className="p-3 rounded-full bg-orange-100">
                  <DollarSign className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Revenue</span>
                    <span className="text-green-600 font-medium">{formatCurrency(totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Expenses</span>
                    <span className="text-red-600 font-medium">{formatCurrency(totalExpenses)}</span>
                  </div>
                  <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                    <span className="font-medium">Net Profit</span>
                    <span className={`font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(netProfit)}
                    </span>
                  </div>
                  <div className="pt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      {totalRevenue > 0 && (
                        <div 
                          className={`h-2.5 rounded-full ${netProfit >= 0 ? 'bg-green-600' : 'bg-red-600'}`}
                          style={{ width: `${Math.min(100, Math.max(0, (netProfit / totalRevenue) * 100))}%` }}
                        ></div>
                      )}
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0%</span>
                      <span>Profit Margin: {profitMargin.toFixed(1)}%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-4">Expense Breakdown</h4>
                {Object.keys(expensesByCategory).length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(expensesByCategory)
                      .sort((a, b) => b[1] - a[1]) // Sort by amount (descending)
                      .map(([category, amount]) => (
                        <div key={category} className="flex justify-between items-center">
                          <span className="text-gray-700">{category}</span>
                          <span className="text-gray-900 font-medium">{formatCurrency(amount)}</span>
                        </div>
                      ))
                    }
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    No expenses recorded for this period
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Customer Metrics */}
          {customerMetrics && (
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Metrics</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-800 mb-2">Customer Base</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-blue-700">Total Customers:</span>
                      <span className="font-semibold text-blue-900">{customerMetrics.totalCustomers}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">Active Customers:</span>
                      <span className="font-semibold text-blue-900">{customerMetrics.activeCustomers}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">Activity Rate:</span>
                      <span className="font-semibold text-blue-900">
                        {customerMetrics.totalCustomers > 0 
                          ? ((customerMetrics.activeCustomers / customerMetrics.totalCustomers) * 100).toFixed(1)
                          : 0
                        }%
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-medium text-green-800 mb-2">Loyalty & Purchases</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-green-700">Total Loyalty Points:</span>
                      <span className="font-semibold text-green-900">{customerMetrics.totalLoyaltyPoints.toLocaleString('en-PK')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-700">Avg Points/Customer:</span>
                      <span className="font-semibold text-green-900">
                        {customerMetrics.totalCustomers > 0 
                          ? Math.round(customerMetrics.totalLoyaltyPoints / customerMetrics.totalCustomers)
                          : 0
                        }
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-700">Avg Purchase:</span>
                      <span className="font-semibold text-green-900">{formatCurrency(customerMetrics.avgPurchasePerCustomer)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-medium text-red-800 mb-2">Credit Status</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-red-700">Outstanding Dues:</span>
                      <span className="font-semibold text-red-900">{formatCurrency(customerMetrics.totalOutstandingDues)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-700">Available Credit:</span>
                      <span className="font-semibold text-red-900">{formatCurrency(customerMetrics.totalAvailableCredit)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-700">Credit Utilization:</span>
                      <span className="font-semibold text-red-900">{customerMetrics.creditUtilizationRate.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Daily Sales Trend */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Sales Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailySales}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value) => [formatCurrency(value as number), 'Sales']} />
                  <Line type="monotone" dataKey="sales" stroke="#3B82F6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Customer Analysis */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Analysis</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={customerAnalysis}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {customerAnalysis?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [formatCurrency(value as number), 'Sales']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Products Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Top Selling Products</h3>
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    if (topProducts) {
                      const csvContent = [
                        ['Product', 'Quantity Sold', 'Revenue'],
                        ...topProducts.map(p => [p.product_name, p.total_quantity, `₨ ${p.total_revenue.toLocaleString('en-PK')}`])
                      ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
                      
                      const blob = new Blob([csvContent], { type: 'text/csv' })
                      const url = URL.createObjectURL(blob)
                      const link = document.createElement('a')
                      link.href = url
                      link.download = `top-products-${format(startDate, 'yyyy-MM-dd')}-to-${format(endDate, 'yyyy-MM-dd')}.csv`
                      link.click()
                      URL.revokeObjectURL(url)
                      toast.success('Top products exported as CSV')
                    }
                  }}
                  className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 flex items-center"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity Sold</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {topProducts?.map((product, index) => (
                    <tr key={product.product_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8 bg-gray-200 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-600">{index + 1}</span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{product.product_name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{product.total_quantity}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatCurrency(product.total_revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inventory Alerts */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Inventory Status</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{inventoryStatus?.totalProducts || 0}</div>
                  <div className="text-sm text-gray-600">Total Products</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{inventoryStatus?.lowStock || 0}</div>
                  <div className="text-sm text-gray-600">Low Stock</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{inventoryStatus?.outOfStock || 0}</div>
                  <div className="text-sm text-gray-600">Out of Stock</div>
                </div>
              </div>
              
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(inventoryStatus?.totalValue || 0)}</div>
                    <div className="text-sm text-gray-600">Total Retail Value</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{formatCurrency(inventoryStatus?.totalCost || 0)}</div>
                    <div className="text-sm text-gray-600">Total Cost Value</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{formatCurrency(inventoryStatus?.potentialProfit || 0)}</div>
                    <div className="text-sm text-gray-600">Potential Profit</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Reports