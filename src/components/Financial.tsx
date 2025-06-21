import React, { useState } from 'react'
import { Plus, DollarSign, TrendingUp, TrendingDown, Calendar, Download, FileText, Filter, RefreshCw } from 'lucide-react'
import { useExpenses, useCreateExpense } from '../hooks/useExpenses'
import { useCashLedger, useCreateCashTransaction } from '../hooks/useCashLedger'
import { useSales } from '../hooks/useSales'
import { format } from 'date-fns'
import { formatCurrency, formatPakistanDateTimeForDisplay } from '../utils/dateUtils'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

const Financial: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview')
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showCashModal, setShowCashModal] = useState(false)
  const [dateRange, setDateRange] = useState('today')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [exportFormat, setExportFormat] = useState('pdf')
  const [isExporting, setIsExporting] = useState(false)

  // Calculate date range based on selection
  const getDateRange = () => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    const last7Days = new Date(today)
    last7Days.setDate(last7Days.getDate() - 6)
    
    const lastMonth = new Date(today)
    lastMonth.setDate(1)
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    
    const lastQuarter = new Date(today)
    lastQuarter.setMonth(lastQuarter.getMonth() - 3)
    
    const lastYear = new Date(today)
    lastYear.setFullYear(lastYear.getFullYear() - 1)
    
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
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
        return {
          from: format(firstDayOfMonth, 'yyyy-MM-dd'),
          to: format(today, 'yyyy-MM-dd')
        }
      case 'quarter':
        return {
          from: format(lastQuarter, 'yyyy-MM-dd'),
          to: format(today, 'yyyy-MM-dd')
        }
      case 'year':
        const firstDayOfYear = new Date(today.getFullYear(), 0, 1)
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

  const { data: expenses = [], isLoading: expensesLoading } = useExpenses(dateFrom, dateTo)
  const { data: cashTransactions = [], isLoading: cashLoading } = useCashLedger(dateFrom, dateTo)
  const { data: sales = [], isLoading: salesLoading } = useSales(dateFrom, dateTo)
  const createExpense = useCreateExpense()
  const createCashTransaction = useCreateCashTransaction()

  const [expenseForm, setExpenseForm] = useState({
    category: '',
    description: '',
    amount: '',
    receipt_number: '',
    notes: ''
  })

  const [cashForm, setCashForm] = useState({
    transaction_type: 'in',
    amount: '',
    description: '',
    reference_id: ''
  })

  const totalRevenue = sales.reduce((sum, sale) => sum + sale.total_amount, 0)
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const netProfit = totalRevenue - totalExpenses

  const cashIn = cashTransactions.filter(t => t.transaction_type === 'in').reduce((sum, t) => sum + t.amount, 0)
  const cashOut = cashTransactions.filter(t => t.transaction_type === 'out').reduce((sum, t) => sum + t.amount, 0)
  const cashBalance = cashIn - cashOut

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createExpense.mutateAsync({
        ...expenseForm,
        amount: parseFloat(expenseForm.amount)
      })
      setExpenseForm({ category: '', description: '', amount: '', receipt_number: '', notes: '' })
      setShowExpenseModal(false)
      toast.success('Expense added successfully')
    } catch (error) {
      console.error('Error creating expense:', error)
      toast.error('Failed to add expense')
    }
  }

  const handleCashSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createCashTransaction.mutateAsync({
        ...cashForm,
        amount: parseFloat(cashForm.amount)
      })
      setCashForm({ transaction_type: 'in', amount: '', description: '', reference_id: '' })
      setShowCashModal(false)
      toast.success('Cash transaction added successfully')
    } catch (error) {
      console.error('Error creating cash transaction:', error)
      toast.error('Failed to add cash transaction')
    }
  }

  const expenseCategories = [
    'Rent', 'Utilities', 'Supplies', 'Marketing', 'Transportation', 
    'Maintenance', 'Insurance', 'Professional Services', 'Other'
  ]

  const exportToCSV = (data: any[], filename: string, headers: string[]) => {
    try {
      const csvRows = []
      
      // Add headers
      csvRows.push(headers.join(','))
      
      // Add data rows
      for (const row of data) {
        const values = headers.map(header => {
          const key = header.toLowerCase().replace(/ /g, '_')
          const value = row[key]
          return `"${value !== undefined ? value : ''}"`
        })
        csvRows.push(values.join(','))
      }
      
      // Create and download CSV file
      const csvString = csvRows.join('\n')
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', `${filename}-${dateFrom}-to-${dateTo}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      toast.success(`${filename} exported successfully`)
    } catch (error) {
      console.error('Error exporting to CSV:', error)
      toast.error(`Failed to export ${filename} as CSV: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const exportToPDF = (data: any[], filename: string, title: string) => {
    try {
      const doc = new jsPDF() as any
      
      // Add title
      doc.setFontSize(18)
      doc.text(title, 14, 22)
      
      // Add date range
      doc.setFontSize(12)
      doc.text(`Period: ${dateFrom} to ${dateTo}`, 14, 30)
      doc.text(`Generated on: ${format(new Date(), 'dd-MM-yyyy HH:mm:ss')}`, 14, 38)
      
      // Prepare table data
      let tableData = []
      
      if (activeTab === 'expenses') {
        // Expenses table
        tableData = expenses.map(expense => [
          format(new Date(expense.expense_date), 'dd-MM-yyyy'),
          expense.category,
          expense.description,
          formatCurrency(expense.amount),
          expense.receipt_number || '-'
        ])
        
        // Create table with autotable
        doc.autoTable({
          startY: 45,
          head: [['Date', 'Category', 'Description', 'Amount', 'Receipt']],
          body: tableData,
          theme: 'striped',
          headStyles: { fillColor: [66, 139, 202] },
          styles: { overflow: 'linebreak' },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 30 },
            2: { cellWidth: 60 },
            3: { cellWidth: 30 },
            4: { cellWidth: 30 }
          }
        })
        
        // Add summary
        const finalY = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(12)
        doc.text('Summary', 14, finalY)
        
        doc.setFontSize(10)
        doc.text(`Total Expenses: ${formatCurrency(totalExpenses)}`, 14, finalY + 8)
        doc.text(`Total Categories: ${new Set(expenses.map(e => e.category)).size}`, 14, finalY + 16)
        doc.text(`Number of Transactions: ${expenses.length}`, 14, finalY + 24)
      } else {
        // Cash ledger table
        tableData = cashTransactions.map((transaction, index) => {
          const runningBalance = cashTransactions
            .slice(0, index + 1)
            .reduce((sum, t) => sum + (t.transaction_type === 'in' ? t.amount : -t.amount), 0)
          
          return [
            format(new Date(transaction.transaction_date), 'dd-MM-yyyy HH:mm'),
            transaction.transaction_type === 'in' ? 'Cash In' : 'Cash Out',
            transaction.description,
            transaction.transaction_type === 'in' ? 
              formatCurrency(transaction.amount) : 
              '-' + formatCurrency(transaction.amount),
            formatCurrency(runningBalance)
          ]
        })
        
        // Create table with autotable
        doc.autoTable({
          startY: 45,
          head: [['Date & Time', 'Type', 'Description', 'Amount', 'Balance']],
          body: tableData,
          theme: 'striped',
          headStyles: { fillColor: [66, 139, 202] },
          styles: { overflow: 'linebreak' },
          columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 25 },
            2: { cellWidth: 60 },
            3: { cellWidth: 30 },
            4: { cellWidth: 30 }
          }
        })
        
        // Add summary
        const finalY = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(12)
        doc.text('Cash Summary', 14, finalY)
        
        doc.setFontSize(10)
        doc.text(`Total Cash In: ${formatCurrency(cashIn)}`, 14, finalY + 8)
        doc.text(`Total Cash Out: ${formatCurrency(cashOut)}`, 14, finalY + 16)
        doc.text(`Current Balance: ${formatCurrency(cashBalance)}`, 14, finalY + 24)
      }
      
      // Save the PDF
      doc.save(`${filename}-${dateFrom}-to-${dateTo}.pdf`)
      
      toast.success(`${filename} exported as PDF`)
    } catch (error) {
      console.error('Error exporting to PDF:', error)
      toast.error(`Failed to export ${filename} as PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleExportReport = async () => {
    try {
      setIsExporting(true)
      
      if (activeTab === 'expenses') {
        if (exportFormat === 'csv') {
          exportToCSV(
            expenses.map(e => ({
              date: format(new Date(e.expense_date), 'dd-MM-yyyy'),
              category: e.category,
              description: e.description,
              amount: e.amount,
              receipt_number: e.receipt_number || '-'
            })),
            'expenses-report',
            ['Date', 'Category', 'Description', 'Amount', 'Receipt Number']
          )
        } else {
          exportToPDF(expenses, 'expenses-report', 'Expense Report')
        }
      } else if (activeTab === 'cash') {
        if (exportFormat === 'csv') {
          exportToCSV(
            cashTransactions.map((t, index) => {
              const runningBalance = cashTransactions
                .slice(0, index + 1)
                .reduce((sum, ct) => sum + (ct.transaction_type === 'in' ? ct.amount : -ct.amount), 0)
              
              return {
                date: format(new Date(t.transaction_date), 'dd-MM-yyyy HH:mm'),
                type: t.transaction_type === 'in' ? 'Cash In' : 'Cash Out',
                description: t.description,
                amount: t.amount,
                balance: runningBalance
              }
            }),
            'cash-ledger-report',
            ['Date', 'Type', 'Description', 'Amount', 'Balance']
          )
        } else {
          exportToPDF(cashTransactions, 'cash-ledger-report', 'Cash Ledger Report')
        }
      } else {
        // Overview tab - export summary
        if (exportFormat === 'csv') {
          const summaryData = [
            { metric: 'Total Revenue', value: totalRevenue },
            { metric: 'Total Expenses', value: totalExpenses },
            { metric: 'Net Profit', value: netProfit },
            { metric: 'Cash Balance', value: cashBalance },
            { metric: 'Cash In', value: cashIn },
            { metric: 'Cash Out', value: cashOut }
          ]
          
          exportToCSV(
            summaryData,
            'financial-summary',
            ['Metric', 'Value']
          )
        } else {
          // Create PDF for overview
          const doc = new jsPDF() as any
          
          // Add title
          doc.setFontSize(18)
          doc.text('Financial Summary Report', 14, 22)
          
          // Add date range
          doc.setFontSize(12)
          doc.text(`Period: ${dateFrom} to ${dateTo}`, 14, 30)
          doc.text(`Generated on: ${format(new Date(), 'dd-MM-yyyy HH:mm:ss')}`, 14, 38)
          
          // Add summary table
          const summaryData = [
            ['Total Revenue', formatCurrency(totalRevenue)],
            ['Total Expenses', formatCurrency(totalExpenses)],
            ['Net Profit', formatCurrency(netProfit)],
            ['Cash Balance', formatCurrency(cashBalance)],
            ['Cash In', formatCurrency(cashIn)],
            ['Cash Out', formatCurrency(cashOut)]
          ]
          
          doc.autoTable({
            startY: 45,
            head: [['Metric', 'Value']],
            body: summaryData,
            theme: 'striped',
            headStyles: { fillColor: [66, 139, 202] }
          })
          
          // Save the PDF
          doc.save(`financial-summary-${dateFrom}-to-${dateTo}.pdf`)
          
          toast.success('Financial summary exported as PDF')
        }
      }
    } catch (error) {
      console.error('Error during export:', error)
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsExporting(false)
    }
  }

  const isLoading = expensesLoading || cashLoading || salesLoading || isExporting

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Financial Management</h1>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowExpenseModal(true)}
            className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Expense
          </button>
          <button
            onClick={() => setShowCashModal(true)}
            className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Cash Transaction
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

          <div className="ml-auto flex space-x-2">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            >
              <option value="pdf">PDF</option>
              <option value="csv">CSV</option>
            </select>
            <button
              onClick={handleExportReport}
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
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="p-3 rounded-full bg-green-100">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Expenses</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(totalExpenses)}</p>
            </div>
            <div className="p-3 rounded-full bg-red-100">
              <TrendingDown className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Net Profit</p>
              <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(netProfit)}
              </p>
            </div>
            <div className={`p-3 rounded-full ${netProfit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              <DollarSign className={`h-6 w-6 ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Cash Balance</p>
              <p className={`text-2xl font-bold ${cashBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(cashBalance)}
              </p>
            </div>
            <div className="p-3 rounded-full bg-blue-100">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'expenses', label: 'Expenses' },
              { id: 'cash', label: 'Cash Ledger' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Financial Overview</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
                  <h4 className="text-md font-medium text-gray-900 mb-4">Revenue vs Expenses</h4>
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
                            style={{ width: `${Math.min(100, (netProfit / totalRevenue) * 100)}%` }}
                          ></div>
                        )}
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0%</span>
                        <span>Profit Margin: {totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0}%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
                  <h4 className="text-md font-medium text-gray-900 mb-4">Cash Flow</h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Cash In</span>
                      <span className="text-green-600 font-medium">{formatCurrency(cashIn)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Cash Out</span>
                      <span className="text-red-600 font-medium">{formatCurrency(cashOut)}</span>
                    </div>
                    <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                      <span className="font-medium">Cash Balance</span>
                      <span className={`font-bold ${cashBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {formatCurrency(cashBalance)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
                <h4 className="text-md font-medium text-gray-900 mb-4">Expense Breakdown</h4>
                {expenses.length > 0 ? (
                  <div className="space-y-4">
                    {/* Group expenses by category */}
                    {Object.entries(
                      expenses.reduce((acc, expense) => {
                        const category = expense.category
                        if (!acc[category]) acc[category] = 0
                        acc[category] += expense.amount
                        return acc
                      }, {} as Record<string, number>)
                    )
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
          )}

          {activeTab === 'expenses' && (
            <div>
              <div className="flex justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Expense Transactions</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => exportToCSV(
                      expenses.map(e => ({
                        date: format(new Date(e.expense_date), 'dd-MM-yyyy'),
                        category: e.category,
                        description: e.description,
                        amount: e.amount,
                        receipt_number: e.receipt_number || '-'
                      })),
                      'expenses-report',
                      ['Date', 'Category', 'Description', 'Amount', 'Receipt Number']
                    )}
                    className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 flex items-center"
                    disabled={isLoading || expenses.length === 0}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    CSV
                  </button>
                  <button
                    onClick={() => exportToPDF(expenses, 'expenses-report', 'Expense Report')}
                    className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 flex items-center"
                    disabled={isLoading || expenses.length === 0}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    PDF
                  </button>
                </div>
              </div>

              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {expenses.map((expense) => (
                        <tr key={expense.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {formatPakistanDateTimeForDisplay(new Date(expense.expense_date))}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">{expense.category}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{expense.description}</td>
                          <td className="px-6 py-4 text-sm font-medium text-red-600">
                            {formatCurrency(expense.amount)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {expense.receipt_number || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {expenses.length === 0 && !isLoading && (
                <div className="text-center py-8 text-gray-500">
                  No expenses found for the selected date range.
                </div>
              )}
            </div>
          )}

          {activeTab === 'cash' && (
            <div>
              <div className="flex justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Cash Ledger Transactions</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => exportToCSV(
                      cashTransactions.map((t, index) => {
                        const runningBalance = cashTransactions
                          .slice(0, index + 1)
                          .reduce((sum, ct) => sum + (ct.transaction_type === 'in' ? ct.amount : -ct.amount), 0)
                        
                        return {
                          date: format(new Date(t.transaction_date), 'dd-MM-yyyy HH:mm'),
                          type: t.transaction_type === 'in' ? 'Cash In' : 'Cash Out',
                          description: t.description,
                          amount: t.amount,
                          balance: runningBalance
                        }
                      }),
                      'cash-ledger-report',
                      ['Date', 'Type', 'Description', 'Amount', 'Balance']
                    )}
                    className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 flex items-center"
                    disabled={isLoading || cashTransactions.length === 0}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    CSV
                  </button>
                  <button
                    onClick={() => exportToPDF(cashTransactions, 'cash-ledger-report', 'Cash Ledger Report')}
                    className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 flex items-center"
                    disabled={isLoading || cashTransactions.length === 0}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    PDF
                  </button>
                </div>
              </div>

              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {cashTransactions.map((transaction, index) => {
                        const runningBalance = cashTransactions
                          .slice(0, index + 1)
                          .reduce((sum, t) => sum + (t.transaction_type === 'in' ? t.amount : -t.amount), 0)
                        
                        return (
                          <tr key={transaction.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {formatPakistanDateTimeForDisplay(new Date(transaction.transaction_date))}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                transaction.transaction_type === 'in' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {transaction.transaction_type === 'in' ? 'Cash In' : 'Cash Out'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">{transaction.description}</td>
                            <td className={`px-6 py-4 text-sm font-medium ${
                              transaction.transaction_type === 'in' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {transaction.transaction_type === 'in' ? '+' : '-'}{formatCurrency(transaction.amount)}
                            </td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                              {formatCurrency(runningBalance)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {cashTransactions.length === 0 && !isLoading && (
                <div className="text-center py-8 text-gray-500">
                  No cash transactions found for the selected date range.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add Expense</h3>
            <form onSubmit={handleExpenseSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select
                  required
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Category</option>
                  {expenseCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <input
                  type="text"
                  required
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₨) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Receipt Number</label>
                <input
                  type="text"
                  value={expenseForm.receipt_number}
                  onChange={(e) => setExpenseForm({ ...expenseForm, receipt_number: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createExpense.isPending}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50"
                >
                  {createExpense.isPending ? 'Saving...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cash Transaction Modal */}
      {showCashModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Cash Transaction</h3>
            <form onSubmit={handleCashSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type *</label>
                <select
                  required
                  value={cashForm.transaction_type}
                  onChange={(e) => setCashForm({ ...cashForm, transaction_type: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="in">Cash In</option>
                  <option value="out">Cash Out</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₨) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={cashForm.amount}
                  onChange={(e) => setCashForm({ ...cashForm, amount: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <input
                  type="text"
                  required
                  value={cashForm.description}
                  onChange={(e) => setCashForm({ ...cashForm, description: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCashModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createCashTransaction.isPending}
                  className="flex-1 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
                >
                  {createCashTransaction.isPending ? 'Saving...' : 'Add Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Financial