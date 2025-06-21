import React, { useState, useEffect } from 'react'
import { 
  Search, 
  Calendar, 
  CreditCard, 
  DollarSign, 
  Eye, 
  Download, 
  RefreshCw,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  Printer,
  ArrowLeft,
  Filter
} from 'lucide-react'
import { useBnplSales, useBnplSalesSummary } from '../hooks/useBnplSales'
import { useBnplPaymentHistory, useProcessBnplPayment } from '../hooks/useBnplTransactions'
import { format } from 'date-fns'
import { formatCurrency, formatPakistanDateTimeForDisplay } from '../utils/dateUtils'
import toast from 'react-hot-toast'
import { generateBnplPaymentConfirmation } from '../utils/bnplPaymentConfirmationGenerator'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

const BNPLReceipts: React.FC = () => {
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('')
  const [dateRange, setDateRange] = useState('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  
  // Modal state
  const [selectedBnplId, setSelectedBnplId] = useState('')
  const [showPaymentHistoryModal, setShowPaymentHistoryModal] = useState(false)
  const [showMakePaymentModal, setShowMakePaymentModal] = useState(false)
  
  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [processedBy, setProcessedBy] = useState('Store Manager')
  
  // Last refresh time
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date())
  
  // Calculate date range based on selection
  const getDateRange = () => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    const last7Days = new Date(today)
    last7Days.setDate(last7Days.getDate() - 6)
    
    const last30Days = new Date(today)
    last30Days.setDate(last30Days.getDate() - 29)
    
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    
    switch (dateRange) {
      case 'today':
        return {
          startDate: format(today, 'yyyy-MM-dd'),
          endDate: format(today, 'yyyy-MM-dd')
        }
      case 'yesterday':
        return {
          startDate: format(yesterday, 'yyyy-MM-dd'),
          endDate: format(yesterday, 'yyyy-MM-dd')
        }
      case '7days':
        return {
          startDate: format(last7Days, 'yyyy-MM-dd'),
          endDate: format(today, 'yyyy-MM-dd')
        }
      case '30days':
        return {
          startDate: format(last30Days, 'yyyy-MM-dd'),
          endDate: format(today, 'yyyy-MM-dd')
        }
      case 'month':
        return {
          startDate: format(thisMonth, 'yyyy-MM-dd'),
          endDate: format(today, 'yyyy-MM-dd')
        }
      case 'custom':
        return {
          startDate: customStartDate,
          endDate: customEndDate
        }
      default:
        return {
          startDate: '',
          endDate: ''
        }
    }
  }
  
  const { startDate, endDate } = getDateRange()
  
  // Fetch BNPL sales data
  const { 
    data: bnplSales = [], 
    isLoading: salesLoading,
    refetch: refetchSales
  } = useBnplSales(searchTerm, startDate, endDate, statusFilter)
  
  // Fetch BNPL summary statistics
  const { 
    data: bnplSummary, 
    isLoading: summaryLoading,
    refetch: refetchSummary
  } = useBnplSalesSummary()
  
  // Fetch payment history for selected transaction
  const { 
    data: paymentHistory = { transaction: null, payments: [] }, 
    isLoading: historyLoading,
    refetch: refetchHistory
  } = useBnplPaymentHistory(selectedBnplId)
  
  // Process payment mutation
  const processPayment = useProcessBnplPayment()
  
  // Set up auto-refresh
  useEffect(() => {
    const intervalId = setInterval(() => {
      refetchSales();
      refetchSummary();
      if (selectedBnplId) {
        refetchHistory();
      }
      setLastRefreshTime(new Date());
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(intervalId);
  }, [refetchSales, refetchSummary, refetchHistory, selectedBnplId]);
  
  // Handle manual refresh
  const handleManualRefresh = () => {
    refetchSales();
    refetchSummary();
    if (selectedBnplId) {
      refetchHistory();
    }
    setLastRefreshTime(new Date());
    toast.success('Data refreshed');
  }
  
  // Handle view payment history
  const handleViewPaymentHistory = (bnplId: string) => {
    setSelectedBnplId(bnplId);
    setShowPaymentHistoryModal(true);
  }
  
  // Handle make payment
  const handleMakePayment = (bnplId: string, amountDue: number) => {
    setSelectedBnplId(bnplId);
    setPaymentAmount(amountDue.toString());
    setShowMakePaymentModal(true);
  }
  
  // Process payment submission
  const handlePaymentSubmit = async () => {
    if (!selectedBnplId || !paymentAmount || !processedBy.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    const amount = parseFloat(paymentAmount);
    if (amount <= 0) {
      toast.error('Payment amount must be greater than 0');
      return;
    }
    
    const transaction = bnplSales.find(sale => 
      sale.bnpl_transaction && sale.bnpl_transaction.id === selectedBnplId
    )?.bnpl_transaction;
    
    if (!transaction) {
      toast.error('Transaction not found');
      return;
    }
    
    if (amount > transaction.amount_due) {
      toast.error(`Payment amount cannot exceed due amount of ${formatCurrency(transaction.amount_due)}`);
      return;
    }
    
    try {
      await processPayment.mutateAsync({
        bnplId: selectedBnplId,
        paymentAmount: amount,
        paymentMethod: paymentMethod,
        processedBy: processedBy
      });
      
      // Generate payment confirmation
      const sale = bnplSales.find(s => s.bnpl_transaction && s.bnpl_transaction.id === selectedBnplId);
      
      if (sale) {
        const confirmationData = {
          confirmation_number: '', // Will be generated in the function
          bnpl_transaction_id: selectedBnplId,
          original_sale_invoice: sale.invoice_number,
          original_sale_receipt: sale.receipt_number,
          customer: {
            name: sale.customer?.name || 'Customer',
            phone: sale.customer?.phone,
            email: sale.customer?.email
          },
          payment_amount: amount,
          payment_method: paymentMethod,
          payment_date: new Date().toISOString(),
          remaining_amount: transaction.amount_due - amount,
          transaction_status: transaction.amount_due - amount <= 0 ? 'paid' : 'partially_paid'
        };
        
        await generateBnplPaymentConfirmation(confirmationData);
      }
      
      // Reset form and close modal
      setShowMakePaymentModal(false);
      setPaymentAmount('');
      
      toast.success(`Payment of ${formatCurrency(amount)} processed successfully`);
      
      // Refresh data
      refetchSales();
      refetchSummary();
      if (showPaymentHistoryModal) {
        refetchHistory();
      }
    } catch (error) {
      console.error('Payment processing error:', error);
      toast.error('Failed to process payment');
    }
  }
  
  // Export payment history to PDF
  const exportPaymentHistoryToPDF = () => {
    if (!paymentHistory.transaction) return;
    
    const doc = new jsPDF() as any;
    
    // Add title
    doc.setFontSize(18);
    doc.text('BNPL Payment History', 14, 22);
    
    // Add transaction details
    doc.setFontSize(12);
    doc.text(`Transaction ID: ${selectedBnplId}`, 14, 32);
    doc.text(`Original Sale: ${paymentHistory.transaction.sale?.invoice_number || 'N/A'}`, 14, 40);
    doc.text(`Receipt: ${paymentHistory.transaction.sale?.receipt_number || 'N/A'}`, 14, 48);
    doc.text(`Original Amount: ${formatCurrency(paymentHistory.transaction.original_amount)}`, 14, 56);
    doc.text(`Amount Paid: ${formatCurrency(paymentHistory.transaction.amount_paid)}`, 14, 64);
    doc.text(`Amount Due: ${formatCurrency(paymentHistory.transaction.amount_due)}`, 14, 72);
    doc.text(`Status: ${paymentHistory.transaction.status.toUpperCase()}`, 14, 80);
    
    // Add payment history table
    if (paymentHistory.payments && paymentHistory.payments.length > 0) {
      const tableData = paymentHistory.payments.map((payment: any) => [
        format(new Date(payment.payment_date), 'dd-MM-yyyy HH:mm:ss'),
        formatCurrency(payment.payment_amount),
        payment.payment_method.toUpperCase(),
        payment.confirmation_number,
        payment.processed_by
      ]);
      
      doc.autoTable({
        startY: 90,
        head: [['Date', 'Amount', 'Method', 'Confirmation #', 'Processed By']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [66, 139, 202] }
      });
    } else {
      doc.text('No payment history found', 14, 90);
    }
    
    // Add payment progress
    const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : 100;
    
    doc.setFontSize(14);
    doc.text('Payment Progress', 14, finalY);
    
    const progressPercentage = paymentHistory.transaction.original_amount > 0 
      ? (paymentHistory.transaction.amount_paid / paymentHistory.transaction.original_amount) * 100 
      : 0;
    
    doc.setFontSize(10);
    doc.text(`${formatCurrency(paymentHistory.transaction.amount_paid)} of ${formatCurrency(paymentHistory.transaction.original_amount)} paid (${progressPercentage.toFixed(1)}%)`, 14, finalY + 10);
    
    // Save the PDF
    doc.save(`bnpl-payment-history-${selectedBnplId}.pdf`);
    toast.success('Payment history exported as PDF');
  }
  
  // Get status display information
  const getStatusDisplay = (status: string, dueDate?: string) => {
    const isOverdue = dueDate && new Date(dueDate) < new Date();
    
    switch (status) {
      case 'pending':
        return {
          label: isOverdue ? 'Overdue' : 'Pending',
          color: isOverdue ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800',
          icon: isOverdue ? AlertTriangle : Clock
        };
      case 'partially_paid':
        return {
          label: isOverdue ? 'Overdue (Partial)' : 'Partially Paid',
          color: isOverdue ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800',
          icon: isOverdue ? AlertTriangle : Clock
        };
      case 'overdue':
        return {
          label: 'Overdue',
          color: 'bg-red-100 text-red-800',
          icon: AlertTriangle
        };
      case 'paid':
        return {
          label: 'Paid',
          color: 'bg-green-100 text-green-800',
          icon: CheckCircle
        };
      default:
        return {
          label: 'Unknown',
          color: 'bg-gray-100 text-gray-800',
          icon: Clock
        };
    }
  }
  
  const isLoading = salesLoading || summaryLoading;
  
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">BNPL Receipt Management</h1>
        <div className="flex items-center space-x-3">
          <div className="text-sm text-gray-600 flex items-center">
            <Clock className="h-4 w-4 mr-1" />
            Last updated: {format(lastRefreshTime, 'HH:mm:ss')}
          </div>
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
      
      {/* Summary Cards */}
      {bnplSummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total BNPL Sales</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(bnplSummary.total_bnpl_amount)}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-100">
                <CreditCard className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Amount Collected</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(bnplSummary.total_amount_paid)}</p>
              </div>
              <div className="p-3 rounded-full bg-green-100">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Outstanding Amount</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(bnplSummary.total_amount_due)}</p>
              </div>
              <div className="p-3 rounded-full bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Collection Rate</p>
                <p className="text-2xl font-bold text-gray-900">
                  {bnplSummary.total_bnpl_amount > 0 
                    ? ((bnplSummary.total_amount_paid / bnplSummary.total_bnpl_amount) * 100).toFixed(1) 
                    : '0'}%
                </p>
              </div>
              <div className="p-3 rounded-full bg-purple-100">
                <FileText className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Search and Filters */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Search by receipt #, invoice #, or customer..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div>
            <select
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="month">This Month</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          
          <div>
            <select
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center"
            onClick={handleManualRefresh}
          >
            <Filter className="h-4 w-4 mr-2" />
            Apply Filters
          </button>
        </div>
        
        {dateRange === 'custom' && (
          <div className="flex flex-col md:flex-row gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* BNPL Receipts Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Original Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-4 text-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-blue-500 mx-auto" />
                  </td>
                </tr>
              ) : bnplSales.length > 0 ? (
                bnplSales.map((sale) => {
                  if (!sale.bnpl_transaction) return null;
                  
                  const transaction = sale.bnpl_transaction;
                  const status = getStatusDisplay(transaction.status, transaction.due_date);
                  const StatusIcon = status.icon;
                  
                  return (
                    <tr key={sale.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-mono text-blue-600">{sale.receipt_number}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {formatPakistanDateTimeForDisplay(new Date(sale.sale_date))}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div>{sale.customer?.name || 'Walk-in Customer'}</div>
                        {sale.customer?.phone && (
                          <div className="text-xs text-gray-500">{sale.customer.phone}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {formatCurrency(transaction.original_amount)}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-green-600">
                        {formatCurrency(transaction.amount_paid)}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-red-600">
                        {formatCurrency(transaction.amount_due)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {transaction.due_date ? format(new Date(transaction.due_date), 'dd-MM-yyyy') : 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${status.color}`}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleViewPaymentHistory(transaction.id)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View Payment History"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {transaction.amount_due > 0 && (
                            <button
                              onClick={() => handleMakePayment(transaction.id, transaction.amount_due)}
                              className="text-green-600 hover:text-green-900"
                              title="Make Payment"
                            >
                              <DollarSign className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              // Print original receipt
                              window.open(`/receipt/${sale.receipt_number}`, '_blank');
                            }}
                            className="text-purple-600 hover:text-purple-900"
                            title="Print Original Receipt"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                    No BNPL transactions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Payment History Modal */}
      {showPaymentHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">BNPL Payment History</h3>
              <button
                onClick={() => {
                  setShowPaymentHistoryModal(false);
                  setSelectedBnplId('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            
            {historyLoading ? (
              <div className="flex justify-center items-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Transaction Details */}
                {paymentHistory.transaction && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3">Transaction Details</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Invoice Number:</span>
                        <span className="ml-2 font-medium">{paymentHistory.transaction.sale?.invoice_number || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Receipt Number:</span>
                        <span className="ml-2 font-medium">{paymentHistory.transaction.sale?.receipt_number || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Original Amount:</span>
                        <span className="ml-2 font-medium">{formatCurrency(paymentHistory.transaction.original_amount)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Transaction Date:</span>
                        <span className="ml-2 font-medium">{formatPakistanDateTimeForDisplay(new Date(paymentHistory.transaction.created_at))}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Amount Paid:</span>
                        <span className="ml-2 font-medium text-green-600">{formatCurrency(paymentHistory.transaction.amount_paid)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Amount Due:</span>
                        <span className="ml-2 font-medium text-red-600">{formatCurrency(paymentHistory.transaction.amount_due)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Due Date:</span>
                        <span className="ml-2 font-medium">
                          {paymentHistory.transaction.due_date ? format(new Date(paymentHistory.transaction.due_date), 'dd-MM-yyyy') : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Status:</span>
                        <span className={`ml-2 inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${
                          getStatusDisplay(paymentHistory.transaction.status, paymentHistory.transaction.due_date).color
                        }`}>
                          {getStatusDisplay(paymentHistory.transaction.status, paymentHistory.transaction.due_date).label}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Payment History */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-medium text-gray-900">Payment History</h4>
                    <button
                      onClick={exportPaymentHistoryToPDF}
                      className="bg-purple-500 text-white px-3 py-1 rounded text-sm hover:bg-purple-600 flex items-center"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export PDF
                    </button>
                  </div>
                  
                  {paymentHistory.payments && paymentHistory.payments.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Confirmation #</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Processed By</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {paymentHistory.payments.map((payment: any, index: number) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-4 py-4 text-sm text-gray-900">
                                {formatPakistanDateTimeForDisplay(new Date(payment.payment_date))}
                              </td>
                              <td className="px-4 py-4 text-sm font-medium text-green-600">
                                {formatCurrency(payment.payment_amount)}
                              </td>
                              <td className="px-4 py-4 text-sm text-gray-900 capitalize">
                                {payment.payment_method.replace('_', ' ')}
                              </td>
                              <td className="px-4 py-4 text-sm font-mono text-blue-600">
                                {payment.confirmation_number}
                              </td>
                              <td className="px-4 py-4 text-sm text-gray-900">
                                {payment.processed_by}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No payment history found for this transaction.
                    </div>
                  )}
                </div>
                
                {/* Payment Progress */}
                {paymentHistory.transaction && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-800 mb-3">Payment Progress</h4>
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="text-blue-700">
                        {formatCurrency(paymentHistory.transaction.amount_paid)} of {formatCurrency(paymentHistory.transaction.original_amount)} paid
                      </span>
                      <span className="text-blue-700">
                        {paymentHistory.transaction.original_amount > 0 
                          ? Math.round((paymentHistory.transaction.amount_paid / paymentHistory.transaction.original_amount) * 100)
                          : 0}%
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2.5">
                      <div 
                        className="bg-blue-600 h-2.5 rounded-full" 
                        style={{ 
                          width: `${paymentHistory.transaction.original_amount > 0 
                            ? Math.min(100, (paymentHistory.transaction.amount_paid / paymentHistory.transaction.original_amount) * 100)
                            : 0}%` 
                        }}
                      ></div>
                    </div>
                  </div>
                )}
                
                {/* Action Buttons */}
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setShowPaymentHistoryModal(false);
                      setSelectedBnplId('');
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Transactions
                  </button>
                  
                  {paymentHistory.transaction && paymentHistory.transaction.amount_due > 0 && (
                    <button
                      onClick={() => {
                        setShowPaymentHistoryModal(false);
                        setShowMakePaymentModal(true);
                        setPaymentAmount(paymentHistory.transaction.amount_due.toString());
                      }}
                      className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center"
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      Make Payment
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Make Payment Modal */}
      {showMakePaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Make BNPL Payment</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Amount (₨) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter payment amount"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="check">Check</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Processed By *</label>
                <input
                  type="text"
                  value={processedBy}
                  onChange={(e) => setProcessedBy(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your name or ID"
                />
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> This payment will be recorded and a payment confirmation receipt will be generated.
                  The customer's outstanding balance will be updated automatically.
                </p>
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowMakePaymentModal(false);
                  if (paymentHistory.transaction) {
                    setShowPaymentHistoryModal(true);
                  }
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePaymentSubmit}
                disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || processPayment.isPending}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 flex items-center justify-center"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                {processPayment.isPending ? 'Processing...' : 'Process Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BNPLReceipts;