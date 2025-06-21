import jsPDF from 'jspdf'
import { supabase } from '../lib/supabase'
import { ReceiptData } from '../lib/supabase'
import { formatPakistanDateTime, formatCurrency } from './dateUtils'

interface DuplicateReceiptData extends ReceiptData {
  reprint_auth_code: string
  reprint_date: string
  reprinted_by: string
  reprint_reason: string
  reprint_count: number
}

export const generateDuplicateReceipt = async (
  originalReceiptData: ReceiptData,
  reprintInfo: {
    auth_code: string
    reprinted_by: string
    reason: string
    reprint_count: number
  }
) => {
  // Get store info
  const { data: storeInfo } = await supabase
    .from('store_info')
    .select('*')
    .single()

  // Create a new jsPDF instance with thermal receipt dimensions (80mm width)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 200] // Standard thermal receipt width (80mm)
  })

  let y = 10

  // Store header
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(storeInfo?.store_name || 'My Store', 40, y, { align: 'center' })
  y += 6

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  if (storeInfo?.address) {
    doc.text(storeInfo.address, 40, y, { align: 'center' })
    y += 4
  }
  if (storeInfo?.phone) {
    doc.text(`Phone: ${storeInfo.phone}`, 40, y, { align: 'center' })
    y += 4
  }
  if (storeInfo?.ntn) {
    doc.text(`NTN: ${storeInfo.ntn}`, 40, y, { align: 'center' })
    y += 4
  }
  y += 4

  // DUPLICATE RECEIPT HEADER - Make it prominent
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('*** DUPLICATE RECEIPT ***', 40, y, { align: 'center' })
  y += 6

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('This is a reprint of the original receipt', 40, y, { align: 'center' })
  y += 6

  // Original receipt details
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Original Receipt: ${originalReceiptData.receipt_number}`, 5, y)
  y += 5
  
  doc.setFont('helvetica', 'normal')
  doc.text(`Original Invoice: ${originalReceiptData.invoice_number}`, 5, y)
  y += 5
  
  const originalDate = new Date(originalReceiptData.sale_date)
  doc.text(`Original Date: ${formatPakistanDateTime(originalDate, 'dd-MM-yyyy')}`, 5, y)
  doc.text(`Original Time: ${formatPakistanDateTime(originalDate, 'HH:mm:ss')}`, 45, y)
  y += 5

  // Reprint information
  doc.setFont('helvetica', 'bold')
  doc.text('REPRINT INFORMATION:', 5, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  
  const now = new Date()
  doc.text(`Reprint Date: ${formatPakistanDateTime(now, 'dd-MM-yyyy')}`, 5, y)
  doc.text(`Reprint Time: ${formatPakistanDateTime(now, 'HH:mm:ss')}`, 45, y)
  y += 4
  doc.text(`Reprinted By: ${reprintInfo.reprinted_by}`, 5, y)
  y += 4
  doc.text(`Reason: ${reprintInfo.reason}`, 5, y)
  y += 4
  doc.text(`Reprint #: ${reprintInfo.reprint_count}`, 5, y)
  y += 6

  // Customer information (if applicable)
  if (originalReceiptData.customer) {
    doc.text(`Customer: ${originalReceiptData.customer.name}`, 5, y)
    y += 4
    if (originalReceiptData.customer.phone) {
      doc.text(`Phone: ${originalReceiptData.customer.phone}`, 5, y)
      y += 4
    }
  }
  y += 3

  // Items header
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Item', 5, y)
  doc.text('Qty', 45, y)
  doc.text('Price', 55, y)
  doc.text('Total', 70, y)
  y += 3

  // Draw line
  doc.line(5, y, 75, y)
  y += 3

  // Items
  doc.setFont('helvetica', 'normal')
  originalReceiptData.items.forEach(item => {
    const itemName = item.name.length > 20 ? item.name.substring(0, 17) + '...' : item.name
    doc.text(itemName, 5, y)
    doc.text(item.quantity.toString(), 45, y)
    doc.text(formatCurrency(item.unit_price).replace('₨ ', ''), 55, y)
    doc.text(formatCurrency(item.total_price).replace('₨ ', ''), 70, y)
    y += 4
  })

  // Draw line
  y += 2
  doc.line(5, y, 75, y)
  y += 4

  // Totals
  doc.text(`Subtotal:`, 45, y)
  doc.text(formatCurrency(originalReceiptData.subtotal).replace('₨ ', ''), 70, y)
  y += 4

  if (originalReceiptData.discount_amount > 0) {
    doc.text(`Discount:`, 45, y)
    doc.text(`-${formatCurrency(originalReceiptData.discount_amount).replace('₨ ', '')}`, 70, y)
    y += 4
  }

  doc.text(`Tax:`, 45, y)
  doc.text(formatCurrency(originalReceiptData.tax_amount).replace('₨ ', ''), 70, y)
  y += 4

  // Draw line
  doc.line(45, y, 75, y)
  y += 2

  doc.setFont('helvetica', 'bold')
  doc.text(`Total:`, 45, y)
  doc.text(formatCurrency(originalReceiptData.total_amount).replace('₨ ', ''), 70, y)
  y += 6

  // Payment method and status
  doc.setFont('helvetica', 'normal')
  doc.text(`Payment: ${originalReceiptData.payment_method.toUpperCase()}`, 5, y)
  y += 4
  
  if (originalReceiptData.payment_status === 'pending_bnpl') {
    doc.setFont('helvetica', 'bold')
    doc.text(`Status: BUY NOW PAY LATER`, 5, y)
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.text(`Payment due in 30 days`, 5, y)
    y += 4
  } else {
    doc.text(`Status: ${originalReceiptData.payment_status.toUpperCase()}`, 5, y)
    y += 4
  }
  y += 4

  // Duplicate receipt warning
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('*** DUPLICATE RECEIPT ***', 40, y, { align: 'center' })
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.text('This is not valid for returns or exchanges', 40, y, { align: 'center' })
  y += 4
  doc.text('Original receipt required for all transactions', 40, y, { align: 'center' })
  y += 6

  // Authentication and audit information
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('Authentication & Audit:', 5, y)
  y += 3
  doc.setFont('helvetica', 'normal')
  doc.text(`Auth Code: ${reprintInfo.auth_code}`, 5, y)
  y += 3
  doc.text(`Reprint ID: ${reprintInfo.auth_code.split('-').slice(-2).join('-')}`, 5, y)
  y += 3
  doc.text(`Verification: Call ${storeInfo?.phone || 'store'} with auth code`, 5, y)
  y += 6

  // Footer
  doc.setFontSize(8)
  if (storeInfo?.receipt_footer) {
    doc.text(storeInfo.receipt_footer, 40, y, { align: 'center' })
    y += 4
  }

  // FBR Integration
  if (storeInfo?.fbr_enabled && storeInfo?.pos_id) {
    y += 2
    doc.text(`POS ID: ${storeInfo.pos_id}`, 40, y, { align: 'center' })
    y += 4
    doc.text('FBR Compliant Duplicate Receipt', 40, y, { align: 'center' })
  }

  // Final duplicate warning
  doc.setFontSize(6)
  doc.text('This duplicate receipt is for reference only', 40, y + 4, { align: 'center' })

  // Open in new window for printing
  const pdfBlob = doc.output('blob')
  const pdfUrl = URL.createObjectURL(pdfBlob)
  window.open(pdfUrl, '_blank')
  
  // Also trigger browser print dialog
  setTimeout(() => {
    window.print()
  }, 500)

  return reprintInfo.auth_code
}