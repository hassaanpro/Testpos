import React, { useState } from 'react'
import { Plus, Search, Eye, Package, Truck, CheckCircle, XCircle, Calendar } from 'lucide-react'
import { 
  usePurchaseOrders, 
  useCreatePurchaseOrder, 
  useSuppliers, 
  useCreateSupplier,
  usePurchaseItems,
  useAddPurchaseItem,
  useReceivePurchaseItem,
  useUpdatePurchaseOrder
} from '../hooks/usePurchaseOrders'
import { useProducts } from '../hooks/useProducts'
import { format } from 'date-fns'

const PurchaseOrders: React.FC = () => {
  const [showModal, setShowModal] = useState(false)
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [selectedPO, setSelectedPO] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  
  const { data: purchaseOrders = [] } = usePurchaseOrders()
  const { data: suppliers = [] } = useSuppliers()
  const { data: products = [] } = useProducts()
  const createPurchaseOrder = useCreatePurchaseOrder()
  const createSupplier = useCreateSupplier()
  const addPurchaseItem = useAddPurchaseItem()
  const receivePurchaseItem = useReceivePurchaseItem()
  const updatePurchaseOrder = useUpdatePurchaseOrder()

  const [poForm, setPOForm] = useState({
    supplier_id: '',
    expected_date: '',
    notes: '',
    items: [] as Array<{
      product_id: string
      quantity: number
      unit_cost: number
    }>
  })

  const [supplierForm, setSupplierForm] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    credit_terms: 30
  })

  const [receiveForm, setReceiveForm] = useState({
    items: [] as Array<{
      id: string
      received_quantity: number
      unit_cost: number
    }>
  })

  const filteredPOs = purchaseOrders.filter(po => {
    const matchesSearch = po.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         po.supplier?.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = !statusFilter || po.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (poForm.items.length === 0) {
      alert('Please add at least one item to the purchase order')
      return
    }

    const subtotal = poForm.items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0)
    const tax_amount = subtotal * 0.17 // 17% tax
    const total_amount = subtotal + tax_amount

    try {
      const po = await createPurchaseOrder.mutateAsync({
        supplier_id: poForm.supplier_id || null,
        status: 'pending',
        subtotal,
        tax_amount,
        total_amount,
        order_date: new Date().toISOString(),
        expected_date: poForm.expected_date || null,
        notes: poForm.notes
      })

      // Add items to the purchase order
      for (const item of poForm.items) {
        await addPurchaseItem.mutateAsync({
          purchase_order_id: po.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          total_cost: item.quantity * item.unit_cost,
          received_quantity: 0
        })
      }

      handleCloseModal()
    } catch (error) {
      console.error('Error creating purchase order:', error)
    }
  }

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      await createSupplier.mutateAsync({
        ...supplierForm,
        is_active: true
      })
      setShowSupplierModal(false)
      setSupplierForm({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        credit_terms: 30
      })
    } catch (error) {
      console.error('Error creating supplier:', error)
    }
  }

  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      for (const item of receiveForm.items) {
        if (item.received_quantity > 0) {
          await receivePurchaseItem.mutateAsync({
            itemId: item.id,
            receivedQuantity: item.received_quantity,
            unitCost: item.unit_cost
          })
        }
      }

      // Update PO status to received if all items are fully received
      const allItemsReceived = receiveForm.items.every(item => {
        const originalItem = selectedPO?.purchase_items?.find((pi: any) => pi.id === item.id)
        return originalItem && (originalItem.received_quantity + item.received_quantity) >= originalItem.quantity
      })

      if (allItemsReceived) {
        await updatePurchaseOrder.mutateAsync({
          id: selectedPO.id,
          status: 'received',
          received_date: new Date().toISOString()
        })
      }

      setShowReceiveModal(false)
      setSelectedPO(null)
      setReceiveForm({ items: [] })
    } catch (error) {
      console.error('Error receiving stock:', error)
    }
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setPOForm({
      supplier_id: '',
      expected_date: '',
      notes: '',
      items: []
    })
  }

  const addItemToPO = () => {
    setPOForm({
      ...poForm,
      items: [...poForm.items, { product_id: '', quantity: 1, unit_cost: 0 }]
    })
  }

  const removeItemFromPO = (index: number) => {
    setPOForm({
      ...poForm,
      items: poForm.items.filter((_, i) => i !== index)
    })
  }

  const updatePOItem = (index: number, field: string, value: any) => {
    const updatedItems = [...poForm.items]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    setPOForm({ ...poForm, items: updatedItems })
  }

  const openReceiveModal = (po: any) => {
    setSelectedPO(po)
    const items = po.purchase_items?.map((item: any) => ({
      id: item.id,
      received_quantity: 0,
      unit_cost: item.unit_cost
    })) || []
    setReceiveForm({ items })
    setShowReceiveModal(true)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'received': return 'bg-green-100 text-green-800'
      case 'cancelled': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowSupplierModal(true)}
            className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Supplier
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Create PO
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Search purchase orders..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <select
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Purchase Orders Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO Number</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expected Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPOs.map((po) => (
                <tr key={po.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{po.po_number}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {po.supplier?.name || 'No Supplier'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {format(new Date(po.order_date), 'MMM dd, yyyy')}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {po.expected_date ? format(new Date(po.expected_date), 'MMM dd, yyyy') : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    ₨{po.total_amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(po.status)}`}>
                      {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setSelectedPO(po)}
                        className="text-blue-600 hover:text-blue-900"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {po.status === 'pending' && (
                        <button
                          onClick={() => openReceiveModal(po)}
                          className="text-green-600 hover:text-green-900"
                          title="Receive Stock"
                        >
                          <Truck className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create PO Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-screen overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Create Purchase Order</h3>
            
            <form onSubmit={handleCreatePO} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                  <select
                    value={poForm.supplier_id}
                    onChange={(e) => setPOForm({ ...poForm, supplier_id: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expected Date</label>
                  <input
                    type="date"
                    value={poForm.expected_date}
                    onChange={(e) => setPOForm({ ...poForm, expected_date: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={poForm.notes}
                  onChange={(e) => setPOForm({ ...poForm, notes: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              {/* Items Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-md font-medium text-gray-900">Items</h4>
                  <button
                    type="button"
                    onClick={addItemToPO}
                    className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                  >
                    Add Item
                  </button>
                </div>

                <div className="space-y-3">
                  {poForm.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 border border-gray-200 rounded-lg">
                      <div>
                        <select
                          value={item.product_id}
                          onChange={(e) => updatePOItem(index, 'product_id', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md text-sm"
                          required
                        >
                          <option value="">Select Product</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name} ({product.sku})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <input
                          type="number"
                          placeholder="Quantity"
                          value={item.quantity}
                          onChange={(e) => updatePOItem(index, 'quantity', parseInt(e.target.value) || 0)}
                          className="w-full p-2 border border-gray-300 rounded-md text-sm"
                          min="1"
                          required
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Unit Cost"
                          value={item.unit_cost}
                          onChange={(e) => updatePOItem(index, 'unit_cost', parseFloat(e.target.value) || 0)}
                          className="w-full p-2 border border-gray-300 rounded-md text-sm"
                          min="0"
                          required
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          ₨{(item.quantity * item.unit_cost).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeItemFromPO(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {poForm.items.length > 0 && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <div className="text-right space-y-1">
                      <div className="text-sm">
                        Subtotal: ₨{poForm.items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0).toFixed(2)}
                      </div>
                      <div className="text-sm">
                        Tax (17%): ₨{(poForm.items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0) * 0.17).toFixed(2)}
                      </div>
                      <div className="text-lg font-bold">
                        Total: ₨{(poForm.items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0) * 1.17).toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createPurchaseOrder.isPending || poForm.items.length === 0}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  {createPurchaseOrder.isPending ? 'Creating...' : 'Create Purchase Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add New Supplier</h3>
            
            <form onSubmit={handleCreateSupplier} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                <input
                  type="text"
                  value={supplierForm.contact_person}
                  onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Credit Terms (Days)</label>
                  <input
                    type="number"
                    value={supplierForm.credit_terms}
                    onChange={(e) => setSupplierForm({ ...supplierForm, credit_terms: parseInt(e.target.value) || 30 })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  value={supplierForm.address}
                  onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                  rows={3}
                />
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSupplier.isPending}
                  className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50"
                >
                  {createSupplier.isPending ? 'Creating...' : 'Create Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Stock Modal */}
      {showReceiveModal && selectedPO && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-screen overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Receive Stock - {selectedPO.po_number}</h3>
            
            <form onSubmit={handleReceiveStock} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-blue-900 mb-2">Weighted Average Cost Calculation</h4>
                <p className="text-sm text-blue-800">
                  When you receive stock, the system will automatically calculate the new weighted average cost 
                  for each product based on existing stock and the new stock received.
                </p>
              </div>

              <div className="space-y-3">
                {selectedPO.purchase_items?.map((item: any, index: number) => {
                  const remainingQty = item.quantity - item.received_quantity
                  if (remainingQty <= 0) return null

                  return (
                    <div key={item.id} className="grid grid-cols-1 md:grid-cols-5 gap-3 p-3 border border-gray-200 rounded-lg">
                      <div className="md:col-span-2">
                        <div className="font-medium text-gray-900">{item.product?.name}</div>
                        <div className="text-sm text-gray-500">SKU: {item.product?.sku}</div>
                        <div className="text-sm text-gray-500">
                          Current Cost: ₨{item.product?.cost_price?.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Ordered</label>
                        <div className="text-sm font-medium">{item.quantity}</div>
                        <div className="text-xs text-gray-500">
                          Received: {item.received_quantity}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Receive Qty</label>
                        <input
                          type="number"
                          min="0"
                          max={remainingQty}
                          value={receiveForm.items[index]?.received_quantity || 0}
                          onChange={(e) => {
                            const newItems = [...receiveForm.items]
                            newItems[index] = {
                              ...newItems[index],
                              id: item.id,
                              received_quantity: parseInt(e.target.value) || 0
                            }
                            setReceiveForm({ items: newItems })
                          }}
                          className="w-full p-2 border border-gray-300 rounded-md text-sm"
                        />
                        <div className="text-xs text-gray-500">
                          Max: {remainingQty}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Unit Cost</label>
                        <input
                          type="number"
                          step="0.01"
                          value={receiveForm.items[index]?.unit_cost || item.unit_cost}
                          onChange={(e) => {
                            const newItems = [...receiveForm.items]
                            newItems[index] = {
                              ...newItems[index],
                              id: item.id,
                              unit_cost: parseFloat(e.target.value) || 0
                            }
                            setReceiveForm({ items: newItems })
                          }}
                          className="w-full p-2 border border-gray-300 rounded-md text-sm"
                        />
                        <div className="text-xs text-gray-500">
                          Original: ₨{item.unit_cost}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowReceiveModal(false)
                    setSelectedPO(null)
                    setReceiveForm({ items: [] })
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={receivePurchaseItem.isPending}
                  className="flex-1 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
                >
                  {receivePurchaseItem.isPending ? 'Receiving...' : 'Receive Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PO Details Modal */}
      {selectedPO && !showReceiveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Purchase Order Details</h3>
              <button
                onClick={() => setSelectedPO(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">PO Number</p>
                  <p className="font-medium">{selectedPO.po_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedPO.status)}`}>
                    {selectedPO.status.charAt(0).toUpperCase() + selectedPO.status.slice(1)}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Supplier</p>
                  <p className="font-medium">{selectedPO.supplier?.name || 'No Supplier'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Order Date</p>
                  <p className="font-medium">{format(new Date(selectedPO.order_date), 'MMM dd, yyyy')}</p>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Items</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Product</th>
                        <th className="px-3 py-2 text-left">Ordered</th>
                        <th className="px-3 py-2 text-left">Received</th>
                        <th className="px-3 py-2 text-left">Unit Cost</th>
                        <th className="px-3 py-2 text-left">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPO.purchase_items?.map((item: any) => (
                        <tr key={item.id} className="border-t">
                          <td className="px-3 py-2">{item.product?.name}</td>
                          <td className="px-3 py-2">{item.quantity}</td>
                          <td className="px-3 py-2">
                            <span className={item.received_quantity === item.quantity ? 'text-green-600' : 'text-yellow-600'}>
                              {item.received_quantity}
                            </span>
                          </td>
                          <td className="px-3 py-2">₨{item.unit_cost}</td>
                          <td className="px-3 py-2">₨{item.total_cost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="space-y-2 text-right">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>₨{selectedPO.subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax:</span>
                    <span>₨{selectedPO.tax_amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Total:</span>
                    <span>₨{selectedPO.total_amount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PurchaseOrders