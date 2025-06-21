import React, { useState, useEffect } from 'react'
import { Search, ShoppingCart, User, CreditCard, DollarSign, Receipt, AlertTriangle, Percent, Calculator } from 'lucide-react'
import { useProducts } from '../hooks/useProducts'
import { useCustomers, useCreateCustomer } from '../hooks/useCustomers'
import { useCreateSale } from '../hooks/useSales'
import { usePOSStore } from '../stores/posStore'
import { useSettings } from '../hooks/useSettings'
import { Product, Customer } from '../lib/supabase'
import { generateReceipt } from '../utils/receiptGenerator'
import toast from 'react-hot-toast'
import { formatCurrency } from '../utils/dateUtils'

const POS: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [showStockWarning, setShowStockWarning] = useState(false)
  const [showDiscountModal, setShowDiscountModal] = useState(false)
  const [discountTarget, setDiscountTarget] = useState<{ type: 'item' | 'total', productId?: string }>({ type: 'total' })
  const [stockWarningData, setStockWarningData] = useState<{
    product: Product
    requestedQuantity: number
    availableStock: number
  } | null>(null)
  const [newCustomer, setNewCustomer] = useState({ 
    name: '', 
    phone: '', 
    email: '', 
    address: '',
    gender: ''
  })
  const [amountPaid, setAmountPaid] = useState('')
  const [changeAmount, setChangeAmount] = useState(0)
  
  const { data: products = [] } = useProducts()
  const { data: customers = [] } = useCustomers()
  const { data: settings = [] } = useSettings()
  const createCustomer = useCreateCustomer()
  const createSale = useCreateSale()
  
  const {
    cart,
    selectedCustomer,
    subtotal,
    globalDiscount,
    globalDiscountType,
    tax,
    taxRate,
    total,
    paymentMethod,
    addToCart,
    removeFromCart,
    updateQuantity,
    updateItemDiscount,
    setCustomer,
    setPaymentMethod,
    setGlobalDiscount,
    setGlobalDiscountType,
    setTaxRate,
    clearCart,
    calculateTotals
  } = usePOSStore()

  // Load tax rate from settings
  useEffect(() => {
    const taxRateSetting = settings.find(s => s.key === 'default_tax_rate')
    if (taxRateSetting) {
      const rate = parseFloat(taxRateSetting.value)
      if (!isNaN(rate)) {
        setTaxRate(rate)
      }
    }
  }, [settings, setTaxRate])

  const [discountForm, setDiscountForm] = useState({
    type: 'percentage' as 'percentage' | 'amount',
    value: ''
  })

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.barcode?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAddProduct = (product: Product) => {
    if (product.stock_quantity <= 0) {
      toast.error('Product out of stock!')
      return
    }
    
    // Check if adding one more would exceed stock
    const currentCartItem = cart.find(item => item.product.id === product.id)
    const currentQuantityInCart = currentCartItem ? currentCartItem.quantity : 0
    const newQuantity = currentQuantityInCart + 1
    
    if (newQuantity > product.stock_quantity) {
      setStockWarningData({
        product,
        requestedQuantity: newQuantity,
        availableStock: product.stock_quantity
      })
      setShowStockWarning(true)
      return
    }
    
    addToCart(product)
  }

  const handleQuantityUpdate = (productId: string, newQuantity: number) => {
    const product = products.find(p => p.id === productId)
    if (!product) return
    
    if (newQuantity > product.stock_quantity) {
      setStockWarningData({
        product,
        requestedQuantity: newQuantity,
        availableStock: product.stock_quantity
      })
      setShowStockWarning(true)
      return
    }
    
    updateQuantity(productId, newQuantity)
  }

  const handleProceedWithLimitedStock = () => {
    if (stockWarningData) {
      // Add/update with maximum available stock
      const currentCartItem = cart.find(item => item.product.id === stockWarningData.product.id)
      if (currentCartItem) {
        updateQuantity(stockWarningData.product.id, stockWarningData.availableStock)
      } else {
        // Add with available stock
        for (let i = 0; i < stockWarningData.availableStock; i++) {
          addToCart(stockWarningData.product, 1)
        }
      }
    }
    setShowStockWarning(false)
    setStockWarningData(null)
  }

  const handleCreateCustomer = async () => {
    if (!newCustomer.name.trim()) return
    
    try {
      const customer = await createCustomer.mutateAsync({
        ...newCustomer,
        credit_limit: 0,
        current_balance: 0,
        loyalty_points: 0,
        is_active: true
      })
      setCustomer(customer)
      setShowCustomerModal(false)
      setNewCustomer({ name: '', phone: '', email: '', address: '', gender: '' })
      toast.success('Customer created successfully')
    } catch (error) {
      console.error('Failed to create customer:', error)
      toast.error('Failed to create customer')
    }
  }

  const handlePaymentMethodChange = (method: 'cash' | 'card' | 'bnpl') => {
    // Prevent BNPL for walk-in customers
    if (method === 'bnpl' && !selectedCustomer) {
      toast.error('BNPL payment is only available for registered customers. Please select a customer or use Cash/Card payment.')
      return
    }
    
    // Check if customer has sufficient credit for BNPL
    if (method === 'bnpl' && selectedCustomer && selectedCustomer.available_credit < total) {
      toast.error(`Insufficient credit limit. Available credit: ${formatCurrency(selectedCustomer.available_credit)}, Required: ${formatCurrency(total)}`)
      return
    }
    
    setPaymentMethod(method)
    
    // Reset amount paid and change when switching payment methods
    if (method !== 'cash') {
      setAmountPaid('')
      setChangeAmount(0)
    }
  }

  const handleDiscountSubmit = () => {
    const value = parseFloat(discountForm.value) || 0
    
    if (discountTarget.type === 'total') {
      setGlobalDiscount(value)
      setGlobalDiscountType(discountForm.type)
    } else if (discountTarget.type === 'item' && discountTarget.productId) {
      updateItemDiscount(discountTarget.productId, value, discountForm.type)
    }
    
    setShowDiscountModal(false)
    setDiscountForm({ type: 'percentage', value: '' })
  }

  const openDiscountModal = (type: 'item' | 'total', productId?: string) => {
    setDiscountTarget({ type, productId })
    
    if (type === 'total') {
      setDiscountForm({
        type: globalDiscountType,
        value: globalDiscount.toString()
      })
    } else if (type === 'item' && productId) {
      const item = cart.find(i => i.product.id === productId)
      if (item) {
        setDiscountForm({
          type: item.discountType,
          value: item.discount.toString()
        })
      }
    }
    
    setShowDiscountModal(true)
  }

  const getItemTotal = (item: any) => {
    const baseTotal = item.product.sale_price * item.quantity
    if (item.discountType === 'percentage') {
      return baseTotal - (baseTotal * item.discount / 100)
    } else {
      return baseTotal - item.discount
    }
  }

  const handleAmountPaidChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAmountPaid(value)
    
    const paidAmount = parseFloat(value) || 0
    const change = paidAmount - total
    setChangeAmount(change >= 0 ? change : 0)
  }

  const isSaleValid = () => {
    if (cart.length === 0) return false
    
    if (paymentMethod === 'bnpl' && !selectedCustomer) return false
    
    if (paymentMethod === 'bnpl' && selectedCustomer && selectedCustomer.available_credit < total) return false
    
    if (paymentMethod === 'cash') {
      const paidAmount = parseFloat(amountPaid) || 0
      return paidAmount >= total
    }
    
    return true
  }

  const handleCompleteSale = async () => {
    if (!isSaleValid()) {
      if (cart.length === 0) {
        toast.error('Cart is empty!')
      } else if (paymentMethod === 'bnpl' && !selectedCustomer) {
        toast.error('Please select a customer for BNPL payment')
      } else if (paymentMethod === 'bnpl' && selectedCustomer && selectedCustomer.available_credit < total) {
        toast.error(`Insufficient credit limit. Available credit: ${formatCurrency(selectedCustomer.available_credit)}`)
      } else if (paymentMethod === 'cash') {
        const paidAmount = parseFloat(amountPaid) || 0
        if (paidAmount < total) {
          toast.error(`Insufficient payment amount. Required: ${formatCurrency(total)}`)
        }
      }
      return
    }

    // Final stock validation before completing sale
    const stockIssues = []
    for (const item of cart) {
      const product = products.find(p => p.id === item.product.id)
      if (product && item.quantity > product.stock_quantity) {
        stockIssues.push({
          name: product.name,
          requested: item.quantity,
          available: product.stock_quantity
        })
      }
    }

    if (stockIssues.length > 0) {
      const issuesList = stockIssues.map(issue => 
        `${issue.name}: Requested ${issue.requested}, Available ${issue.available}`
      ).join('\n')
      
      const proceed = confirm(
        `Stock shortage detected:\n\n${issuesList}\n\nDo you want to proceed with available quantities?`
      )
      
      if (!proceed) return
      
      // Update cart with available quantities
      stockIssues.forEach(issue => {
        const product = products.find(p => p.name === issue.name)
        if (product) {
          updateQuantity(product.id, issue.available)
        }
      })
    }

    const saleData = {
      customer_id: selectedCustomer?.id,
      items: cart.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.sale_price,
        discount_amount: item.discountType === 'percentage' 
          ? (item.product.sale_price * item.quantity * item.discount / 100)
          : item.discount
      })),
      subtotal,
      discount_amount: globalDiscountType === 'percentage' 
        ? (subtotal * globalDiscount / 100)
        : globalDiscount,
      tax_amount: tax,
      total_amount: total,
      payment_method: paymentMethod,
      payment_status: paymentMethod === 'bnpl' ? 'pending_bnpl' : 'paid',
      cashier_name: 'POS User' // You can make this dynamic based on logged-in user
    }

    try {
      const sale = await createSale.mutateAsync(saleData)
      
      // Generate and print receipt
      const receiptData = {
        id: sale.id,
        receipt_number: sale.receipt_number,
        invoice_number: sale.invoice_number,
        sale_date: sale.sale_date,
        total_amount: sale.total_amount,
        subtotal: sale.subtotal,
        discount_amount: sale.discount_amount,
        tax_amount: sale.tax_amount,
        payment_method: sale.payment_method,
        payment_status: sale.payment_status,
        customer: selectedCustomer ? {
          name: selectedCustomer.name,
          phone: selectedCustomer.phone,
          email: selectedCustomer.email
        } : undefined,
        items: cart.map(item => ({
          name: item.product.name,
          quantity: item.quantity,
          unit_price: item.product.sale_price,
          total_price: getItemTotal(item)
        }))
      }
      
      await generateReceipt(receiptData)
      clearCart()
      setAmountPaid('')
      setChangeAmount(0)
      toast.success('Sale completed successfully')
    } catch (error) {
      console.error('Failed to complete sale:', error)
      toast.error('Failed to complete sale')
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Products Section */}
      <div className="flex-1 p-6">
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search products by name, SKU, or barcode..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className={`bg-white rounded-lg p-4 shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow ${
                product.stock_quantity <= 0 ? 'opacity-50' : ''
              }`}
              onClick={() => handleAddProduct(product)}
            >
              <h3 className="font-medium text-gray-900 mb-1 text-sm">{product.name}</h3>
              <p className="text-xs text-gray-500 mb-2">{product.sku}</p>
              <p className="text-lg font-bold text-blue-600">{formatCurrency(product.sale_price)}</p>
              <p className={`text-xs ${product.stock_quantity <= 0 ? 'text-red-500' : 'text-gray-500'}`}>
                Stock: {product.stock_quantity}
              </p>
              {product.stock_quantity <= 0 && (
                <p className="text-xs text-red-500 font-medium mt-1">Out of Stock</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Cart Section */}
      <div className="w-96 bg-white shadow-lg">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <ShoppingCart className="h-5 w-5 mr-2" />
            Cart ({cart.length})
          </h2>
        </div>

        {/* Customer Selection */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Customer</label>
            <button
              onClick={() => setShowCustomerModal(true)}
              className="text-sm text-blue-600 hover:underline"
            >
              Add New
            </button>
          </div>
          <select
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            value={selectedCustomer?.id || ''}
            onChange={(e) => {
              const customer = customers.find(c => c.id === e.target.value)
              setCustomer(customer || null)
              // Reset payment method if BNPL was selected for walk-in customer
              if (!customer && paymentMethod === 'bnpl') {
                setPaymentMethod('cash')
              }
            }}
          >
            <option value="">Walk-in Customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} {customer.phone && `(${customer.phone})`}
              </option>
            ))}
          </select>
          
          {/* Customer Credit Info */}
          {selectedCustomer && (
            <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
              <div className="flex justify-between">
                <span>Available Credit:</span>
                <span className={selectedCustomer.available_credit > 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatCurrency(selectedCustomer.available_credit)}
                </span>
              </div>
              {selectedCustomer.total_outstanding_dues > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Outstanding:</span>
                  <span>{formatCurrency(selectedCustomer.total_outstanding_dues)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Cart is empty</p>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => {
                const product = products.find(p => p.id === item.product.id)
                const isOverStock = product && item.quantity > product.stock_quantity
                const itemTotal = getItemTotal(item)
                
                return (
                  <div key={item.product.id} className={`rounded-lg p-3 border ${
                    isOverStock ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 text-sm">{item.product.name}</h4>
                        <p className="text-xs text-gray-500">{formatCurrency(item.product.sale_price)} each</p>
                        {isOverStock && (
                          <p className="text-xs text-red-600 font-medium">
                            ⚠️ Only {product?.stock_quantity} available
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => openDiscountModal('item', item.product.id)}
                        className="text-blue-600 hover:text-blue-800 p-1"
                        title="Apply discount"
                      >
                        <Percent className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Discount Display */}
                    {item.discount > 0 && (
                      <div className="text-xs text-green-600 mb-2">
                        Discount: {item.discountType === 'percentage' ? `${item.discount}%` : formatCurrency(item.discount)}
                        {' '}(-{item.discountType === 'percentage' 
                          ? formatCurrency((item.product.sale_price * item.quantity * item.discount / 100))
                          : formatCurrency(item.discount)
                        })
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleQuantityUpdate(item.product.id, item.quantity - 1)}
                          className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-sm"
                        >
                          -
                        </button>
                        <span className={`w-8 text-center text-sm ${isOverStock ? 'text-red-600 font-bold' : ''}`}>
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => handleQuantityUpdate(item.product.id, item.quantity + 1)}
                          className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm"
                        >
                          +
                        </button>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium">{formatCurrency(itemTotal)}</span>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-red-500 text-sm"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Payment Section */}
        {cart.length > 0 && (
          <div className="border-t border-gray-200 p-4">
            {/* Global Discount */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Total Discount</label>
                <button
                  onClick={() => openDiscountModal('total')}
                  className="text-blue-600 hover:text-blue-800 flex items-center text-sm"
                >
                  <Calculator className="h-4 w-4 mr-1" />
                  Apply
                </button>
              </div>
              {globalDiscount > 0 && (
                <div className="text-sm text-green-600 mb-2">
                  {globalDiscountType === 'percentage' 
                    ? `${globalDiscount}% (${formatCurrency(subtotal * globalDiscount / 100)})` 
                    : formatCurrency(globalDiscount)
                  } discount applied
                </div>
              )}
            </div>

            {/* Payment Method */}
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block">Payment Method</label>
              <div className="grid grid-cols-3 gap-2">
                {['cash', 'card', 'bnpl'].map((method) => {
                  const isDisabled = method === 'bnpl' && (!selectedCustomer || selectedCustomer.available_credit < total)
                  return (
                    <button
                      key={method}
                      onClick={() => handlePaymentMethodChange(method as any)}
                      disabled={isDisabled}
                      className={`p-2 text-xs rounded-md border transition-colors ${
                        paymentMethod === method
                          ? 'bg-blue-500 text-white border-blue-500'
                          : isDisabled
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {method.toUpperCase()}
                      {method === 'bnpl' && !selectedCustomer && (
                        <div className="text-xs mt-1">Customer Required</div>
                      )}
                      {method === 'bnpl' && selectedCustomer && selectedCustomer.available_credit < total && (
                        <div className="text-xs mt-1">Insufficient Credit</div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Cash Payment Input */}
            {paymentMethod === 'cash' && (
              <div className="mb-4 space-y-2">
                <label className="text-sm font-medium text-gray-700">Amount Paid (₨)</label>
                <input
                  type="number"
                  step="0.01"
                  min={total}
                  value={amountPaid}
                  onChange={handleAmountPaidChange}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder={`Enter amount (min: ${formatCurrency(total)})`}
                />
                
                {parseFloat(amountPaid) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Change:</span>
                    <span className={changeAmount >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {formatCurrency(changeAmount)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Totals */}
            <div className="space-y-2 mb-4 text-sm">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {globalDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Total Discount:</span>
                  <span>-{formatCurrency(globalDiscountType === 'percentage' 
                    ? (subtotal * globalDiscount / 100) 
                    : globalDiscount
                  )}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Tax ({taxRate}%):</span>
                <span>{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total:</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            <button
              onClick={handleCompleteSale}
              disabled={createSale.isPending || !isSaleValid()}
              className="w-full bg-green-500 text-white p-3 rounded-lg font-medium hover:bg-green-600 disabled:opacity-50 flex items-center justify-center"
            >
              <Receipt className="h-5 w-5 mr-2" />
              {createSale.isPending ? 'Processing...' : 'Complete Sale'}
            </button>
          </div>
        )}
      </div>

      {/* Discount Modal */}
      {showDiscountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">
              Apply {discountTarget.type === 'total' ? 'Total' : 'Item'} Discount
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Discount Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDiscountForm({ ...discountForm, type: 'percentage' })}
                    className={`p-2 text-sm rounded-md border ${
                      discountForm.type === 'percentage'
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    Percentage (%)
                  </button>
                  <button
                    onClick={() => setDiscountForm({ ...discountForm, type: 'amount' })}
                    className={`p-2 text-sm rounded-md border ${
                      discountForm.type === 'amount'
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    Amount (₨)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Discount {discountForm.type === 'percentage' ? 'Percentage' : 'Amount'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={discountForm.type === 'percentage' ? '100' : undefined}
                  value={discountForm.value}
                  onChange={(e) => setDiscountForm({ ...discountForm, value: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder={discountForm.type === 'percentage' ? 'Enter percentage (0-100)' : 'Enter amount in rupees'}
                />
              </div>

              {discountForm.value && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    {discountTarget.type === 'total' ? (
                      <>
                        Discount: {discountForm.type === 'percentage' 
                          ? `${discountForm.value}% (${formatCurrency(subtotal * parseFloat(discountForm.value) / 100)})`
                          : formatCurrency(parseFloat(discountForm.value))
                        }
                      </>
                    ) : (
                      discountTarget.productId && (() => {
                        const item = cart.find(i => i.product.id === discountTarget.productId)
                        if (!item) return null
                        const itemSubtotal = item.product.sale_price * item.quantity
                        return (
                          <>
                            Discount: {discountForm.type === 'percentage' 
                              ? `${discountForm.value}% (${formatCurrency(itemSubtotal * parseFloat(discountForm.value) / 100)})`
                              : formatCurrency(parseFloat(discountForm.value))
                            }
                          </>
                        )
                      })()
                    )}
                  </p>
                </div>
              )}
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowDiscountModal(false)
                  setDiscountForm({ type: 'percentage', value: '' })
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDiscountSubmit}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                Apply Discount
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Warning Modal */}
      {showStockWarning && stockWarningData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <div className="flex items-center mb-4">
              <AlertTriangle className="h-6 w-6 text-yellow-500 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900">Stock Warning</h3>
            </div>
            
            <div className="mb-4">
              <p className="text-gray-700 mb-2">
                <strong>{stockWarningData.product.name}</strong>
              </p>
              <p className="text-sm text-gray-600">
                You're trying to add <strong>{stockWarningData.requestedQuantity}</strong> items, 
                but only <strong>{stockWarningData.availableStock}</strong> are available in stock.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowStockWarning(false)
                  setStockWarningData(null)
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleProceedWithLimitedStock}
                className="flex-1 px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600"
              >
                Add {stockWarningData.availableStock} Items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Add New Customer</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Customer Name *"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-md"
              />
              <input
                type="text"
                placeholder="Phone Number"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-md"
              />
              <input
                type="email"
                placeholder="Email"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-md"
              />
              <select
                value={newCustomer.gender}
                onChange={(e) => setNewCustomer({ ...newCustomer, gender: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="">Select Gender (Optional)</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              <textarea
                placeholder="Address"
                value={newCustomer.address}
                onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-md"
                rows={3}
              />
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowCustomerModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCustomer}
                disabled={!newCustomer.name.trim() || createCustomer.isPending}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
              >
                {createCustomer.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default POS