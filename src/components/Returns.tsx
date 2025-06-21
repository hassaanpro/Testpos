import React, { useState } from 'react'
import { 
  Search, 
  Package, 
  ArrowLeft, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  DollarSign,
  User,
  Calendar,
  FileText,
  RefreshCw,
  Eye,
  Download,
  Printer
} from 'lucide-react'
import { 
  useReturnableItems, 
  useReturnEligibility, 
  useProcessReturn,
  useReturns,
  useReturnStatistics,
  useReturnDetails
} from '../hooks/useReturns'
import { useSalesForReturns, useSaleForReturn } from '../hooks/useSalesForReturns'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { formatCurrency, formatPakistanDateTimeForDisplay } from '../utils/dateUtils'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

const Returns: React.FC = () => {
  const [activeTab, setActiveTab] = useState('process')
  const [saleSearchTerm, setSaleSearchTerm] = useState('')
  const [selectedSaleId, setSelectedSaleId] = useState('')
  const [returnItems, setReturnItems] = useState<Array<{
    sale_item_id: string
    quantity: number
    condition: 'good' | 'damaged' | 'defective'
  }>>([])
  const [returnReason, setReturnReason] = useState('')
  const [refundMethod, setRefundMethod] = useState('cash')
  const [processedBy, setProcessedBy] = useState('Store Manager')
  const [notes, setNotes] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedReturnId, setSelectedReturnId] = useState('')
  const [showReturnDetailsModal, setShowReturnDetailsModal] = useState(false)

  // Hooks - Updated to use the new sales search for returns
  const { data: salesForReturns = [], isLoading: salesLoading } = useSalesForReturns(
    saleSearchTerm,
    dateFrom,
    dateTo,
    !!saleSearchTerm || !!dateFrom || !!dateTo
  )
  const { data: selectedSaleDetails, isLoading: saleDetailsLoading } = useSaleForReturn(selectedSaleId)
  const { data: returnableItems = [], isLoading: itemsLoading } = useReturnableItems(selectedSaleId)
  const { data: returnEligibility, isLoading: eligibilityLoading } = useReturnEligibility(selectedSaleId)
  const { data: returns = [], isLoading: returnsLoading } = useReturns(dateFrom, dateTo)
  const { data: returnStats, isLoading: statsLoading } = useReturnStatistics(dateFrom, dateTo)
  const { data: selectedReturnDetails, isLoading: returnDetailsLoading } = useReturnDetails(selectedReturnId)
  const processReturn = useProcessReturn()

  const handleItemQuantityChange = (saleItemId: string, quantity: number) => {
    setReturnItems(prev => {
      const existing = prev.find(item => item.sale_item_id === saleItemId)
      if (existing) {
        if (quantity <= 0) {
          return prev.filter(item => item.sale_item_id !== saleItemId)
        }
        return prev.map(item => 
          item.sale_item_id === saleItemId 
            ? { ...item, quantity }
            : item
        )
      } else if (quantity > 0) {
        return [...prev, { sale_item_id: saleItemId, quantity, condition: 'good' }]
      }
      return prev
    })
  }

  const handleItemConditionChange = (saleItemId: string, condition: 'good' | 'damaged' | 'defective') => {
    setReturnItems(prev => 
      prev.map(item => 
        item.sale_item_id === saleItemId 
          ? { ...item, condition }
          : item
      )
    )
  }

  const calculateTotalRefund = () => {
    return returnItems.reduce((total, returnItem) => {
      const item = returnableItems.find(ri => ri.sale_item_id === returnItem.sale_item_id)
      return total + (item ? item.unit_price * returnItem.quantity : 0)
    }, 0)
  }

  const handleProcessReturn = async () => {
    if (!selectedSaleId || returnItems.length === 0 || !returnReason.trim() || !processedBy.trim()) {
      toast.error('Please fill in all required fields and select items to return')
      return
    }

    if (!returnEligibility?.is_eligible) {
      toast.error('This sale is not eligible for return: ' + returnEligibility?.reason)
      return
    }

    try {
      await processReturn.mutateAsync({
        saleId: selectedSaleId,
        returnItems,
        returnReason: returnReason.trim(),
        refundMethod,
        processedBy: processedBy.trim(),
        notes: notes.trim() || undefined
      })

      // Reset form
      setSelectedSaleId('')
      setReturnItems([])
      setReturnReason('')
      setNotes('')
      setSaleSearchTerm('')
      
      toast.success('Return processed successfully')
    } catch (error) {
      console.error('Return processing error:', error)
      toast.error('Failed to process return')
    }
  }

  const getReturnStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'approved': return 'bg-blue-100 text-blue-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'rejected': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const handleViewReturnDetails = (returnId: string) => {
    setSelectedReturnId(returnId)
    setShowReturnDetailsModal(true)
  }

  const exportReturnToPDF = () => {
    if (!selectedReturnDetails) return

    const doc = new jsPDF() as any
    
    // Add title
    doc.setFontSize(18)
    doc.text('Return & Refund Details', 14, 22)
    
    // Add return info
    doc.setFontSize(12)
    doc.text(`Return ID: ${selectedReturnDetails.return_id}`, 14, 32)
    doc.text(`Date: ${formatPakistanDateTimeForDisplay(new Date(selectedReturnDetails.return_date))}`, 14, 40)
    doc.text(`Receipt: ${selectedReturnDetails.receipt_number}`, 14, 48)
    doc.text(`Invoice: ${selectedReturnDetails.invoice_number}`, 14, 56)
    doc.text(`Customer: ${selectedReturnDetails.customer_name}`, 14, 64)
    doc.text(`Processed By: ${selectedReturnDetails.processed_by}`, 14, 72)
    
    // Add refund info
    doc.setFontSize(14)
    doc.text('Refund Information', 14, 84)
    
    doc.setFontSize(12)
    doc.text(`Refund Amount: ${formatCurrency(selectedReturnDetails.refund_amount)}`, 14, 94)
    doc.text(`Refund Method: ${selectedReturnDetails.refund_method.replace('_', ' ').toUpperCase()}`, 14, 102)
    doc.text(`Return Reason: ${selectedReturnDetails.return_reason}`, 14, 110)
    doc.text(`Status: ${selectedReturnDetails.return_status.toUpperCase()}`, 14, 118)
    
    // Add returned items
    doc.setFontSize(14)
    doc.text('Returned Items', 14, 130)
    
    const items = selectedReturnDetails.items_json || []
    const tableData = items.map((item: any) => [
      item.product_name,
      item.quantity,
      formatCurrency(item.unit_price),
      item.condition.toUpperCase(),
      formatCurrency(item.refund_price)
    ])
    
    doc.autoTable({
      startY: 135,
      head: [['Product', 'Qty', 'Unit Price', 'Condition', 'Refund']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [66, 139, 202] }
    })
    
    // Add notes if any
    if (selectedReturnDetails.notes) {
      const finalY = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(14)
      doc.text('Notes', 14, finalY)
      doc.setFontSize(12)
      doc.text(selectedReturnDetails.notes, 14, finalY + 10)
    }
    
    // Save the PDF
    doc.save(`return-${selectedReturnDetails.return_id}.pdf`)
    toast.success('Return details exported as PDF')
  }

  const isLoading = salesLoading || saleDetailsLoading || itemsLoading || eligibilityLoading || returnsLoading || statsLoading

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Returns & Refunds</h1>
        <div className="flex items-center text-sm text-gray-500">
          <Package className="h-4 w-4 mr-1" />
          Return Management System
        </div>
      </div>

      {/* Statistics Cards */}
      {returnStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Returns</p>
                <p className="text-2xl font-bold text-gray-900">{returnStats.totalReturns}</p>
              </div>
              <Package className="h-8 w-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Refunds</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(returnStats.totalRefundAmount)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completed</p>
                <p className="text-2xl font-bold text-gray-900">{returnStats.completedReturns}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Refund</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(returnStats.averageRefundAmount)}</p>
              </div>
              <FileText className="h-8 w-8 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'process', label: 'Process Return', icon: Package },
              { id: 'history', label: 'Return History', icon: FileText }
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
          {activeTab === 'process' && (
            <div className="space-y-6">
              {!selectedSaleId ? (
                /* Sale Search */
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Find Sale to Return</h3>
                  
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                      <input
                        type="text"
                        placeholder="Search by receipt number, invoice number, or customer name..."
                        value={saleSearchTerm}
                        onChange={(e) => setSaleSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Date filters for additional search options */}
                  <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">From Date (Optional)</label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">To Date (Optional)</label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {salesLoading && (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-blue-500 mr-2" />
                      <span className="text-gray-600">Searching for returnable sales...</span>
                    </div>
                  )}

                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {salesForReturns.map((sale) => (
                      <div
                        key={sale.sale_id}
                        onClick={() => setSelectedSaleId(sale.sale_id)}
                        className="p-4 border border-gray-200 rounded-lg cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center space-x-4">
                              <div>
                                <p className="font-medium text-gray-900">Receipt: {sale.receipt_number}</p>
                                <p className="text-sm text-gray-600">Invoice: {sale.invoice_number}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600">Date: {formatPakistanDateTimeForDisplay(new Date(sale.sale_date))}</p>
                                <p className="text-sm text-gray-600">Customer: {sale.customer_name || 'Walk-in'}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600">Items: {sale.returnable_items_count} of {sale.items_count} returnable</p>
                                <p className="text-sm text-gray-600">Days since sale: {sale.days_since_sale}</p>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-gray-900">{formatCurrency(sale.total_amount)}</p>
                            <p className="text-sm text-gray-600">{sale.payment_method.toUpperCase()}</p>
                            {sale.return_status && sale.return_status !== 'none' && (
                              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                                {sale.return_status.replace('_', ' ').toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {saleSearchTerm && !salesLoading && salesForReturns.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Returnable Sales Found</h3>
                      <p className="text-gray-600">
                        No sales found matching your search criteria that are eligible for returns.
                        <br />
                        <span className="text-sm">
                          Note: Only paid sales within 30 days with returnable items are shown.
                        </span>
                      </p>
                    </div>
                  )}

                  {!saleSearchTerm && !dateFrom && !dateTo && (
                    <div className="text-center py-8 text-gray-500">
                      <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">Search for Sales to Return</h3>
                      <p className="text-gray-600">
                        Enter a receipt number, invoice number, customer name, or select date range to find returnable sales.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                /* Return Processing */
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-gray-900">Process Return</h3>
                    <button
                      onClick={() => {
                        setSelectedSaleId('')
                        setReturnItems([])
                        setReturnReason('')
                        setNotes('')
                      }}
                      className="text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back to Search
                    </button>
                  </div>

                  {/* Sale Information */}
                  {selectedSaleDetails && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3">Sale Information</h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Receipt:</span>
                          <span className="ml-2 font-mono font-semibold">{selectedSaleDetails.receipt_number}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Date:</span>
                          <span className="ml-2">{formatPakistanDateTimeForDisplay(new Date(selectedSaleDetails.sale_date))}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Customer:</span>
                          <span className="ml-2">{selectedSaleDetails.customer_name || 'Walk-in Customer'}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Total:</span>
                          <span className="ml-2 font-semibold">{formatCurrency(selectedSaleDetails.total_amount)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Return Eligibility */}
                  {selectedSaleDetails && (
                    <div className={`p-4 rounded-lg border ${
                      selectedSaleDetails.is_eligible_for_return 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-red-50 border-red-200'
                    }`}>
                      <div className="flex items-center">
                        {selectedSaleDetails.is_eligible_for_return ? (
                          <CheckCircle className="h-5 w-5 text-green-600 mr-3" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-red-600 mr-3" />
                        )}
                        <div>
                          <p className={`font-medium ${
                            selectedSaleDetails.is_eligible_for_return ? 'text-green-800' : 'text-red-800'
                          }`}>
                            {selectedSaleDetails.is_eligible_for_return ? 'Eligible for Return' : 'Not Eligible for Return'}
                          </p>
                          <p className={`text-sm ${
                            selectedSaleDetails.is_eligible_for_return ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {selectedSaleDetails.return_eligibility_reason}
                            {selectedSaleDetails.is_eligible_for_return && (
                              <span> ({30 - selectedSaleDetails.days_since_sale} days remaining)</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Returnable Items */}
                  {selectedSaleDetails?.is_eligible_for_return && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Select Items to Return</h4>
                      <div className="space-y-3">
                        {returnableItems.map((item) => {
                          const returnItem = returnItems.find(ri => ri.sale_item_id === item.sale_item_id)
                          const returnQuantity = returnItem?.quantity || 0
                          
                          return (
                            <div key={item.sale_item_id} className="border border-gray-200 rounded-lg p-4">
                              <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
                                <div className="md:col-span-2">
                                  <p className="font-medium text-gray-900">{item.product_name}</p>
                                  <p className="text-sm text-gray-600">SKU: {item.product_sku}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-600">Sold: {item.quantity_sold}</p>
                                  <p className="text-sm text-gray-600">Returned: {item.quantity_returned}</p>
                                  <p className="text-sm font-medium">Available: {item.quantity_returnable}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-600">Unit Price</p>
                                  <p className="font-medium">{formatCurrency(item.unit_price)}</p>
                                </div>
                                <div>
                                  <label className="block text-sm text-gray-600 mb-1">Return Qty</label>
                                  <input
                                    type="number"
                                    min="0"
                                    max={item.quantity_returnable}
                                    value={returnQuantity}
                                    onChange={(e) => handleItemQuantityChange(item.sale_item_id, parseInt(e.target.value) || 0)}
                                    className="w-full p-2 border border-gray-300 rounded-md text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm text-gray-600 mb-1">Condition</label>
                                  <select
                                    value={returnItem?.condition || 'good'}
                                    onChange={(e) => handleItemConditionChange(item.sale_item_id, e.target.value as any)}
                                    disabled={returnQuantity === 0}
                                    className="w-full p-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100"
                                  >
                                    <option value="good">Good</option>
                                    <option value="damaged">Damaged</option>
                                    <option value="defective">Defective</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {returnableItems.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          No items available for return from this sale.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Return Details Form */}
                  {returnItems.length > 0 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Return Reason *</label>
                          <select
                            value={returnReason}
                            onChange={(e) => setReturnReason(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                            required
                          >
                            <option value="">Select reason</option>
                            <option value="Defective product">Defective product</option>
                            <option value="Wrong item received">Wrong item received</option>
                            <option value="Customer changed mind">Customer changed mind</option>
                            <option value="Product damaged">Product damaged</option>
                            <option value="Not as described">Not as described</option>
                            <option value="Size/fit issues">Size/fit issues</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Refund Method *</label>
                          <select
                            value={refundMethod}
                            onChange={(e) => setRefundMethod(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="cash">Cash</option>
                            <option value="card">Card Refund</option>
                            <option value="store_credit">Store Credit</option>
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
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Total Refund Amount</label>
                          <div className="p-3 bg-gray-50 border border-gray-300 rounded-md">
                            <span className="text-lg font-bold text-green-600">
                              {formatCurrency(calculateTotalRefund())}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                          rows={3}
                          placeholder="Any additional notes about this return..."
                        />
                      </div>

                      <div className="flex space-x-3">
                        <button
                          onClick={() => {
                            setReturnItems([])
                            setReturnReason('')
                            setNotes('')
                          }}
                          className="flex-1 px-4 py-3 border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                          Reset Form
                        </button>
                        <button
                          onClick={handleProcessReturn}
                          disabled={processReturn.isPending || !returnReason.trim() || !processedBy.trim()}
                          className="flex-1 px-4 py-3 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 flex items-center justify-center"
                        >
                          {processReturn.isPending ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Package className="h-4 w-4 mr-2" />
                          )}
                          {processReturn.isPending ? 'Processing...' : 'Process Return & Refund'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Return History</h3>
                <div className="flex items-center space-x-4">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {returnsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-blue-500 mr-2" />
                  <span className="text-gray-600">Loading return history...</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Return Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale Info</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Refund Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Processed By</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {returns.map((returnRecord) => (
                        <tr key={returnRecord.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {formatPakistanDateTimeForDisplay(new Date(returnRecord.return_date))}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            <div>Receipt: {returnRecord.sale?.receipt_number}</div>
                            <div className="text-xs text-gray-500">Invoice: {returnRecord.sale?.invoice_number}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {returnRecord.customer?.name || 'Walk-in Customer'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {returnRecord.return_reason}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {formatCurrency(returnRecord.refund_amount)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 capitalize">
                            {returnRecord.refund_method.replace('_', ' ')}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getReturnStatusColor(returnRecord.return_status)}`}>
                              {returnRecord.return_status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {returnRecord.processed_by}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleViewReturnDetails(returnRecord.id)}
                                className="text-blue-600 hover:text-blue-900"
                                title="View Details"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedReturnId(returnRecord.id)
                                  setTimeout(() => {
                                    if (selectedReturnDetails) {
                                      exportReturnToPDF()
                                    }
                                  }, 500)
                                }}
                                className="text-purple-600 hover:text-purple-900"
                                title="Export PDF"
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

              {returns.length === 0 && !returnsLoading && (
                <div className="text-center py-8 text-gray-500">
                  No returns found for the selected date range.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Return Details Modal */}
      {showReturnDetailsModal && selectedReturnDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Return Details</h3>
              <button
                onClick={() => {
                  setShowReturnDetailsModal(false)
                  setSelectedReturnId('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Return Header */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Return ID</p>
                  <p className="font-medium">{selectedReturnDetails.return_id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Return Date</p>
                  <p className="font-medium">{formatPakistanDateTimeForDisplay(new Date(selectedReturnDetails.return_date))}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Receipt Number</p>
                  <p className="font-medium">{selectedReturnDetails.receipt_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Invoice Number</p>
                  <p className="font-medium">{selectedReturnDetails.invoice_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Customer</p>
                  <p className="font-medium">{selectedReturnDetails.customer_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Processed By</p>
                  <p className="font-medium">{selectedReturnDetails.processed_by}</p>
                </div>
              </div>

              {/* Return Status */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-600">Return Status</p>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getReturnStatusColor(selectedReturnDetails.return_status)}`}>
                      {selectedReturnDetails.return_status.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Refund Method</p>
                    <p className="font-medium capitalize">{selectedReturnDetails.refund_method.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Refund Amount</p>
                    <p className="font-medium text-green-600">{formatCurrency(selectedReturnDetails.refund_amount)}</p>
                  </div>
                </div>
              </div>

              {/* Return Reason */}
              <div>
                <p className="text-sm text-gray-600">Return Reason</p>
                <p className="font-medium">{selectedReturnDetails.return_reason}</p>
                {selectedReturnDetails.notes && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-600">Additional Notes</p>
                    <p className="text-sm">{selectedReturnDetails.notes}</p>
                  </div>
                )}
              </div>

              {/* Returned Items */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Returned Items</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Product</th>
                        <th className="px-4 py-2 text-left">SKU</th>
                        <th className="px-4 py-2 text-left">Quantity</th>
                        <th className="px-4 py-2 text-left">Unit Price</th>
                        <th className="px-4 py-2 text-left">Condition</th>
                        <th className="px-4 py-2 text-left">Refund</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReturnDetails.items_json && selectedReturnDetails.items_json.map((item: any, index: number) => (
                        <tr key={index} className="border-t">
                          <td className="px-4 py-2">{item.product_name}</td>
                          <td className="px-4 py-2">{item.product_sku}</td>
                          <td className="px-4 py-2">{item.quantity}</td>
                          <td className="px-4 py-2">{formatCurrency(item.unit_price)}</td>
                          <td className="px-4 py-2 capitalize">{item.condition}</td>
                          <td className="px-4 py-2">{formatCurrency(item.refund_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowReturnDetailsModal(false)
                    setSelectedReturnId('')
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Returns
                </button>
                <button
                  onClick={exportReturnToPDF}
                  className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 flex items-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </button>
                <button
                  onClick={() => {
                    // Print functionality
                    window.print()
                  }}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Returns