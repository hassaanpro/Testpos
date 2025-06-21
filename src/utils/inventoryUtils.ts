import Papa from 'papaparse';
import { Product } from '../lib/supabase';

/**
 * Prepare product data for CSV export
 * @param products Array of products to export
 * @param categories Array of categories for lookup
 * @returns Array of objects ready for CSV export
 */
export const prepareProductsForExport = (products: Product[], categories: any[]) => {
  return products.map(product => {
    const category = categories.find(c => c.id === product.category_id);
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
    };
  });
};

/**
 * Export products to CSV
 * @param products Array of products to export
 * @param categories Array of categories for lookup
 * @returns Blob URL for the CSV file
 */
export const exportProductsToCSV = (products: Product[], categories: any[]) => {
  const exportData = prepareProductsForExport(products, categories);
  const csv = Papa.unparse(exportData);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  return URL.createObjectURL(blob);
};

/**
 * Validate a single product from import data
 * @param product Product data from import
 * @returns Object with validation result and error message
 */
export const validateImportedProduct = (product: any) => {
  if (!product.name) {
    return { valid: false, error: 'Product name is required' };
  }
  
  if (!product.category_name && !product.category_code) {
    return { valid: false, error: 'Either category name or code is required' };
  }
  
  if (!product.sale_price) {
    return { valid: false, error: 'Sale price is required' };
  }
  
  // Validate numeric fields
  if (product.cost_price && isNaN(parseFloat(product.cost_price))) {
    return { valid: false, error: 'Cost price must be a number' };
  }
  
  if (isNaN(parseFloat(product.sale_price))) {
    return { valid: false, error: 'Sale price must be a number' };
  }
  
  if (product.stock_quantity && isNaN(parseInt(product.stock_quantity))) {
    return { valid: false, error: 'Stock quantity must be a number' };
  }
  
  if (product.min_stock_level && isNaN(parseInt(product.min_stock_level))) {
    return { valid: false, error: 'Minimum stock level must be a number' };
  }
  
  // Validate barcode if provided
  if (product.barcode) {
    if (!/^\d+$/.test(product.barcode)) {
      return { valid: false, error: 'Barcode must contain only numbers' };
    }
    
    if (product.barcode.length < 8 || product.barcode.length > 13) {
      return { valid: false, error: 'Barcode must be between 8 and 13 digits' };
    }
  }
  
  // Validate expiry date if provided
  if (product.expiry_date) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(product.expiry_date)) {
      return { valid: false, error: 'Expiry date must be in YYYY-MM-DD format' };
    }
  }
  
  return { valid: true, error: '' };
};

/**
 * Generate a sample CSV template for inventory import
 * @returns Blob URL for the template CSV file
 */
export const generateImportTemplate = () => {
  const sampleData = [
    {
      name: 'Sample Product 1',
      sku: '',
      barcode: '1234567890123',
      category_name: 'Electronics',
      category_code: 'ELEC',
      cost_price: '100',
      sale_price: '150',
      stock_quantity: '10',
      min_stock_level: '5',
      expiry_date: '2025-12-31',
      batch_number: 'BATCH001',
      is_active: 'Yes'
    },
    {
      name: 'Sample Product 2',
      sku: '',
      barcode: '',
      category_name: 'Food',
      category_code: 'FOOD',
      cost_price: '50',
      sale_price: '75',
      stock_quantity: '20',
      min_stock_level: '10',
      expiry_date: '',
      batch_number: '',
      is_active: 'Yes'
    }
  ];
  
  const csv = Papa.unparse(sampleData);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  return URL.createObjectURL(blob);
};