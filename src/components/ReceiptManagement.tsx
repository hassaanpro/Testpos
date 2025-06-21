import React, { useState } from 'react'
import { 
  Search, 
  Calendar, 
  Printer, 
  Eye, 
  Download, 
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Receipt,
  FileText,
  Shield,
  BarChart3,
  RefreshCw
} from 'lucide-react'
import { 
  useReceiptSearch, 
  useReceiptForReprint, 
  useLogReceiptReprint,
  useReceiptAuditLog,
  useReceiptStatistics
} from '../hooks/useReceiptManagement'
import { generateDuplicateReceipt } from '../utils/duplicateReceiptGenerator'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { formatCurrency, formatPakistanDateTimeForDisplay } from '../utils/dateUtils'
import jsPDF from 'jspdf'

const ReceiptManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('search')
  const [searchParams, setSearchParams] = useState({
    searchTerm: '',
    startDate: '',
    endDate: '',
    customerName: '',
    paymentMethod: '',
    paymentStatus: ''
  })
  const [selectedReceipt, setSelectedReceipt] = useState<string>('')
  const [showReprintModal, setShowReprintModal] = useState(false)
  const [reprintReason, setReprintReason] = useState('Customer request')
  const [reprintedBy, setReprintedBy] = useState('Store Manager')

  const { data: searchResults = [], isLoading: searchLoading } = useReceiptSearch(searchParams)
  const { data: receiptForReprint, isLoading: receiptLoading } = useReceiptForReprint(selectedReceipt)
  const { data: auditLog = [], isLoading: auditLoading } = useReceiptAuditLog()
  const { data: statistics, isLoading: statsLoading } = useReceiptStatistics()
  const logReprint = useLogReceiptReprint()

  const handleReprintReceipt = async () => {
    if (!receiptForReprint || !selectedReceipt || !reprintedBy.trim()) {
      toast.error('Please select a receipt and enter who is reprinting it')
      return
    }

    try {
      // Log the reprint first
      const authCode = await logReprint.mutateAsync({
        saleId: receiptForReprint.sale_id,
        receiptNumber: selectedReceipt,
        reprintedBy: reprintedBy.trim(),
        reason: reprintReason
      })

      // Generate the duplicate receipt
      const originalReceiptData = {
        id: receiptForReprint.sale_id,
        receipt_number: receiptForReprint.receipt_number,
        invoice_number: receiptForReprint.invoice_number,
        sale_date: receiptForReprint.sale_date,
        total_amount: receiptForReprint.total_amount,
        subtotal: receiptForReprint.subtotal,
        discount_amount: receiptForReprint.discount_amount,
        tax_amount: receiptForReprint.tax_amount,
        payment_method: receiptForReprint.payment_method,
        payment_status: receiptForReprint.payment_status,
        customer: receiptForReprint.customer_name ? {
          name: receiptForReprint.customer_name,
          phone: receiptForReprint.customer_phone,
          email: receiptForReprint.customer_email
        } : undefined,
        items: receiptForReprint.items
      }

      await generateDuplicateReceipt(originalReceiptData, {
        auth_code: authCode,
        reprinted_by: reprintedBy,
        reason: reprintReason,
        reprint_count: receiptForReprint.reprint_history.length + 1
      })

      setShowReprintModal(false)
      setSelectedReceipt('')
      setReprintReason('Customer request')
      
      toast.success('Receipt reprinted successfully')
    } catch (error) {
      console.error('Reprint error:', error)
      toast.error('Failed to reprint receipt')
    }
  }

  const downloadReceiptPDF = () => {
    if (!receiptForReprint) return

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, 200] // Standard thermal receipt width
    })

    let y = 10

    // Receipt header
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('RECEIPT COPY', 40, y, { align: 'center' })
    y += 8

    // Receipt details
    doc.setFontSize(10)
    doc.text(`Receipt: ${receiptForReprint.receipt_number}`, 5, y)
    y += 5
    doc.text(`Invoice: ${receiptForReprint.invoice_number}`, 5, y)
    y += 5
    doc.text(`Date: ${format(new Date(receiptForReprint.sale_date), 'dd-MM-yyyy HH:mm:ss')}`, 5, y)
    y += 5

    if (receiptForReprint.customer_name) {
      doc.text(`Customer: ${receiptForReprint.customer_name}`, 5, y)
      y += 5
    }

    // Items header
    doc.setFontSize(8)
    doc.text('Item', 5, y)
    doc.text('Qty', 45, y)
    doc.text('Price', 55, y)
    doc.text('Total', 70, y)
    y += 3

    // Draw line
    doc.line(5, y, 75, y)
    y += 3

    // Items
    receiptForReprint.items.forEach(item => {
      const itemName = item.name.length > 20 ? item.name.substring(0, 17) + '...' : item.name
      doc.text(itemName, 5, y)
      doc.text(item.quantity.toString(), 45, y)
      doc.text(`₨${item.unit_price.toLocaleString('en-PK')}`, 55, y)
      doc.text(`₨${item.total_price.toLocaleString('en-PK')}`, 70, y)
      y += 4
    })

    // Draw line
    y += 2
    doc.line(5, y, 75, y)
    y += 4

    // Totals
    doc.text(`Subtotal:`, 45, y)
    doc.text(`₨${receiptForReprint.subtotal.toLocaleString('en-PK')}`, 70, y)
    y += 4

    if (receiptForReprint.discount_amount > 0) {
      doc.text(`Discount:`, 45, y)
      doc.text(`-₨${receiptForReprint.discount_amount.toLocaleString('en-PK')}`, 70, y)
      y += 4
    }

    doc.text(`Tax:`, 45, y)
    doc.text(`₨${receiptForReprint.tax_amount.toLocaleString('en-PK')}`, 70, y)
    y += 4

    // Draw line
    doc.line(45, y, 75, y)
    y += 2

    doc.setFont('helvetica', 'bold')
    doc.text(`Total:`, 45, y)
    doc.text(`₨${receiptForReprint.total_amount.toLocaleString('en-PK')}`, 70, y)
    y += 6

    // Payment info
    doc.setFont('helvetica', 'normal')
    doc.text(`Payment: ${receiptForReprint.payment_method.toUpperCase()}`, 5, y)
    y += 4
    doc.text(`Status: ${receiptForReprint.payment_status.replace('_', ' ').toUpperCase()}`, 5, y)
    y += 8

    // Download note
    doc.setFontSize(8)
    doc.text('This is a downloaded copy of the receipt for reference only.', 40, y, { align: 'center' })
    y += 4
    doc.text('Not valid for returns or exchanges.', 40, y, { align: 'center' })

    // Save the PDF
    doc.save(`receipt-${receiptForReprint.receipt_number}.pdf`)
    toast.success('Receipt downloaded as PDF')
  }

  const exportAuditLog = () => {
    const csvHeaders = ['Receipt Number', 'Invoice Number', 'Original Date', 'Customer', 'Reprint Date', 'Reprinted By', 'Reason', 'Auth Code', 'Reprint Count']
    const csvData = auditLog.map(log => [
      log.receipt_number,
      log.invoice_number,
      format(new Date(log.original_sale_date), 'dd-MM-yyyy HH:mm'),
      log.customer_name || 'Walk-in',
      format(new Date(log.reprint_date), 'dd-MM-yyyy HH:mm'),
      log.reprinted_by,
      log.reprint_reason,
      log.reprint_auth_code,
      log.reprint_count_for_receipt
    ])

    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `receipt-audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    
    toast.success('Audit log exported successfully')
  }

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800'
      case 'pending_bnpl': return 'bg-yellow-100 text-yellow-800'
      case 'partially_paid': return 'bg-blue-100 text-blue-800'
      case 'refunded': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Receipt Management</h1>
        <div className="flex items-center text-sm text-gray-500">
          <Shield className="h-4 w-4 mr-1" />
          Secure Receipt Lookup & Reprint System
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Receipts</p>
                <p className="text-2xl font-bold text-gray-900">{statistics.total_receipts}</p>
              </div>
              <Receipt className="h-8 w-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Printed Receipts</p>
                <p className="text-2xl font-bold text-gray-900">{statistics.printed_receipts}</p>
              </div>
              <Printer className="h-8 w-8 text-green-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Reprinted Receipts</p>
                <p className="text-2xl font-bold text-gray-900">{statistics.reprinted_receipts}</p>
              </div>
              <FileText className="h-8 w-8 text-orange-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Reprints</p>
                <p className="text-2xl font-bold text-gray-900">{statistics.total_reprints}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'search', label: 'Receipt Search', icon: Search },
              { id: 'audit', label: 'Audit Log', icon: Shield },
              { id: 'statistics', label: 'Statistics', icon: BarChart3 }
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
          {activeTab === 'search' && (
            <div className="space-y-6">
              {/* Search Form */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Search Receipts</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Search Term</label>
                    <input
                      type="text"
                      placeholder="Receipt #, Invoice #, Customer name, Phone..."
                      value={searchParams.searchTerm}
                      onChange={(e) => setSearchParams({ ...searchParams, searchTerm: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={searchParams.startDate}
                      onChange={(e) => setSearchParams({ ...searchParams, startDate: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                    <input
                      type="date"
                      value={searchParams.endDate}
                      onChange={(e) => setSearchParams({ ...searchParams, endDate: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                    <select
                      value={searchParams.paymentMethod}
                      onChange={(e) => setSearchParams({ ...searchParams, paymentMethod: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                      value={searchParams.paymentStatus}
                      onChange={(e) => setSearchParams({ ...searchParams, paymentStatus: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All Status</option>
                      <option value="paid">Paid</option>
                      <option value="pending_bnpl">Pending BNPL</option>
                      <option value="partially_paid">Partially Paid</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Search Results */}
              {searchLoading ? (
                <div className="flex justify-center items-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt #</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reprints</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {searchResults.map((receipt) => (
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
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPaymentStatusColor(receipt.payment_status)}`}>
                              {receipt.payment_status.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {receipt.reprint_count > 0 ? (
                              <span className="text-orange-600 font-medium">{receipt.reprint_count}</span>
                            ) : (
                              <span className="text-gray-400">0</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => setSelectedReceipt(receipt.receipt_number)}
                                className="text-blue-600 hover:text-blue-900"
                                title="View Details"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedReceipt(receipt.receipt_number)
                                  setShowReprintModal(true)
                                }}
                                className="text-green-600 hover:text-green-900"
                                title="Reprint Receipt"
                              >
                                <Printer className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedReceipt(receipt.receipt_number)
                                  setTimeout(() => {
                                    if (receiptForReprint) {
                                      downloadReceiptPDF()
                                    }
                                  }, 500)
                                }}
                                className="text-purple-600 hover:text-purple-900"
                                title="Download PDF"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {searchResults.length === 0 && searchParams.searchTerm && !searchLoading && (
                <div className="text-center py-8 text-gray-500">
                  No receipts found matching your search criteria.
                </div>
              )}
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Receipt Reprint Audit Log</h3>
                <button
                  onClick={exportAuditLog}
                  className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 flex items-center text-sm"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Log
                </button>
              </div>

              {auditLoading ? (
                <div className="flex justify-center items-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt #</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Original Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reprint Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reprinted By</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auth Code</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {auditLog.map((log, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm font-mono text-blue-600">{log.receipt_number}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {formatPakistanDateTimeForDisplay(new Date(log.original_sale_date))}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {log.customer_name || 'Walk-in Customer'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {formatPakistanDateTimeForDisplay(new Date(log.reprint_date))}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">{log.reprinted_by}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{log.reprint_reason}</td>
                          <td className="px-6 py-4 text-sm font-mono text-green-600">{log.reprint_auth_code}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">#{log.reprint_count_for_receipt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {auditLog.length === 0 && !auditLoading && (
                <div className="text-center py-8 text-gray-500">
                  No receipt reprints have been logged yet.
                </div>
              )}
            </div>
          )}

          {activeTab === 'statistics' && statistics && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Receipt Management Statistics</h3>
              
              {statsLoading ? (
                <div className="flex justify-center items-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <h4 className="font-medium text-blue-800 mb-4">Receipt Overview</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-blue-700">Total Receipts:</span>
                        <span className="font-semibold text-blue-900">{statistics.total_receipts}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-700">Printed Receipts:</span>
                        <span className="font-semibold text-blue-900">{statistics.printed_receipts}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-700">Print Rate:</span>
                        <span className="font-semibold text-blue-900">
                          {statistics.total_receipts > 0 
                            ? ((statistics.printed_receipts / statistics.total_receipts) * 100).toFixed(1)
                            : 0
                          }%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
                    <h4 className="font-medium text-orange-800 mb-4">Reprint Activity</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-orange-700">Receipts Reprinted:</span>
                        <span className="font-semibold text-orange-900">{statistics.reprinted_receipts}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-orange-700">Total Reprints:</span>
                        <span className="font-semibold text-orange-900">{statistics.total_reprints}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-orange-700">Reprint Rate:</span>
                        <span className="font-semibold text-orange-900">
                          {statistics.total_receipts > 0 
                            ? ((statistics.reprinted_receipts / statistics.total_receipts) * 100).toFixed(1)
                            : 0
                          }%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                    <h4 className="font-medium text-green-800 mb-4">User Activity</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-green-700">Users Reprinting:</span>
                        <span className="font-semibold text-green-900">{statistics.unique_users_reprinting}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-700">Avg Reprints/User:</span>
                        <span className="font-semibold text-green-900">
                          {statistics.unique_users_reprinting > 0 
                            ? (statistics.total_reprints / statistics.unique_users_reprinting).toFixed(1)
                            : 0
                          }
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                    <h4 className="font-medium text-purple-800 mb-4">Most Activity</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-purple-700">Most Reprinted:</span>
                        <span className="font-semibold text-purple-900 font-mono text-sm">
                          {statistics.most_reprinted_receipt || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-purple-700">Max Reprints:</span>
                        <span className="font-semibold text-purple-900">{statistics.max_reprint_count}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reprint Modal */}
      {showReprintModal && receiptForReprint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-screen overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Reprint Receipt</h3>
            
            <div className="space-y-4">
              {/* Receipt Information */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">Receipt Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Receipt Number:</span>
                    <span className="ml-2 font-mono font-semibold">{receiptForReprint.receipt_number}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Invoice Number:</span>
                    <span className="ml-2 font-semibold">{receiptForReprint.invoice_number}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Original Date:</span>
                    <span className="ml-2">{formatPakistanDateTimeForDisplay(new Date(receiptForReprint.sale_date))}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Total Amount:</span>
                    <span className="ml-2 font-semibold">{formatCurrency(receiptForReprint.total_amount)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Customer:</span>
                    <span className="ml-2">{receiptForReprint.customer_name || 'Walk-in Customer'}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Payment Method:</span>
                    <span className="ml-2 capitalize">{receiptForReprint.payment_method}</span>
                  </div>
                </div>
              </div>

              {/* Previous Reprints */}
              {receiptForReprint.reprint_history.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-medium text-yellow-800 mb-3">Previous Reprints ({receiptForReprint.reprint_history.length})</h4>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {receiptForReprint.reprint_history.map((reprint, index) => (
                      <div key={index} className="text-sm text-yellow-700">
                        <span className="font-medium">{formatPakistanDateTimeForDisplay(new Date(reprint.reprint_date))}</span>
                        <span className="mx-2">by</span>
                        <span className="font-medium">{reprint.reprinted_by}</span>
                        <span className="mx-2">-</span>
                        <span>{reprint.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reprint Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reprinted By *</label>
                  <input
                    type="text"
                    value={reprintedBy}
                    onChange={(e) => setReprintedBy(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your name or ID"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Reprint *</label>
                  <select
                    value={reprintReason}
                    onChange={(e) => setReprintReason(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Customer request">Customer request</option>
                    <option value="Lost receipt">Lost receipt</option>
                    <option value="Damaged receipt">Damaged receipt</option>
                    <option value="Return/Exchange">Return/Exchange</option>
                    <option value="Warranty claim">Warranty claim</option>
                    <option value="Accounting purposes">Accounting purposes</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Warning */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-red-600 mr-3 mt-0.5" />
                  <div className="text-sm text-red-800">
                    <p className="font-medium mb-1">Important Notice:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>This will generate a DUPLICATE RECEIPT clearly marked as such</li>
                      <li>The duplicate receipt is for reference only and not valid for returns/exchanges</li>
                      <li>This action will be logged in the audit trail with your details</li>
                      <li>A unique authentication code will be generated for verification</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowReprintModal(false)
                  setSelectedReceipt('')
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReprintReceipt}
                disabled={!reprintedBy.trim() || logReprint.isPending}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 flex items-center justify-center"
              >
                <Printer className="h-4 w-4 mr-2" />
                {logReprint.isPending ? 'Processing...' : 'Generate Duplicate Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Details Modal */}
      {selectedReceipt && receiptForReprint && !showReprintModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Receipt Details</h3>
              <button
                onClick={() => setSelectedReceipt('')}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Receipt Header */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Receipt Number</p>
                  <p className="font-mono font-semibold text-blue-600">{receiptForReprint.receipt_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Invoice Number</p>
                  <p className="font-semibold">{receiptForReprint.invoice_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Date & Time</p>
                  <p className="font-medium">{formatPakistanDateTimeForDisplay(new Date(receiptForReprint.sale_date))}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Cashier</p>
                  <p className="font-medium">{receiptForReprint.cashier_name || 'N/A'}</p>
                </div>
              </div>

              {/* Customer Info */}
              {receiptForReprint.customer_name && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Customer Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Name:</span>
                      <span className="ml-2">{receiptForReprint.customer_name}</span>
                    </div>
                    {receiptForReprint.customer_phone && (
                      <div>
                        <span className="text-gray-600">Phone:</span>
                        <span className="ml-2">{receiptForReprint.customer_phone}</span>
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
                        <th className="px-4 py-2 text-left">Item</th>
                        <th className="px-4 py-2 text-left">Qty</th>
                        <th className="px-4 py-2 text-left">Unit Price</th>
                        <th className="px-4 py-2 text-left">Discount</th>
                        <th className="px-4 py-2 text-left">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiptForReprint.items.map((item, index) => (
                        <tr key={index} className="border-t">
                          <td className="px-4 py-2">{item.name}</td>
                          <td className="px-4 py-2">{item.quantity}</td>
                          <td className="px-4 py-2">{formatCurrency(item.unit_price)}</td>
                          <td className="px-4 py-2">{formatCurrency(item.discount_amount)}</td>
                          <td className="px-4 py-2">{formatCurrency(item.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(receiptForReprint.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount:</span>
                    <span>-{formatCurrency(receiptForReprint.discount_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax:</span>
                    <span>{formatCurrency(receiptForReprint.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Total:</span>
                    <span>{formatCurrency(receiptForReprint.total_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Payment Method</p>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    receiptForReprint.payment_method === 'cash' ? 'bg-green-100 text-green-800' :
                    receiptForReprint.payment_method === 'card' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {receiptForReprint.payment_method.toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Payment Status</p>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPaymentStatusColor(receiptForReprint.payment_status)}`}>
                    {receiptForReprint.payment_status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Reprint History */}
              {receiptForReprint.reprint_history.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Reprint History</h4>
                  <div className="space-y-2">
                    {receiptForReprint.reprint_history.map((reprint, index) => (
                      <div key={index} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-sm font-medium text-yellow-800">
                              Reprint #{index + 1} - {formatPakistanDateTimeForDisplay(new Date(reprint.reprint_date))}
                            </p>
                            <p className="text-sm text-yellow-700">
                              By: {reprint.reprinted_by} | Reason: {reprint.reason}
                            </p>
                          </div>
                          <span className="text-xs font-mono text-yellow-600">{reprint.auth_code}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowReprintModal(true)}
                  className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 flex items-center"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Reprint Receipt
                </button>
                <button
                  onClick={downloadReceiptPDF}
                  className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 flex items-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReceiptManagement