import React, { useState, useEffect } from 'react'
import { 
  AlertTriangle, 
  Calendar, 
  Clock, 
  Database, 
  FileText, 
  Search,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { format, parseISO, isToday, isYesterday } from 'date-fns'

interface RefundVisibilityIssue {
  receipt_number: string
  invoice_number: string
  transaction_date: string
  refund_amount: number
  visibility_status: string
  return_id: string
  sale_id: string
  customer_name?: string
  issue_type: string
}

interface DateFilterIssue {
  receipt_number: string
  actual_date: string
  displayed_date: string
  system_timezone: string
  database_timezone: string
  filter_applied: string
  appears_in_wrong_filter: boolean
}

interface SystemDateTimeInfo {
  browser_timezone: string
  browser_current_time: string
  database_timezone: string
  database_current_time: string
  supabase_timezone: string
  node_timezone: string
}

const ReceiptVisibilityReport: React.FC = () => {
  const [activeSection, setActiveSection] = useState('refund-visibility')
  const [systemInfo, setSystemInfo] = useState<SystemDateTimeInfo | null>(null)
  const [testDate, setTestDate] = useState(new Date().toISOString().split('T')[0])

  // Get system date/time information
  useEffect(() => {
    const getSystemInfo = async () => {
      const browserTime = new Date()
      
      // Get database timezone info
      const { data: dbTimeData } = await supabase.rpc('get_current_timestamp_info')
      
      setSystemInfo({
        browser_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        browser_current_time: browserTime.toISOString(),
        database_timezone: 'UTC', // Supabase uses UTC
        database_current_time: dbTimeData?.[0]?.current_timestamp || 'Unknown',
        supabase_timezone: 'UTC',
        node_timezone: 'Not Applicable in Browser'
      })
    }
    
    getSystemInfo()
  }, [])

  // Query for refund visibility issues
  const { data: refundIssues = [], isLoading: refundLoading } = useQuery({
    queryKey: ['refund-visibility-issues'],
    queryFn: async () => {
      // Get all refunds and check if original receipts are visible
      const { data: refunds, error: refundError } = await supabase
        .from('refund_transactions')
        .select(`
          *,
          return:returns(*),
          sale:sales(
            receipt_number,
            invoice_number,
            sale_date,
            customer:customers(name)
          )
        `)
        .order('transaction_date', { ascending: false })

      if (refundError) throw refundError

      const issues: RefundVisibilityIssue[] = []

      for (const refund of refunds) {
        if (!refund.sale) continue

        // Check if receipt is visible in receipt management
        const { data: receiptVisible } = await supabase
          .from('sales')
          .select('id, receipt_number')
          .eq('receipt_number', refund.sale.receipt_number)
          .single()

        if (!receiptVisible) {
          issues.push({
            receipt_number: refund.sale.receipt_number,
            invoice_number: refund.sale.invoice_number,
            transaction_date: refund.sale.sale_date,
            refund_amount: refund.amount,
            visibility_status: 'Not Visible',
            return_id: refund.return_id || '',
            sale_id: refund.sale_id || '',
            customer_name: refund.sale.customer?.name,
            issue_type: 'Receipt not found in system'
          })
        }

        // Check if receipt appears in receipt management searches
        const { data: searchResults } = await supabase
          .from('sales')
          .select('receipt_number')
          .ilike('receipt_number', `%${refund.sale.receipt_number}%`)

        if (!searchResults || searchResults.length === 0) {
          issues.push({
            receipt_number: refund.sale.receipt_number,
            invoice_number: refund.sale.invoice_number,
            transaction_date: refund.sale.sale_date,
            refund_amount: refund.amount,
            visibility_status: 'Not Searchable',
            return_id: refund.return_id || '',
            sale_id: refund.sale_id || '',
            customer_name: refund.sale.customer?.name,
            issue_type: 'Receipt not appearing in search results'
          })
        }
      }

      return issues
    }
  })

  // Query for date filter issues
  const { data: dateIssues = [], isLoading: dateLoading } = useQuery({
    queryKey: ['date-filter-issues', testDate],
    queryFn: async () => {
      const issues: DateFilterIssue[] = []
      
      // Get today's receipts
      const today = new Date()
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
      
      // Get yesterday's date range
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate())
      const yesterdayEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59)

      // Query receipts that should be today's
      const { data: todaysReceipts } = await supabase
        .from('sales')
        .select('receipt_number, sale_date, created_at')
        .gte('sale_date', todayStart.toISOString())
        .lte('sale_date', todayEnd.toISOString())

      // Query receipts that appear in yesterday's filter but are actually today's
      const { data: yesterdayFilterReceipts } = await supabase
        .from('sales')
        .select('receipt_number, sale_date, created_at')
        .gte('sale_date', yesterdayStart.toISOString())
        .lte('sale_date', yesterdayEnd.toISOString())

      // Check for mismatched receipts
      todaysReceipts?.forEach(receipt => {
        const receiptDate = parseISO(receipt.sale_date)
        const isActuallyToday = isToday(receiptDate)
        const isActuallyYesterday = isYesterday(receiptDate)
        
        if (isActuallyToday) {
          // Check if this receipt also appears in yesterday's filter
          const appearsInYesterday = yesterdayFilterReceipts?.some(
            yr => yr.receipt_number === receipt.receipt_number
          )
          
          if (appearsInYesterday) {
            issues.push({
              receipt_number: receipt.receipt_number,
              actual_date: receipt.sale_date,
              displayed_date: receipt.sale_date,
              system_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              database_timezone: 'UTC',
              filter_applied: 'Yesterday',
              appears_in_wrong_filter: true
            })
          }
        }
      })

      return issues
    }
  })

  // Query for timestamp accuracy
  const { data: timestampAnalysis } = useQuery({
    queryKey: ['timestamp-analysis'],
    queryFn: async () => {
      // Get recent receipts with detailed timestamp info
      const { data: receipts } = await supabase
        .from('sales')
        .select(`
          receipt_number,
          sale_date,
          created_at,
          receipt_printed_at
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      const analysis = receipts?.map(receipt => {
        const saleDate = parseISO(receipt.sale_date)
        const createdDate = parseISO(receipt.created_at)
        const timeDiff = Math.abs(saleDate.getTime() - createdDate.getTime()) / 1000 / 60 // minutes
        
        return {
          receipt_number: receipt.receipt_number,
          sale_date: receipt.sale_date,
          created_at: receipt.created_at,
          time_difference_minutes: timeDiff,
          has_timezone_issue: timeDiff > 60, // More than 1 hour difference
          browser_display: format(saleDate, 'yyyy-MM-dd HH:mm:ss'),
          utc_stored: receipt.sale_date
        }
      })

      return analysis || []
    }
  })

  const exportReport = () => {
    const reportData = {
      generated_at: new Date().toISOString(),
      system_info: systemInfo,
      refund_visibility_issues: refundIssues,
      date_filter_issues: dateIssues,
      timestamp_analysis: timestampAnalysis,
      summary: {
        total_refund_issues: refundIssues.length,
        total_date_issues: dateIssues.length,
        critical_issues: refundIssues.filter(issue => issue.issue_type.includes('not found')).length
      }
    }
    
    const dataStr = JSON.stringify(reportData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `receipt-visibility-report-${format(new Date(), 'yyyy-MM-dd-HH-mm')}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Receipt Visibility Investigation Report</h1>
          <p className="text-sm text-gray-600 mt-1">
            Comprehensive analysis of receipt visibility and date filtering issues
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={exportReport}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 flex items-center"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </button>
        </div>
      </div>

      {/* System Information Panel */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Database className="h-5 w-5 mr-2" />
          System Date/Time Configuration
        </h3>
        
        {systemInfo ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-800 mb-2">Browser Environment</h4>
              <div className="space-y-1 text-sm">
                <div><span className="text-blue-700">Timezone:</span> {systemInfo.browser_timezone}</div>
                <div><span className="text-blue-700">Current Time:</span> {format(parseISO(systemInfo.browser_current_time), 'yyyy-MM-dd HH:mm:ss')}</div>
              </div>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-800 mb-2">Database Environment</h4>
              <div className="space-y-1 text-sm">
                <div><span className="text-green-700">Timezone:</span> {systemInfo.database_timezone}</div>
                <div><span className="text-green-700">Current Time:</span> {systemInfo.database_current_time}</div>
              </div>
            </div>
            
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h4 className="font-medium text-purple-800 mb-2">Supabase Environment</h4>
              <div className="space-y-1 text-sm">
                <div><span className="text-purple-700">Timezone:</span> {systemInfo.supabase_timezone}</div>
                <div><span className="text-purple-700">Node TZ:</span> {systemInfo.node_timezone}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-blue-500 mr-2" />
            <span className="text-gray-600">Loading system information...</span>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'refund-visibility', label: 'Refund Receipt Visibility', icon: AlertTriangle },
              { id: 'date-filtering', label: 'Date Filter Issues', icon: Calendar },
              { id: 'timestamp-analysis', label: 'Timestamp Analysis', icon: Clock }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                  activeSection === tab.id
                    ? 'border-red-500 text-red-600'
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
          {/* Refund Visibility Issues */}
          {activeSection === 'refund-visibility' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Refund Receipt Visibility Issues
                </h3>
                <div className="flex items-center space-x-2">
                  {refundLoading && <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />}
                  <span className="text-sm text-gray-600">
                    {refundIssues.length} issues found
                  </span>
                </div>
              </div>

              {refundIssues.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-red-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-red-700 uppercase tracking-wider">Receipt Number</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-red-700 uppercase tracking-wider">Transaction Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-red-700 uppercase tracking-wider">Customer</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-red-700 uppercase tracking-wider">Refund Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-red-700 uppercase tracking-wider">Visibility Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-red-700 uppercase tracking-wider">Issue Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-red-700 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {refundIssues.map((issue, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm font-mono text-blue-600">{issue.receipt_number}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {format(parseISO(issue.transaction_date), 'MMM dd, yyyy HH:mm')}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {issue.customer_name || 'Walk-in Customer'}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            ₨{issue.refund_amount.toLocaleString()}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              issue.visibility_status === 'Not Visible' 
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {issue.visibility_status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">{issue.issue_type}</td>
                          <td className="px-6 py-4">
                            <button className="text-blue-600 hover:text-blue-900 text-sm">
                              Investigate
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Visibility Issues Found</h3>
                  <p className="text-gray-600">All refunded receipts are properly visible in the system.</p>
                </div>
              )}
            </div>
          )}

          {/* Date Filtering Issues */}
          {activeSection === 'date-filtering' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Date Filter Issues Investigation
                </h3>
                <div className="flex items-center space-x-2">
                  {dateLoading && <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />}
                  <span className="text-sm text-gray-600">
                    {dateIssues.length} issues found
                  </span>
                </div>
              </div>

              {/* Test Controls */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-3">Test Date Filtering</h4>
                <div className="flex items-center space-x-4">
                  <div>
                    <label className="block text-sm font-medium text-blue-700 mb-1">Test Date</label>
                    <input
                      type="date"
                      value={testDate}
                      onChange={(e) => setTestDate(e.target.value)}
                      className="px-3 py-2 border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="text-sm text-blue-700">
                    <div>Current Browser Time: {format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</div>
                    <div>Selected Test Date: {testDate}</div>
                  </div>
                </div>
              </div>

              {dateIssues.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-yellow-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-yellow-700 uppercase tracking-wider">Receipt Number</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-yellow-700 uppercase tracking-wider">Actual Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-yellow-700 uppercase tracking-wider">System Timezone</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-yellow-700 uppercase tracking-wider">Database Timezone</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-yellow-700 uppercase tracking-wider">Wrong Filter</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-yellow-700 uppercase tracking-wider">Issue</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {dateIssues.map((issue, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm font-mono text-blue-600">{issue.receipt_number}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {format(parseISO(issue.actual_date), 'MMM dd, yyyy HH:mm:ss')}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">{issue.system_timezone}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{issue.database_timezone}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{issue.filter_applied}</td>
                          <td className="px-6 py-4">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                              Timezone Mismatch
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Date Filter Issues Found</h3>
                  <p className="text-gray-600">All receipts are appearing in the correct date filters.</p>
                </div>
              )}

              {/* Reproduction Steps */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-800 mb-3">Steps to Reproduce Date Filter Issues</h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                  <li>Navigate to Sales & Receipt Management</li>
                  <li>Set date filter to "Today" ({format(new Date(), 'yyyy-MM-dd')})</li>
                  <li>Note which receipts appear</li>
                  <li>Change filter to "Yesterday" ({format(new Date(Date.now() - 24 * 60 * 60 * 1000), 'yyyy-MM-dd')})</li>
                  <li>Check if any of today's receipts incorrectly appear in yesterday's filter</li>
                  <li>Compare browser timezone with database timezone settings</li>
                </ol>
              </div>
            </div>
          )}

          {/* Timestamp Analysis */}
          {activeSection === 'timestamp-analysis' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Timestamp Accuracy Analysis
              </h3>

              {timestampAnalysis && timestampAnalysis.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-purple-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Receipt Number</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Sale Date (UTC)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Created At (UTC)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Browser Display</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Time Diff (min)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Timezone Issue</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {timestampAnalysis.slice(0, 20).map((analysis, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm font-mono text-blue-600">{analysis.receipt_number}</td>
                          <td className="px-6 py-4 text-sm text-gray-900 font-mono">{analysis.utc_stored}</td>
                          <td className="px-6 py-4 text-sm text-gray-900 font-mono">{analysis.created_at}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{analysis.browser_display}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {analysis.time_difference_minutes.toFixed(2)}
                          </td>
                          <td className="px-6 py-4">
                            {analysis.has_timezone_issue ? (
                              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Issue Detected
                              </span>
                            ) : (
                              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Normal
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <RefreshCw className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Timestamp Analysis</h3>
                  <p className="text-gray-600">Analyzing recent receipt timestamps...</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Summary and Recommendations */}
      <div className="mt-6 bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Info className="h-5 w-5 mr-2" />
          Summary & Recommendations
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-800 mb-3">Issues Found</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-red-50 rounded">
                <span className="text-red-700">Refund Visibility Issues:</span>
                <span className="font-semibold text-red-800">{refundIssues.length}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-yellow-50 rounded">
                <span className="text-yellow-700">Date Filter Issues:</span>
                <span className="font-semibold text-yellow-800">{dateIssues.length}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-purple-50 rounded">
                <span className="text-purple-700">Timestamp Issues:</span>
                <span className="font-semibold text-purple-800">
                  {timestampAnalysis?.filter(t => t.has_timezone_issue).length || 0}
                </span>
              </div>
            </div>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-800 mb-3">Recommended Actions</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                Standardize all timestamp handling to use UTC consistently
              </li>
              <li className="flex items-start">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                Implement timezone-aware date filtering in the frontend
              </li>
              <li className="flex items-start">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                Add database indexes for receipt search optimization
              </li>
              <li className="flex items-start">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                Create automated tests for date filtering edge cases
              </li>
              <li className="flex items-start">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                Implement receipt visibility monitoring alerts
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReceiptVisibilityReport