import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import jsPDF from 'jspdf'

interface ExportFilters {
  dateFrom?: string
  dateTo?: string
  searchTerm?: string
  minAmount?: number
  maxAmount?: number
  paymentMethod?: string
  paymentStatus?: string
  customerFilter?: string
  exportType: 'summary' | 'detailed'
}

export const useSalesExport = () => {
  return useMutation({
    mutationFn: async ({ format, ...filters }: ExportFilters & { format: 'csv' | 'json' | 'pdf' }) => {
      // Get sales data with filters
      let query = supabase
        .from('sales')
        .select(`
          receipt_number,
          invoice_number,
          sale_date,
          total_amount,
          subtotal,
          discount_amount,
          tax_amount,
          payment_method,
          payment_status,
          cashier_name,
          receipt_printed,
          customer:customers(name, phone, email),
          sale_items:sale_items(
            quantity,
            unit_price,
            discount_amount,
            total_price,
            product:products(name, sku)
          )
        `)
        .order('sale_date', { ascending: false })
      
      if (filters.dateFrom) query = query.gte('sale_date', filters.dateFrom)
      if (filters.dateTo) query = query.lte('sale_date', filters.dateTo)
      if (filters.paymentMethod) query = query.eq('payment_method', filters.paymentMethod)
      if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus)
      if (filters.minAmount) query = query.gte('total_amount', filters.minAmount)
      if (filters.maxAmount) query = query.lte('total_amount', filters.maxAmount)
      
      const { data, error } = await query
      
      if (error) throw error
      
      // Apply client-side filtering
      let filteredData = data || []
      
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase()
        filteredData = filteredData.filter(receipt => 
          receipt.receipt_number.toLowerCase().includes(searchLower) ||
          receipt.invoice_number.toLowerCase().includes(searchLower) ||
          receipt.customer?.name?.toLowerCase().includes(searchLower) ||
          receipt.customer?.phone?.toLowerCase().includes(searchLower)
        )
      }
      
      if (filters.customerFilter) {
        const customerLower = filters.customerFilter.toLowerCase()
        filteredData = filteredData.filter(receipt => 
          receipt.customer?.name?.toLowerCase().includes(customerLower) ||
          receipt.customer?.phone?.toLowerCase().includes(customerLower) ||
          receipt.customer?.email?.toLowerCase().includes(customerLower)
        )
      }
      
      // Calculate summary data
      const summaryData = {
        totalSales: filteredData.reduce((sum, sale) => sum + sale.total_amount, 0),
        totalTransactions: filteredData.length,
        avgTransaction: filteredData.length > 0 ? 
          filteredData.reduce((sum, sale) => sum + sale.total_amount, 0) / filteredData.length : 0,
        paymentMethods: {
          cash: filteredData.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + s.total_amount, 0),
          card: filteredData.filter(s => s.payment_method === 'card').reduce((sum, s) => sum + s.total_amount, 0),
          bnpl: filteredData.filter(s => s.payment_method === 'bnpl').reduce((sum, s) => sum + s.total_amount, 0)
        },
        paymentStatus: {
          paid: filteredData.filter(s => s.payment_status === 'paid').length,
          pending_bnpl: filteredData.filter(s => s.payment_status === 'pending_bnpl').length,
          partially_paid: filteredData.filter(s => s.payment_status === 'partially_paid').length,
          refunded: filteredData.filter(s => s.payment_status === 'refunded').length
        },
        dateRange: {
          from: filters.dateFrom,
          to: filters.dateTo
        },
        exportedAt: new Date().toISOString()
      }
      
      // Generate export based on format
      if (format === 'csv') {
        let csvContent = ''
        
        if (filters.exportType === 'summary') {
          // Summary CSV
          csvContent = `"Sales Summary (${filters.dateFrom} to ${filters.dateTo})"\n` +
            `"Total Sales","₨${summaryData.totalSales.toLocaleString()}"\n` +
            `"Total Transactions","${summaryData.totalTransactions}"\n` +
            `"Average Transaction","₨${summaryData.avgTransaction.toLocaleString()}"\n\n` +
            `"Payment Methods"\n` +
            `"Cash","₨${summaryData.paymentMethods.cash.toLocaleString()}"\n` +
            `"Card","₨${summaryData.paymentMethods.card.toLocaleString()}"\n` +
            `"BNPL","₨${summaryData.paymentMethods.bnpl.toLocaleString()}"\n\n` +
            `"Payment Status"\n` +
            `"Paid","${summaryData.paymentStatus.paid}"\n` +
            `"Pending BNPL","${summaryData.paymentStatus.pending_bnpl}"\n` +
            `"Partially Paid","${summaryData.paymentStatus.partially_paid}"\n` +
            `"Refunded","${summaryData.paymentStatus.refunded}"\n`
        } else {
          // Detailed CSV
          const headers = [
            'Receipt Number', 'Invoice Number', 'Date', 'Time', 'Customer Name', 
            'Customer Phone', 'Items Count', 'Total Amount', 'Payment Method', 
            'Payment Status', 'Cashier', 'Printed'
          ]
          
          const csvData = filteredData.map(receipt => [
            receipt.receipt_number,
            receipt.invoice_number,
            new Date(receipt.sale_date).toLocaleDateString('en-PK'),
            new Date(receipt.sale_date).toLocaleTimeString('en-PK'),
            receipt.customer?.name || 'Walk-in Customer',
            receipt.customer?.phone || '',
            receipt.sale_items?.length || 0,
            receipt.total_amount,
            receipt.payment_method.toUpperCase(),
            receipt.payment_status.toUpperCase(),
            receipt.cashier_name || '',
            receipt.receipt_printed ? 'Yes' : 'No'
          ])
          
          csvContent = [headers, ...csvData]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n')
        }
        
        const blob = new Blob([csvContent], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `sales-export-${filters.dateFrom}-to-${filters.dateTo}-${filters.exportType}.csv`
        a.click()
        URL.revokeObjectURL(url)
      } else if (format === 'json') {
        // JSON export
        const jsonData = filters.exportType === 'summary' ? 
          summaryData : 
          {
            summary: summaryData,
            transactions: filteredData
          }
        
        const jsonContent = JSON.stringify(jsonData, null, 2)
        const blob = new Blob([jsonContent], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `sales-export-${filters.dateFrom}-to-${filters.dateTo}-${filters.exportType}.json`
        a.click()
        URL.revokeObjectURL(url)
      } else if (format === 'pdf') {
        // PDF export using jsPDF without autotable
        const doc = new jsPDF()
        
        // Add title
        doc.setFontSize(18)
        doc.text(`Sales Report (${filters.dateFrom} to ${filters.dateTo})`, 14, 22)
        
        doc.setFontSize(12)
        doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`, 14, 30)
        
        if (filters.exportType === 'summary') {
          // Summary PDF
          doc.setFontSize(14)
          doc.text('Summary Statistics', 14, 45)
          
          let y = 55
          
          // Draw summary table manually
          doc.setFontSize(10)
          doc.text('Metric', 20, y)
          doc.text('Value', 100, y)
          y += 5
          
          // Draw line
          doc.setLineWidth(0.1)
          doc.line(20, y, 180, y)
          y += 10
          
          // Total Sales
          doc.text('Total Sales', 20, y)
          doc.text(`₨${summaryData.totalSales.toLocaleString()}`, 100, y)
          y += 10
          
          // Total Transactions
          doc.text('Total Transactions', 20, y)
          doc.text(summaryData.totalTransactions.toString(), 100, y)
          y += 10
          
          // Average Transaction
          doc.text('Average Transaction', 20, y)
          doc.text(`₨${summaryData.avgTransaction.toLocaleString()}`, 100, y)
          y += 20
          
          // Payment Methods
          doc.setFontSize(14)
          doc.text('Payment Methods', 14, y)
          y += 10
          
          doc.setFontSize(10)
          doc.text('Method', 20, y)
          doc.text('Amount', 100, y)
          y += 5
          
          // Draw line
          doc.line(20, y, 180, y)
          y += 10
          
          // Cash
          doc.text('Cash', 20, y)
          doc.text(`₨${summaryData.paymentMethods.cash.toLocaleString()}`, 100, y)
          y += 10
          
          // Card
          doc.text('Card', 20, y)
          doc.text(`₨${summaryData.paymentMethods.card.toLocaleString()}`, 100, y)
          y += 10
          
          // BNPL
          doc.text('BNPL', 20, y)
          doc.text(`₨${summaryData.paymentMethods.bnpl.toLocaleString()}`, 100, y)
          y += 20
          
          // Payment Status
          doc.setFontSize(14)
          doc.text('Payment Status', 14, y)
          y += 10
          
          doc.setFontSize(10)
          doc.text('Status', 20, y)
          doc.text('Count', 100, y)
          y += 5
          
          // Draw line
          doc.line(20, y, 180, y)
          y += 10
          
          // Paid
          doc.text('Paid', 20, y)
          doc.text(summaryData.paymentStatus.paid.toString(), 100, y)
          y += 10
          
          // Pending BNPL
          doc.text('Pending BNPL', 20, y)
          doc.text(summaryData.paymentStatus.pending_bnpl.toString(), 100, y)
          y += 10
          
          // Partially Paid
          doc.text('Partially Paid', 20, y)
          doc.text(summaryData.paymentStatus.partially_paid.toString(), 100, y)
          y += 10
          
          // Refunded
          doc.text('Refunded', 20, y)
          doc.text(summaryData.paymentStatus.refunded.toString(), 100, y)
        } else {
          // Detailed PDF - create a simple table manually
          let y = 40
          const pageHeight = doc.internal.pageSize.height
          const rowHeight = 10
          
          // Table headers
          doc.setFontSize(10)
          doc.setFont('helvetica', 'bold')
          doc.text('Receipt #', 14, y)
          doc.text('Date & Time', 50, y)
          doc.text('Customer', 90, y)
          doc.text('Amount', 140, y)
          doc.text('Payment', 170, y)
          y += 5
          
          // Draw line
          doc.setLineWidth(0.1)
          doc.line(14, y, 195, y)
          y += 5
          
          // Reset font
          doc.setFont('helvetica', 'normal')
          
          // Table rows
          for (const sale of filteredData.slice(0, 100)) { // Limit to 100 records for PDF
            // Check if we need a new page
            if (y > pageHeight - 20) {
              doc.addPage()
              y = 20
              
              // Add headers to new page
              doc.setFont('helvetica', 'bold')
              doc.text('Receipt #', 14, y)
              doc.text('Date & Time', 50, y)
              doc.text('Customer', 90, y)
              doc.text('Amount', 140, y)
              doc.text('Payment', 170, y)
              y += 5
              
              // Draw line
              doc.line(14, y, 195, y)
              y += 5
              
              // Reset font
              doc.setFont('helvetica', 'normal')
            }
            
            // Add row data
            doc.text(sale.receipt_number, 14, y)
            doc.text(format(new Date(sale.sale_date), 'MMM dd, yyyy HH:mm'), 50, y)
            doc.text(sale.customer?.name || 'Walk-in Customer', 90, y)
            doc.text(`₨${sale.total_amount.toLocaleString()}`, 140, y)
            doc.text(sale.payment_method.toUpperCase(), 170, y)
            
            y += rowHeight
          }
          
          // Add note if data was limited
          if (filteredData.length > 100) {
            doc.setFont('helvetica', 'italic')
            doc.text(`Note: Only showing 100 of ${filteredData.length} records in PDF format.`, 14, y + 10)
          }
        }
        
        // Save the PDF
        doc.save(`sales-report-${filters.dateFrom}-to-${filters.dateTo}-${filters.exportType}.pdf`)
      }
      
      return filteredData.length
    },
    onSuccess: (count) => {
      toast.success(`Exported ${count} records successfully`)
    },
    onError: (error) => {
      toast.error('Failed to export data: ' + error.message)
    }
  })
}