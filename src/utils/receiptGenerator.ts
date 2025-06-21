import jsPDF from 'jspdf'
import { supabase } from '../lib/supabase'
import { ReceiptData } from '../lib/supabase'
import { formatPakistanDateTime, formatCurrency } from './dateUtils'

export const generateReceipt = async (saleData: ReceiptData) => {
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

  // Receipt details
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Receipt: ${saleData.receipt_number}`, 5, y)
  y += 5
  
  doc.setFont('helvetica', 'normal')
  doc.text(`Invoice: ${saleData.invoice_number}`, 5, y)
  y += 5
  
  const saleDate = new Date(saleData.sale_date)
  doc.text(`Date: ${formatPakistanDateTime(saleDate, 'dd-MM-yyyy')}`, 5, y)
  doc.text(`Time: ${formatPakistanDateTime(saleDate, 'HH:mm:ss')}`, 55, y)
  y += 5

  if (saleData.customer) {
    doc.text(`Customer: ${saleData.customer.name}`, 5, y)
    y += 4
    if (saleData.customer.phone) {
      doc.text(`Phone: ${saleData.customer.phone}`, 5, y)
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
  saleData.items.forEach(item => {
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
  doc.text(formatCurrency(saleData.subtotal).replace('₨ ', ''), 70, y)
  y += 4

  if (saleData.discount_amount > 0) {
    doc.text(`Discount:`, 45, y)
    doc.text(`-${formatCurrency(saleData.discount_amount).replace('₨ ', '')}`, 70, y)
    y += 4
  }

  doc.text(`Tax:`, 45, y)
  doc.text(formatCurrency(saleData.tax_amount).replace('₨ ', ''), 70, y)
  y += 4

  // Draw line
  doc.line(45, y, 75, y)
  y += 2

  doc.setFont('helvetica', 'bold')
  doc.text(`Total:`, 45, y)
  doc.text(formatCurrency(saleData.total_amount).replace('₨ ', ''), 70, y)
  y += 6

  // Payment method and status
  doc.setFont('helvetica', 'normal')
  doc.text(`Payment: ${saleData.payment_method.toUpperCase()}`, 5, y)
  y += 4
  
  if (saleData.payment_status === 'pending_bnpl') {
    doc.setFont('helvetica', 'bold')
    doc.text(`Status: BUY NOW PAY LATER`, 5, y)
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.text(`Payment due in 30 days`, 5, y)
    y += 4
  } else {
    doc.text(`Status: ${saleData.payment_status.toUpperCase()}`, 5, y)
    y += 4
  }
  y += 4

  // Terms and Conditions
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('Terms & Conditions:', 5, y)
  y += 3
  doc.setFont('helvetica', 'normal')
  doc.text('• Exchange policy: 7 days with receipt', 5, y)
  y += 3
  doc.text('• No refund on sale items', 5, y)
  y += 3
  
  if (saleData.payment_status === 'pending_bnpl') {
    doc.text('• BNPL: Payment due within 30 days', 5, y)
    y += 3
    doc.text('• Late payment charges may apply', 5, y)
    y += 3
  }
  y += 3

  // Footer
  doc.setFontSize(8)
  if (storeInfo?.receipt_footer) {
    doc.text(storeInfo.receipt_footer, 40, y, { align: 'center' })
    y += 4
  }

  // Digital signature/authentication code
  const authCode = `AUTH-${saleData.receipt_number.split('-').pop()}-${Date.now().toString().slice(-4)}`
  doc.text(`Auth Code: ${authCode}`, 40, y, { align: 'center' })
  y += 4

  // FBR Integration
  if (storeInfo?.fbr_enabled && storeInfo?.pos_id) {
    y += 2
    doc.text(`POS ID: ${storeInfo.pos_id}`, 40, y, { align: 'center' })
    y += 4
    doc.text('FBR Compliant Invoice', 40, y, { align: 'center' })
  }

  // Open in new window for printing
  const pdfBlob = doc.output('blob')
  const pdfUrl = URL.createObjectURL(pdfBlob)
  window.open(pdfUrl, '_blank')
  
  // Also trigger browser print dialog
  setTimeout(() => {
    window.print()
  }, 500)

  // Mark receipt as printed
  await supabase.rpc('mark_receipt_printed', {
    p_sale_id: saleData.id
  })

  return authCode
}