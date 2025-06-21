import React, { useState, useRef } from 'react'
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Package, 
  AlertTriangle, 
  Tag, 
  CheckCircle, 
  XCircle, 
  ToggleLeft, 
  ToggleRight,
  Download,
  Upload,
  RefreshCw
} from 'lucide-react'
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useLowStockProducts, useOutOfStockProducts } from '../hooks/useProducts'
import { useCategories, useCreateCategory } from '../hooks/useCategories'
import { Product } from '../lib/supabase'
import { formatCurrency } from '../utils/dateUtils'
import toast from 'react-hot-toast'
import Papa from 'papaparse'

const Inventory: React.FC = () => {
  const [showModal, setShowModal] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [stockFilter, setStockFilter] = useState('all')
  const [barcodeError, setBarcodeError] = useState('')
  const [importData, setImportData] = useState<any[]>([])
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importStatus, setImportStatus] = useState<{
    total: number;
    processed: number;
    created: number;
    updated: number;
    failed: number;
    inProgress: boolean;
  }>({
    total: 0,
    processed: 0,
    created: 0,
    updated: 0,
    failed: 0,
    inProgress: false
  })
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const { data: products = [], isLoading: productsLoading } = useProducts()
  const { data: categories = [], isLoading: categoriesLoading } = useCategories()
  const { data: lowStockProducts = [] } = useLowStockProducts()
  const { data: outOfStockProducts = [] } = useOutOfStockProducts()
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const deleteProduct = useDeleteProduct()
  const createCategory = useCreateCategory()

  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    category_id: '',
    cost_price: '',
    sale_price: '',
    stock_quantity: '',
    min_stock_level: '10',
    expiry_date: '',
    batch_number: '',
    is_active: true
  })

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    code: '',
    description: ''
  })

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.barcode?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = !selectedCategory || product.category_id === selectedCategory
    
    let matchesStockFilter = true
    if (stockFilter === 'low') {
      matchesStockFilter = lowStockProducts.some(p => p.id === product.id)
    } else if (stockFilter === 'out') {
      matchesStockFilter = product.stock_quantity === 0
    }
    
    return matchesSearch && matchesCategory && matchesStockFilter
  })

  const validateBarcode = (barcode: string): boolean => {
    setBarcodeError('')
    
    if (barcode.trim() === '') {
      // Empty barcode is allowed
      return true
    }
    
    // Check if barcode contains only numbers
    if (!/^\d+$/.test(barcode)) {
      setBarcodeError('Barcode must contain only numbers.')
      return false
    }
    
    // Check if barcode length is between 8 and 13 digits
    if (barcode.length < 8 || barcode.length > 13) {
      setBarcodeError('Barcode must be between 8 and 13 digits long.')
      return false
    }
    
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate barcode before proceeding
    if (!validateBarcode(formData.barcode)) {
      return
    }
    
    const productData = {
      ...formData,
      barcode: formData.barcode.trim() || null, // Set to null if empty
      cost_price: parseFloat(formData.cost_price) || 0,
      sale_price: parseFloat(formData.sale_price) || 0,
      stock_quantity: parseInt(formData.stock_quantity) || 0,
      min_stock_level: parseInt(formData.min_stock_level) || 10,
      expiry_date: formData.expiry_date || null,
      is_active: formData.is_active
    }

    try {
      if (editingProduct) {
        await updateProduct.mutateAsync({ id: editingProduct.id, ...productData })
        toast.success('Product updated successfully')
      } else {
        await createProduct.mutateAsync(productData)
        toast.success('Product created successfully')
      }
      handleCloseModal()
    } catch (error) {
      console.error('Error saving product:', error)
      toast.error('Error saving product')
    }
  }

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      await createCategory.mutateAsync(categoryForm)
      handleCloseCategoryModal()
      toast.success('Category created successfully')
    } catch (error) {
      console.error('Error creating category:', error)
      toast.error('Error creating category')
    }
  }

  const handleEdit = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      barcode: product.barcode || '',
      category_id: product.category_id,
      cost_price: product.cost_price.toString(),
      sale_price: product.sale_price.toString(),
      stock_quantity: product.stock_quantity.toString(),
      min_stock_level: product.min_stock_level.toString(),
      expiry_date: product.expiry_date || '',
      batch_number: product.batch_number || '',
      is_active: product.is_active
    })
    setBarcodeError('')
    setShowModal(true)
  }

  const handleToggleActive = async (product: Product) => {
    try {
      await updateProduct.mutateAsync({
        id: product.id,
        is_active: !product.is_active
      })
      toast.success(`Product ${product.is_active ? 'deactivated' : 'activated'} successfully`)
    } catch (error) {
      console.error('Error toggling product status:', error)
      toast.error('Error updating product status')
    }
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingProduct(null)
    setBarcodeError('')
    setFormData({
      name: '',
      barcode: '',
      category_id: '',
      cost_price: '',
      sale_price: '',
      stock_quantity: '',
      min_stock_level: '10',
      expiry_date: '',
      batch_number: '',
      is_active: true
    })
  }

  const handleCloseCategoryModal = () => {
    setShowCategoryModal(false)
    setCategoryForm({
      name: '',
      code: '',
      description: ''
    })
  }

  const getStockStatus = (product: Product) => {
    if (product.stock_quantity === 0) return { 
      status: 'Out of Stock', 
      color: 'text-red-600 bg-red-50',
      icon: XCircle
    }
    if (product.stock_quantity <= product.min_stock_level) return { 
      status: 'Low Stock', 
      color: 'text-yellow-600 bg-yellow-50',
      icon: AlertTriangle
    }
    return { 
      status: 'In Stock', 
      color: 'text-green-600 bg-green-50',
      icon: CheckCircle
    }
  }

  // Export inventory to CSV
  const handleExportInventory = () => {
    try {
      // Prepare data for export
      const exportData = products.map(product => {
        const category = categories.find(c => c.id === product.category_id)
        return {
          name: product.name,
          sku: product.sku,
          barcode: product.barcode || '',
          category_name: category?.name || '',
          category_code: category?.code || '',
          cost_price: product.cost_price,
          sale_price: product.sale_price,
          stock_quantity: product.stock_quantity,
          min_stock_level: product.min_stock_level,
          expiry_date: product.expiry_date || '',
          batch_number: product.batch_number || '',
          is_active: product.is_active ? 'Yes' : 'No'
        }
      })

      // Convert to CSV
      const csv = Papa.unparse(exportData)
      
      // Create download link
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', `inventory-export-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      toast.success(`Exported ${exportData.length} products to CSV`)
    } catch (error) {
      console.error('Error exporting inventory:', error)
      toast.error('Failed to export inventory')
    }
  }

  // Import inventory from CSV
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset import state
    setImportData([])
    setImportErrors([])
    setImportStatus({
      total: 0,
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
      inProgress: false
    })

    // Parse CSV file
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setImportErrors(results.errors.map(err => `CSV parsing error: ${err.message} at row ${err.row}`))
          return
        }

        // Validate required fields
        const requiredFields = ['name', 'category_name', 'sale_price']
        const missingFields = requiredFields.filter(field => 
          !results.meta.fields?.includes(field)
        )

        if (missingFields.length > 0) {
          setImportErrors([`CSV is missing required fields: ${missingFields.join(', ')}`])
          return
        }

        setImportData(results.data)
        setShowImportModal(true)
      },
      error: (error) => {
        setImportErrors([`Failed to parse CSV file: ${error.message}`])
        toast.error('Failed to parse CSV file')
      }
    })

    // Reset file input
    e.target.value = ''
  }

  const processImport = async () => {
    if (importData.length === 0) {
      toast.error('No data to import')
      return
    }

    setImportStatus({
      ...importStatus,
      total: importData.length,
      inProgress: true
    })

    const errors: string[] = []
    let created = 0
    let updated = 0
    let failed = 0

    for (let i = 0; i < importData.length; i++) {
      const item = importData[i]
      
      try {
        // Find category by name or code
        let categoryId = ''
        const categoryByName = categories.find(c => c.name.toLowerCase() === item.category_name?.toLowerCase())
        const categoryByCode = categories.find(c => c.code.toLowerCase() === item.category_code?.toLowerCase())
        
        if (categoryByName) {
          categoryId = categoryByName.id
        } else if (categoryByCode) {
          categoryId = categoryByCode.id
        } else if (item.category_name) {
          // Create new category if it doesn't exist
          try {
            const code = item.category_code || item.category_name.substring(0, 3).toUpperCase()
            const newCategory = await createCategory.mutateAsync({
              name: item.category_name,
              code: code,
              description: ''
            })
            categoryId = newCategory.id
          } catch (error) {
            errors.push(`Row ${i + 2}: Failed to create category "${item.category_name}"`)
            failed++
            continue
          }
        } else {
          errors.push(`Row ${i + 2}: Missing category information`)
          failed++
          continue
        }

        // Check if product exists by SKU
        const existingProduct = products.find(p => 
          p.sku.toLowerCase() === item.sku?.toLowerCase() ||
          (item.barcode && p.barcode === item.barcode)
        )

        const productData = {
          name: item.name,
          barcode: item.barcode || null,
          category_id: categoryId,
          cost_price: parseFloat(item.cost_price) || 0,
          sale_price: parseFloat(item.sale_price) || 0,
          stock_quantity: parseInt(item.stock_quantity) || 0,
          min_stock_level: parseInt(item.min_stock_level) || 10,
          expiry_date: item.expiry_date || null,
          batch_number: item.batch_number || null,
          is_active: item.is_active?.toLowerCase() === 'yes' || item.is_active === 'true' || true
        }

        if (existingProduct) {
          // Update existing product
          await updateProduct.mutateAsync({
            id: existingProduct.id,
            ...productData
          })
          updated++
        } else {
          // Create new product
          await createProduct.mutateAsync(productData)
          created++
        }
      } catch (error) {
        console.error(`Error processing row ${i + 2}:`, error)
        errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        failed++
      }

      // Update progress
      setImportStatus(prev => ({
        ...prev,
        processed: i + 1,
        created,
        updated,
        failed
      }))
    }

    setImportErrors(errors)
    setImportStatus(prev => ({
      ...prev,
      inProgress: false
    }))

    if (errors.length === 0) {
      toast.success(`Import completed: ${created} created, ${updated} updated`)
      setShowImportModal(false)
    } else {
      toast.error(`Import completed with ${errors.length} errors`)
    }
  }

  if (productsLoading || categoriesLoading) {
    return (
      <div className="p-6 flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
        <div className="flex space-x-3">
          <button
            onClick={handleExportInventory}
            className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 flex items-center"
          >
            <Download className="h-5 w-5 mr-2" />
            Export Inventory
          </button>
          <button
            onClick={handleImportClick}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 flex items-center"
          >
            <Upload className="h-5 w-5 mr-2" />
            Import Inventory
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".csv" 
            className="hidden" 
          />
          <button
            onClick={() => setShowCategoryModal(true)}
            className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 flex items-center"
          >
            <Tag className="h-5 w-5 mr-2" />
            Add Category
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Product
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
                placeholder="Search products by name, SKU, or barcode..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <select
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
          >
            <option value="all">All Stock Levels</option>
            <option value="low">Low Stock ({lowStockProducts.length})</option>
            <option value="out">Out of Stock ({outOfStockProducts.length})</option>
          </select>
        </div>
      </div>

      {/* Categories Overview */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Categories</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {categories.map((category) => {
            const categoryProducts = products.filter(p => p.category_id === category.id)
            return (
              <div 
                key={category.id} 
                className={`bg-gray-50 rounded-lg p-3 text-center cursor-pointer ${
                  selectedCategory === category.id ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => setSelectedCategory(category.id === selectedCategory ? '' : category.id)}
              >
                <div className="text-sm font-medium text-gray-900">{category.name}</div>
                <div className="text-xs text-gray-500">Code: {category.code}</div>
                <div className="text-xs text-blue-600 mt-1">{categoryProducts.length} products</div>
              </div>
            )
          })}
          {categories.length === 0 && (
            <div className="col-span-full text-center text-gray-500 py-4">
              No categories yet. Add your first category to get started.
            </div>
          )}
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProducts.map((product) => {
                const stockStatus = getStockStatus(product)
                const StatusIcon = stockStatus.icon
                return (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <Package className="h-8 w-8 text-gray-400 mr-3" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{product.name}</div>
                          {product.barcode && (
                            <div className="text-xs text-gray-500">Barcode: {product.barcode}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{product.sku}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {categories.find(c => c.id === product.category_id)?.name || 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{formatCurrency(product.sale_price)}</div>
                      <div className="text-xs text-gray-500">Cost: {formatCurrency(product.cost_price)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{product.stock_quantity}</div>
                      <div className="text-xs text-gray-500">Min: {product.min_stock_level}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${stockStatus.color}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {stockStatus.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleActive(product)}
                        className={`text-sm font-medium flex items-center ${
                          product.is_active ? 'text-green-600' : 'text-gray-400'
                        }`}
                      >
                        {product.is_active ? (
                          <>
                            <ToggleRight className="h-5 w-5 mr-1" />
                            Active
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="h-5 w-5 mr-1" />
                            Inactive
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(product)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Edit Product"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete ${product.name}?`)) {
                              deleteProduct.mutate(product.id)
                            }
                          }}
                          className="text-red-600 hover:text-red-900"
                          title="Delete Product"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        
        {filteredProducts.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            {searchTerm || selectedCategory || stockFilter !== 'all' ? 
              'No products match your search criteria.' : 
              'No products found. Add your first product to get started.'}
          </div>
        )}
      </div>

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add New Category</h3>
            
            <form onSubmit={handleCategorySubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                  placeholder="e.g., Electronics, Clothing, Food"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category Code *</label>
                <input
                  type="text"
                  required
                  value={categoryForm.code}
                  onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value.toUpperCase() })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                  placeholder="e.g., ELEC, CLTH, FOOD"
                  maxLength={4}
                />
                <p className="text-xs text-gray-500 mt-1">
                  This code will be used to generate product SKUs (max 4 characters)
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                  rows={3}
                  placeholder="Optional description for this category"
                />
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={handleCloseCategoryModal}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createCategory.isPending}
                  className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50"
                >
                  {createCategory.isPending ? 'Creating...' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-screen overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Barcode (Optional)</label>
                  <input
                    type="text"
                    value={formData.barcode}
                    onChange={(e) => {
                      setFormData({ ...formData, barcode: e.target.value })
                      setBarcodeError('')
                    }}
                    onBlur={(e) => validateBarcode(e.target.value)}
                    className={`w-full p-2 border rounded-md focus:ring-2 ${
                      barcodeError 
                        ? 'border-red-300 focus:ring-red-500' 
                        : 'border-gray-300 focus:ring-blue-500'
                    }`}
                    placeholder="8-13 digit barcode (numbers only)"
                  />
                  {barcodeError && (
                    <p className="text-xs text-red-600 mt-1">{barcodeError}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Leave empty to use auto-generated SKU only
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                  <select
                    required
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name} ({category.code})
                      </option>
                    ))}
                  </select>
                  {categories.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">
                      Please add a category first before creating products
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cost Price (₨)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cost_price}
                    onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sale Price (₨) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.sale_price}
                    onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stock Quantity</label>
                  <input
                    type="number"
                    value={formData.stock_quantity}
                    onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Stock Level</label>
                  <input
                    type="number"
                    value={formData.min_stock_level}
                    onChange={(e) => setFormData({ ...formData, min_stock_level: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={formData.expiry_date}
                    onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Batch Number</label>
                  <input
                    type="text"
                    value={formData.batch_number}
                    onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <div className="flex items-center space-x-4 mt-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        checked={formData.is_active}
                        onChange={() => setFormData({ ...formData, is_active: true })}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">Active</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        checked={!formData.is_active}
                        onChange={() => setFormData({ ...formData, is_active: false })}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">Inactive</span>
                    </label>
                  </div>
                </div>
              </div>

              {!editingProduct && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <strong>Product Identification:</strong> A unique SKU will be automatically generated based on the selected category code and timestamp.
                    {formData.category_id && categories.find(c => c.id === formData.category_id) && (
                      <span className="block mt-1">
                        Example SKU: {categories.find(c => c.id === formData.category_id)?.code}-XXXX
                      </span>
                    )}
                    {formData.barcode && (
                      <span className="block mt-1">
                        Barcode: {formData.barcode} (for scanning)
                      </span>
                    )}
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
                  disabled={createProduct.isPending || updateProduct.isPending || categories.length === 0 || !!barcodeError}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  {(createProduct.isPending || updateProduct.isPending) ? 'Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-screen overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Import Inventory</h3>
            
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-2">Import Summary</h4>
                <p className="text-sm text-blue-700">
                  Found {importData.length} products in the CSV file.
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  Products will be created if they don't exist, or updated if they match by SKU or barcode.
                </p>
              </div>

              {/* Import Preview */}
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Preview (first 5 rows)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Name</th>
                        <th className="px-3 py-2 text-left">SKU</th>
                        <th className="px-3 py-2 text-left">Category</th>
                        <th className="px-3 py-2 text-left">Cost Price</th>
                        <th className="px-3 py-2 text-left">Sale Price</th>
                        <th className="px-3 py-2 text-left">Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importData.slice(0, 5).map((item, index) => (
                        <tr key={index} className="border-t">
                          <td className="px-3 py-2">{item.name}</td>
                          <td className="px-3 py-2">{item.sku || 'Auto-generated'}</td>
                          <td className="px-3 py-2">{item.category_name}</td>
                          <td className="px-3 py-2">{item.cost_price || '0'}</td>
                          <td className="px-3 py-2">{item.sale_price || '0'}</td>
                          <td className="px-3 py-2">{item.stock_quantity || '0'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importData.length > 5 && (
                  <p className="text-xs text-gray-500 mt-2">
                    ...and {importData.length - 5} more items
                  </p>
                )}
              </div>

              {/* Import Progress */}
              {importStatus.inProgress && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Processing: {importStatus.processed} of {importStatus.total}</span>
                    <span>{Math.round((importStatus.processed / importStatus.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full" 
                      style={{ width: `${(importStatus.processed / importStatus.total) * 100}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Created: {importStatus.created}</span>
                    <span>Updated: {importStatus.updated}</span>
                    <span>Failed: {importStatus.failed}</span>
                  </div>
                </div>
              )}

              {/* Import Errors */}
              {importErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-medium text-red-800 mb-2">Import Errors ({importErrors.length})</h4>
                  <div className="max-h-40 overflow-y-auto">
                    <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
                      {importErrors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Import Template Info */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">CSV Template Format</h4>
                <p className="text-sm text-gray-700 mb-2">
                  Your CSV file should include the following columns:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                  <li><strong>name</strong> (required): Product name</li>
                  <li><strong>category_name</strong> (required): Category name</li>
                  <li><strong>sale_price</strong> (required): Selling price</li>
                  <li><strong>sku</strong> (optional): Product SKU (auto-generated if empty)</li>
                  <li><strong>barcode</strong> (optional): Product barcode</li>
                  <li><strong>category_code</strong> (optional): Category code</li>
                  <li><strong>cost_price</strong> (optional): Cost price</li>
                  <li><strong>stock_quantity</strong> (optional): Current stock</li>
                  <li><strong>min_stock_level</strong> (optional): Minimum stock level</li>
                  <li><strong>expiry_date</strong> (optional): Expiry date (YYYY-MM-DD)</li>
                  <li><strong>batch_number</strong> (optional): Batch number</li>
                  <li><strong>is_active</strong> (optional): Product status (Yes/No)</li>
                </ul>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  disabled={importStatus.inProgress}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={processImport}
                  disabled={importStatus.inProgress || importData.length === 0}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center"
                >
                  {importStatus.inProgress ? (
                    <>
                      <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5 mr-2" />
                      Start Import
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Inventory