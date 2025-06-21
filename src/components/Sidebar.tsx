import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Users, 
  Receipt, 
  TrendingUp,
  Settings,
  DollarSign,
  Truck,
  BarChart3,
  CreditCard,
  FileText,
  RotateCcw,
  AlertTriangle,
  LineChart
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'POS', href: '/pos', icon: ShoppingCart },
  { name: 'Sales Dashboard', href: '/sales-analytics', icon: LineChart },
  { name: 'Inventory', href: '/inventory', icon: Package },
  { name: 'Purchase Orders', href: '/purchase-orders', icon: Truck },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Sales', href: '/sales', icon: Receipt },
  { name: 'BNPL Receipts', href: '/bnpl-receipts', icon: CreditCard },
  { name: 'Customer Payments', href: '/customer-payments', icon: CreditCard },
  { name: 'Receipt Management', href: '/receipt-management', icon: FileText },
  { name: 'Returns & Refunds', href: '/returns', icon: RotateCcw },
  { name: 'Receipt Issues Report', href: '/receipt-issues', icon: AlertTriangle },
  { name: 'Financial', href: '/financial', icon: DollarSign },
  { name: 'Reports', href: '/reports', icon: TrendingUp },
  { name: 'Settings', href: '/settings', icon: Settings },
]

const Sidebar: React.FC = () => {
  const location = useLocation()

  return (
    <div className="w-64 bg-white shadow-lg">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">POS System</h1>
        <p className="text-sm text-gray-500">Pakistani Retail</p>
      </div>
      
      <nav className="mt-6 overflow-y-auto max-h-[calc(100vh-100px)]">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href
          return (
            <Link
              key={item.name}
              to={item.href}
              className={`flex items-center px-6 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-blue-600 bg-blue-50 border-r-2 border-blue-600'
                  : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              <item.icon className="mr-3 h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export default Sidebar