import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import POS from './components/POS'
import SalesAnalytics from './components/SalesAnalytics'
import Inventory from './components/Inventory'
import Customers from './components/Customers'
import Sales from './components/Sales'
import Financial from './components/Financial'
import Reports from './components/Reports'
import Settings from './components/Settings'
import PurchaseOrders from './components/PurchaseOrders'
import CustomerPayments from './components/CustomerPayments'
import ReceiptManagement from './components/ReceiptManagement'
import Returns from './components/Returns'
import ReceiptVisibilityReport from './components/ReceiptVisibilityReport'
import BNPLReceipts from './components/BNPLReceipts'
import { getPakistanDayRange } from './utils/dateUtils'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  useEffect(() => {
    // Function to calculate milliseconds until next midnight in Pakistan timezone
    const getMillisecondsUntilMidnight = () => {
      const { endOfDay } = getPakistanDayRange(new Date())
      return endOfDay.getTime() - new Date().getTime()
    }

    // Function to set up midnight reset timer
    const setupMidnightReset = () => {
      const msUntilMidnight = getMillisecondsUntilMidnight()
      
      const timeoutId = setTimeout(() => {
        // Invalidate daily sales queries at midnight to force fresh data fetch
        queryClient.invalidateQueries({ queryKey: ['daily-sales'] })
        
        // Also invalidate dashboard queries that might depend on daily sales
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
        
        // Invalidate sales analytics queries for fresh daily data
        queryClient.invalidateQueries({ queryKey: ['sales-trend'] })
        queryClient.invalidateQueries({ queryKey: ['average-order-value'] })
        queryClient.invalidateQueries({ queryKey: ['sales-comparison'] })
        queryClient.invalidateQueries({ queryKey: ['hourly-sales-trend'] })
        queryClient.invalidateQueries({ queryKey: ['sales-summary-metrics'] })
        queryClient.invalidateQueries({ queryKey: ['peak-hours-analysis'] })
        
        // Invalidate sales dashboard queries
        queryClient.invalidateQueries({ queryKey: ['sales-dashboard-summary'] })
        queryClient.invalidateQueries({ queryKey: ['sales-dashboard-trend'] })
        queryClient.invalidateQueries({ queryKey: ['sales-dashboard-payments'] })
        queryClient.invalidateQueries({ queryKey: ['sales-dashboard-products'] })
        
        // Invalidate BNPL queries
        queryClient.invalidateQueries({ queryKey: ['bnpl-sales'] })
        queryClient.invalidateQueries({ queryKey: ['bnpl-sales-summary'] })
        
        console.log('Daily sales counter reset at midnight (Pakistan time)')
        
        // Set up the next midnight reset (recursive call for continuous operation)
        setupMidnightReset()
      }, msUntilMidnight)

      // Return cleanup function
      return () => clearTimeout(timeoutId)
    }

    // Initialize the midnight reset system
    const cleanup = setupMidnightReset()

    // Cleanup on component unmount
    return cleanup
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="pos" element={<POS />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="purchase-orders" element={<PurchaseOrders />} />
            <Route path="customers" element={<Customers />} />
            <Route path="sales" element={<Sales />} />
            <Route path="sales-analytics" element={<SalesAnalytics />} />
            <Route path="customer-payments" element={<CustomerPayments />} />
            <Route path="receipt-management" element={<ReceiptManagement />} />
            <Route path="bnpl-receipts" element={<BNPLReceipts />} />
            <Route path="returns" element={<Returns />} />
            <Route path="receipt-issues" element={<ReceiptVisibilityReport />} />
            <Route path="financial" element={<Financial />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </Router>
    </QueryClientProvider>
  )
}

export default App