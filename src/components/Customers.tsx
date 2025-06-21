import React, { useState } from 'react'
import { Plus, Search, Edit, Trash2, User, Phone, Mail, MapPin, CreditCard, Award, AlertTriangle } from 'lucide-react'
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from '../hooks/useCustomers'
import { Customer } from '../lib/supabase'

const Customers: React.FC = () => {
  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  
  const { data: customers = [] } = useCustomers()
  const createCustomer = useCreateCustomer()
  const updateCustomer = useUpdateCustomer()
  const deleteCustomer = useDeleteCustomer()

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    credit_limit: '0',
    gender: ''
  })

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const customerData = {
      ...formData,
      credit_limit: parseFloat(formData.credit_limit) || 0,
      current_balance: 0,
      loyalty_points: 0,
      is_active: true
    }

    try {
      if (editingCustomer) {
        await updateCustomer.mutateAsync({ id: editingCustomer.id, ...customerData })
      } else {
        await createCustomer.mutateAsync(customerData)
      }
      handleCloseModal()
    } catch (error) {
      console.error('Error saving customer:', error)
    }
  }

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    setFormData({
      name: customer.name,
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      credit_limit: customer.credit_limit.toString(),
      gender: customer.gender || ''
    })
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingCustomer(null)
    setFormData({
      name: '',
      phone: '',
      email: '',
      address: '',
      credit_limit: '0',
      gender: ''
    })
  }

  const getCreditStatus = (customer: Customer) => {
    if (customer.total_outstanding_dues > 0) {
      return {
        status: 'Has Outstanding Dues',
        color: 'text-red-600 bg-red-50',
        icon: AlertTriangle
      }
    }
    if (customer.available_credit < customer.credit_limit * 0.2) {
      return {
        status: 'Low Credit Available',
        color: 'text-yellow-600 bg-yellow-50',
        icon: AlertTriangle
      }
    }
    return {
      status: 'Good Standing',
      color: 'text-green-600 bg-green-50',
      icon: CreditCard
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Customer Management</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Add Customer
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Search customers by name, phone, or email..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Customers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCustomers.map((customer) => {
          const creditStatus = getCreditStatus(customer)
          return (
            <div key={customer.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <div className="bg-blue-100 rounded-full p-3 mr-3">
                    <User className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{customer.name}</h3>
                    <p className="text-sm text-gray-500">Customer ID: {customer.id.slice(0, 8)}</p>
                    {customer.gender && (
                      <p className="text-sm text-gray-500 capitalize">{customer.gender}</p>
                    )}
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEdit(customer)}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteCustomer.mutate(customer.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {customer.phone && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Phone className="h-4 w-4 mr-2" />
                    {customer.phone}
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Mail className="h-4 w-4 mr-2" />
                    {customer.email}
                  </div>
                )}
                {customer.address && (
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPin className="h-4 w-4 mr-2" />
                    {customer.address}
                  </div>
                )}
              </div>

              {/* Credit Status */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className={`flex items-center p-2 rounded-lg ${creditStatus.color} mb-3`}>
                  <creditStatus.icon className="h-4 w-4 mr-2" />
                  <span className="text-sm font-medium">{creditStatus.status}</span>
                </div>
              </div>

              {/* Financial Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center text-sm text-gray-600">
                    <CreditCard className="h-4 w-4 mr-1" />
                    Credit Limit
                  </div>
                  <p className="text-lg font-semibold text-gray-900">₨{customer.credit_limit.toLocaleString()}</p>
                </div>
                <div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Award className="h-4 w-4 mr-1" />
                    Loyalty Points
                  </div>
                  <p className="text-lg font-semibold text-gray-900">{customer.loyalty_points}</p>
                </div>
              </div>

              {/* Available Credit and Outstanding Dues */}
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Available Credit</div>
                  <p className={`text-sm font-semibold ${
                    customer.available_credit > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    ₨{customer.available_credit.toLocaleString()}
                  </p>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Outstanding Dues</div>
                  <p className={`text-sm font-semibold ${
                    customer.total_outstanding_dues > 0 ? 'text-red-600' : 'text-gray-900'
                  }`}>
                    ₨{customer.total_outstanding_dues.toLocaleString()}
                  </p>
                </div>
              </div>

              {customer.current_balance > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-red-600">Legacy Balance: ₨{customer.current_balance.toLocaleString()}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-screen overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Credit Limit (₨)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.credit_limit}
                    onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              {!editingCustomer && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <strong>Credit Management:</strong> The customer's available credit will be set to their credit limit initially. 
                    Outstanding dues and available credit will be automatically managed through BNPL transactions.
                  </p>
                </div>
              )}

              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createCustomer.isPending || updateCustomer.isPending}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  {(createCustomer.isPending || updateCustomer.isPending) ? 'Saving...' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Customers