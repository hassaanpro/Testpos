import jsPDF from 'jspdf'
import { supabase } from '../lib/supabase'
import { BnplPaymentConfirmationData } from '../lib/supabase'
import { formatPakistanDateTime, formatCurrency } from './dateUtils'

export const generateBnplPaymentConfirmation = async (confirmationData: BnplPaymentConfirmationData) => {
  // Get store info
  const { data: storeInfo } = await supabase
    .from('store_info')
    .select('*')
    .single()

  // Generate confirmation number
  const { data: confirmationNumber, error: confirmationError } = await supabase.rpc('generate_bnpl_payment_number')
  if (confirmationError) throw confirmationError

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

  // Payment confirmation header
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('BNPL PAYMENT CONFIRMATION', 40, y, { align: 'center' })
  y += 8

  // Confirmation details
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Confirmation: ${confirmationNumber}`, 5, y)
  y += 5
  
  doc.setFont('helvetica', 'normal')
  const paymentDate = new Date(confirmationData.payment_date)
  doc.text(`Date: ${formatPakistanDateTime(paymentDate, 'dd-MM-yyyy')}`, 5, y)
  doc.text(`Time: ${formatPakistanDateTime(paymentDate, 'HH:mm:ss')}`, 45, y)
  y += 5

  // Customer details
  doc.text(`Customer: ${confirmationData.customer.name}`, 5, y)
  y += 4
  if (confirmationData.customer.phone) {
    doc.text(`Phone: ${confirmationData.customer.phone}`, 5, y)
    y += 4
  }
  y += 3

  // Original transaction reference
  doc.setFont('helvetica', 'bold')
  doc.text('Original Transaction:', 5, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.text(`Invoice: ${confirmationData.original_sale_invoice}`, 5, y)
  y += 4
  doc.text(`Receipt: ${confirmationData.original_sale_receipt}`, 5, y)
  y += 6

  // Payment details
  doc.setFont('helvetica', 'bold')
  doc.text('Payment Details:', 5, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  
  doc.text(`Payment Amount:`, 5, y)
  doc.text(formatCurrency(confirmationData.payment_amount).replace('₨ ', ''), 60, y)
  y += 4
  
  doc.text(`Payment Method:`, 5, y)
  doc.text(confirmationData.payment_method.toUpperCase(), 60, y)
  y += 4
  
  doc.text(`Remaining Balance:`, 5, y)
  doc.text(formatCurrency(confirmationData.remaining_amount).replace('₨ ', ''), 60, y)
  y += 4
  
  doc.text(`Transaction Status:`, 5, y)
  doc.text(confirmationData.transaction_status.toUpperCase(), 60, y)
  y += 6

  // Status indicator
  if (confirmationData.remaining_amount <= 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('✓ FULLY PAID', 40, y, { align: 'center' })
    y += 6
  } else {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('PARTIAL PAYMENT RECEIVED', 40, y, { align: 'center' })
    y += 6
  }

  // Terms and Conditions for BNPL
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('BNPL Terms & Conditions:', 5, y)
  y += 3
  doc.setFont('helvetica', 'normal')
  doc.text('• Payment confirmation is valid proof of payment', 5, y)
  y += 3
  doc.text('• Keep this confirmation for your records', 5, y)
  y += 3
  
  if (confirmationData.remaining_amount > 0) {
    doc.text('• Remaining balance must be paid as agreed', 5, y)
    y += 3
    doc.text('• Late payment charges may apply', 5, y)
    y += 3
  }
  
  doc.text('• Contact us for any payment queries', 5, y)
  y += 6

  // Footer
  doc.setFontSize(8)
  if (storeInfo?.receipt_footer) {
    doc.text(storeInfo.receipt_footer, 40, y, { align: 'center' })
    y += 4
  }

  // Digital signature/authentication code
  const authCode = `BNPL-${confirmationNumber.split('-').pop()}-${Date.now().toString().slice(-4)}`
  doc.text(`Auth Code: ${authCode}`, 40, y, { align: 'center' })
  y += 4

  // FBR Integration
  if (storeInfo?.fbr_enabled && storeInfo?.pos_id) {
    y += 2
    doc.text(`POS ID: ${storeInfo.pos_id}`, 40, y, { align: 'center' })
    y += 4
    doc.text('FBR Compliant Payment Confirmation', 40, y, { align: 'center' })
  }

  // Open in new window for printing
  const pdfBlob = doc.output('blob')
  const pdfUrl = URL.createObjectURL(pdfBlob)
  window.open(pdfUrl, '_blank')
  
  // Also trigger browser print dialog
  setTimeout(() => {
    window.print()
  }, 2000) // Increased from 500ms to 2000ms to give more time for the PDF to load

  return {
    confirmationNumber,
    authCode
  }
}