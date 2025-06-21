import React, { useState } from 'react'
import { 
  Search, 
  CreditCard, 
  DollarSign, 
  Calendar, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Receipt,
  User,
  Phone,
  Mail,
  FileText,
  Eye,
  RefreshCw,
  ArrowLeft
} from 'lucide-react'
import { useCustomers } from '../hooks/useCustomers'
import { useBnplTransactions, useProcessBnplPayment, useBnplPaymentHistory } from '../hooks/useBnplTransactions'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { generateBnplPaymentConfirmation } from '../utils/bnplPaymentConfirmationGenerator'
import { formatCurrency, formatPakistanDateTimeForDisplay } from '../utils/dateUtils'

const CustomerPayments: React.FC = () => {
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([])
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [searchTerm, setSearchTerm] = useState('')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showPaymentHistoryModal, setShowPaymentHistoryModal] = useState(false)
  const [selectedBnplId, setSelectedBnplId] = useState<string>('')

  const { data: customers = [], isLoading: customersLoading } = useCustomers()
  const { data: bnplTransactions = [], isLoading: bnplLoading } = useBnplTransactions(selectedCustomerId)
  const { data: paymentHistory = [], isLoading: historyLoading } = useBnplPaymentHistory(selectedBnplId)
  const processPayment = useProcessBnplPayment()

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
  ).filter(customer => customer.total_outstanding_dues > 0)

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId)
  
  const outstandingTransactions = bnplTransactions.filter(
    transaction => transaction.status === 'pending' || transaction.status === 'partially_paid' || transaction.status === 'overdue'
  )

  const selectedTransactionObjects = outstandingTransactions.filter(
    transaction => selectedTransactions.includes(transaction.id)
  )

  const totalSelectedAmount = selectedTransactionObjects.reduce(
    (sum, transaction) => sum + transaction.amount_due, 0
  )

  const handleTransactionSelect = (transactionId: string, isSelected: boolean) => {
    if (isSelected) {
      setSelectedTransactions([...selectedTransactions, transactionId])
    } else {
      setSelectedTransactions(selectedTransactions.filter(id => id !== transactionId))
    }
  }

  const handleSelectAll = () => {
    if (selectedTransactions.length === outstandingTransactions.length) {
      setSelectedTransactions([])
    } else {
      setSelectedTransactions(outstandingTransactions.map(t => t.id))
    }
  }

  const handleViewPaymentHistory = (bnplId: string) => {
    setSelectedBnplId(bnplId)
    setShowPaymentHistoryModal(true)
  }

  const handlePaymentSubmit = async () => {
    if (!selectedCustomer || selectedTransactions.length === 0 || !paymentAmount) {
      toast.error('Please select customer, transactions, and enter payment amount')
      return
    }

    const amount = parseFloat(paymentAmount)
    if (amount <= 0) {
      toast.error('Payment amount must be greater than 0')
      return
    }

    if (amount > totalSelectedAmount) {
      toast.error(`Payment amount cannot exceed total due amount of ${formatCurrency(totalSelectedAmount)}`)
      return
    }

    try {
      // Sort transactions by due date (oldest first) for payment allocation
      const sortedTransactions = selectedTransactionObjects.sort((a, b) => 
        new Date(a.due_date || '').getTime() - new Date(b.due_date || '').getTime()
      )

      let remainingAmount = amount

      // Process payments for each selected transaction
      for (const transaction of sortedTransactions) {
        if (remainingAmount <= 0) break

        const paymentForThisTransaction = Math.min(remainingAmount, transaction.amount_due)
        
        await processPayment.mutateAsync({
          bnplId: transaction.id,
          paymentAmount: paymentForThisTransaction,
          paymentMethod: paymentMethod,
          processedBy: 'POS User'
        })

        // Generate payment confirmation for this transaction
        const confirmationData = {
          confirmation_number: '', // Will be generated in the function
          bnpl_transaction_id: transaction.id,
          original_sale_invoice: transaction.sale?.invoice_number || 'N/A',
          original_sale_receipt: transaction.sale?.receipt_number || 'N/A',
          customer: {
            name: selectedCustomer.name,
            phone: selectedCustomer.phone,
            email: selectedCustomer.email
          },
          payment_amount: paymentForThisTransaction,
          payment_method: paymentMethod,
          payment_date: new Date().toISOString(),
          remaining_amount: transaction.amount_due - paymentForThisTransaction,
          transaction_status: transaction.amount_due - paymentForThisTransaction <= 0 ? 'paid' : 'partially_paid'
        }

        await generateBnplPaymentConfirmation(confirmationData)

        remainingAmount -= paymentForThisTransaction
      }

      // Reset form
      setSelectedTransactions([])
      setPaymentAmount('')
      setShowPaymentModal(false)
      
      toast.success(`Payment of ${formatCurrency(amount)} processed successfully`)
    } catch (error) {
      console.error('Payment processing error:', error)
      toast.error('Failed to process payment')
    }
  }

  const getTransactionStatus = (transaction: any) => {
    const isOverdue = transaction.due_date && new Date(transaction.due_date) < new Date()
    
    switch (transaction.status) {
      case 'pending':
        return {
          label: isOverdue ? 'Overdue' : 'Pending',
          color: isOverdue ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800',
          icon: isOverdue ? AlertTriangle : Clock
        }
      case 'partially_paid':
        return {
          label: isOverdue ? 'Overdue (Partial)' : 'Partially Paid',
          color: isOverdue ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800',
          icon: isOverdue ? AlertTriangle : Clock
        }
      case 'overdue':
        return {
          label: 'Overdue',
          color: 'bg-red-100 text-red-800',
          icon: AlertTriangle
        }
      case 'paid':
        return {
          label: 'Paid',
          color: 'bg-green-100 text-green-800',
          icon: CheckCircle
        }
      default:
        return {
          label: 'Unknown',
          color: 'bg-gray-100 text-gray-800',
          icon: Clock
        }
    }
  }

  const isLoading = customersLoading || bnplLoading

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Customer Credit Payments</h1>
        <div className="flex items-center text-sm text-gray-500">
          <CreditCard className="h-4 w-4 mr-1" />
          BNPL Payment Management
        </div>
      </div>

      {/* Customer Selection */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Customer</h3>
        
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Search customers with outstanding dues..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Customer List */}
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-64 overflow-y-auto">
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedCustomerId === customer.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center">
                    <div className="bg-gray-100 rounded-full p-2 mr-3">
                      <User className="h-4 w-4 text-gray-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">{customer.name}</h4>
                      {customer.phone && (
                        <div className="flex items-center text-xs text-gray-500 mt-1">
                          <Phone className="h-3 w-3 mr-1" />
                          {customer.phone}
                        </div>
                      )}
                      {customer.email && (
                        <div className="flex items-center text-xs text-gray-500">
                          <Mail className="h-3 w-3 mr-1" />
                          {customer.email}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Outstanding:</span>
                    <span className="font-semibold text-red-600">
                      {formatCurrency(customer.total_outstanding_dues)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-600">Available Credit:</span>
                    <span className="font-semibold text-green-600">
                      {formatCurrency(customer.available_credit)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredCustomers.length === 0 && !isLoading && (
          <div className="text-center py-8 text-gray-500">
            {searchTerm ? 'No customers found matching your search.' : 'No customers with outstanding dues.'}
          </div>
        )}
      </div>

      {/* Transaction Selection */}
      {selectedCustomer && (
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Outstanding Transactions - {selectedCustomer.name}
            </h3>
            <div className="text-sm text-gray-600">
              Total Outstanding: {formatCurrency(selectedCustomer.total_outstanding_dues)}
            </div>
          </div>

          {bnplLoading ? (
            <div className="flex justify-center items-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : outstandingTransactions.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedTransactions.length === outstandingTransactions.length}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  />
                  <span className="ml-2 text-sm text-gray-700">Select All</span>
                </label>
                {selectedTransactions.length > 0 && (
                  <div className="text-sm text-blue-600">
                    {selectedTransactions.length} transaction(s) selected - Total: {formatCurrency(totalSelectedAmount)}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Select</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Original Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">History</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {outstandingTransactions.map((transaction) => {
                      const status = getTransactionStatus(transaction)
                      const isSelected = selectedTransactions.includes(transaction.id)
                      
                      return (
                        <tr key={transaction.id} className={isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleTransactionSelect(transaction.id, e.target.checked)}
                              className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                            />
                          </td>
                          <td className="px-4 py-4 text-sm font-medium text-gray-900">
                            {transaction.sale?.invoice_number || 'N/A'}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900">
                            {transaction.sale?.receipt_number || 'N/A'}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900">
                            {formatPakistanDateTimeForDisplay(new Date(transaction.created_at))}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900">
                            {formatCurrency(transaction.original_amount)}
                          </td>
                          <td className="px-4 py-4 text-sm text-green-600">
                            {formatCurrency(transaction.amount_paid)}
                          </td>
                          <td className="px-4 py-4 text-sm font-medium text-red-600">
                            {formatCurrency(transaction.amount_due)}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900">
                            {transaction.due_date ? format(new Date(transaction.due_date), 'dd-MM-yyyy') : 'N/A'}
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${status.color}`}>
                              <status.icon className="h-3 w-3 mr-1" />
                              {status.label}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <button
                              onClick={() => handleViewPaymentHistory(transaction.id)}
                              className="text-blue-600 hover:text-blue-800 flex items-center text-sm"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View History
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No outstanding transactions for this customer.
            </div>
          )}
        </div>
      )}

      {/* Payment Entry */}
      {selectedCustomer && selectedTransactions.length > 0 && (
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Entry</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Payment Amount (₨) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={totalSelectedAmount}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="Enter payment amount"
              />
              <p className="text-xs text-gray-500 mt-1">
                Maximum: {formatCurrency(totalSelectedAmount)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method *</label>
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

            <div className="flex items-end">
              <button
                onClick={() => setShowPaymentModal(true)}
                disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || processPayment.isPending}
                className="w-full bg-green-500 text-white p-3 rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <DollarSign className="h-5 w-5 mr-2" />
                {processPayment.isPending ? 'Processing...' : 'Submit Payment'}
              </button>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-3">Payment Summary</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Selected Transactions:</span>
                <span className="ml-2 font-semibold">{selectedTransactions.length}</span>
              </div>
              <div>
                <span className="text-gray-600">Total Due Amount:</span>
                <span className="ml-2 font-semibold text-red-600">{formatCurrency(totalSelectedAmount)}</span>
              </div>
              <div>
                <span className="text-gray-600">Payment Amount:</span>
                <span className="ml-2 font-semibold text-green-600">
                  {paymentAmount ? formatCurrency(parseFloat(paymentAmount)) : formatCurrency(0)}
                </span>
              </div>
            </div>
            {paymentAmount && parseFloat(paymentAmount) < totalSelectedAmount && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Partial Payment:</strong> This payment will be applied to the oldest transactions first. 
                  Remaining balance: {formatCurrency(totalSelectedAmount - parseFloat(paymentAmount))}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment Confirmation Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Confirm Payment</h3>
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-600">Customer:</span>
                <span className="font-medium">{selectedCustomer?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Transactions:</span>
                <span className="font-medium">{selectedTransactions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Payment Amount:</span>
                <span className="font-medium text-green-600">{formatCurrency(parseFloat(paymentAmount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Payment Method:</span>
                <span className="font-medium capitalize">{paymentMethod.replace('_', ' ')}</span>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Payment Processing:</strong> The payment will be automatically allocated to selected transactions, 
                starting with the oldest due dates. Customer's outstanding balance and available credit will be updated immediately.
                Payment confirmations will be generated for each transaction.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePaymentSubmit}
                disabled={processPayment.isPending}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 flex items-center justify-center"
              >
                <Receipt className="h-4 w-4 mr-2" />
                {processPayment.isPending ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment History Modal */}
      {showPaymentHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">BNPL Payment History</h3>
              <button
                onClick={() => {
                  setShowPaymentHistoryModal(false)
                  setSelectedBnplId('')
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
                          getTransactionStatus(paymentHistory.transaction).color
                        }`}>
                          {getTransactionStatus(paymentHistory.transaction).label}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment History */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Payment History</h4>
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
                          {paymentHistory.payments.map((payment, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-4 py-4 text-sm text-gray-900">
                                {formatPakistanDateTimeForDisplay(new Date(payment.payment_date))}
                              </td>
                              <td className="px-4 py-4 text-sm font-medium text-green-600">
                                {formatCurrency(payment.amount)}
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
                      setShowPaymentHistoryModal(false)
                      setSelectedBnplId('')
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Transactions
                  </button>
                  
                  {paymentHistory.transaction && paymentHistory.transaction.amount_due > 0 && (
                    <button
                      onClick={() => {
                        setSelectedTransactions([paymentHistory.transaction.id])
                        setShowPaymentHistoryModal(false)
                        setPaymentAmount(paymentHistory.transaction.amount_due.toString())
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
    </div>
  )
}

export default CustomerPayments