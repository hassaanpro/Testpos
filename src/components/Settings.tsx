import React, { useState } from 'react'
import { Save, Store, Receipt, Percent, Bell, Printer } from 'lucide-react'
import { useSettings, useUpdateSetting } from '../hooks/useSettings'
import { useStoreInfo, useUpdateStoreInfo } from '../hooks/useStoreInfo'
import toast from 'react-hot-toast'

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState('store')
  const { data: settings = [], isLoading: settingsLoading } = useSettings()
  const { data: storeInfo, isLoading: storeInfoLoading } = useStoreInfo()
  const updateSetting = useUpdateSetting()
  const updateStoreInfo = useUpdateStoreInfo()

  const [storeForm, setStoreForm] = useState({
    store_name: storeInfo?.store_name || '',
    address: storeInfo?.address || '',
    phone: storeInfo?.phone || '',
    email: storeInfo?.email || '',
    ntn: storeInfo?.ntn || '',
    receipt_footer: storeInfo?.receipt_footer || '',
    fbr_enabled: storeInfo?.fbr_enabled || false,
    pos_id: storeInfo?.pos_id || '',
    currency: storeInfo?.currency || 'PKR',
    timezone: storeInfo?.timezone || 'Asia/Karachi'
  })

  React.useEffect(() => {
    if (storeInfo) {
      setStoreForm({
        store_name: storeInfo.store_name || '',
        address: storeInfo.address || '',
        phone: storeInfo.phone || '',
        email: storeInfo.email || '',
        ntn: storeInfo.ntn || '',
        receipt_footer: storeInfo.receipt_footer || '',
        fbr_enabled: storeInfo.fbr_enabled || false,
        pos_id: storeInfo.pos_id || '',
        currency: storeInfo.currency || 'PKR',
        timezone: storeInfo.timezone || 'Asia/Karachi'
      })
    }
  }, [storeInfo])

  const handleStoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateStoreInfo.mutateAsync(storeForm)
      toast.success('Store information updated successfully')
    } catch (error) {
      console.error('Error updating store info:', error)
      toast.error('Failed to update store information')
    }
  }

  const getSettingValue = (key: string) => {
    const setting = settings.find(s => s.key === key)
    return setting?.value || ''
  }

  const handleSettingChange = async (key: string, value: string) => {
    try {
      await updateSetting.mutateAsync({ key, value })
      toast.success(`Setting "${key}" updated successfully`)
    } catch (error) {
      console.error('Error updating setting:', error)
      toast.error(`Failed to update setting "${key}"`)
    }
  }

  if (settingsLoading || storeInfoLoading) {
    return (
      <div className="p-6 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'store', label: 'Store Info', icon: Store },
              { id: 'receipt', label: 'Receipt', icon: Receipt },
              { id: 'tax', label: 'Tax Settings', icon: Percent },
              { id: 'alerts', label: 'Alerts', icon: Bell },
              { id: 'printer', label: 'Printer', icon: Printer }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
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
          {activeTab === 'store' && (
            <form onSubmit={handleStoreSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Store Name *</label>
                  <input
                    type="text"
                    required
                    value={storeForm.store_name}
                    onChange={(e) => setStoreForm({ ...storeForm, store_name: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={storeForm.phone}
                    onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={storeForm.email}
                    onChange={(e) => setStoreForm({ ...storeForm, email: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">NTN Number *</label>
                  <input
                    type="text"
                    required
                    value={storeForm.ntn}
                    onChange={(e) => setStoreForm({ ...storeForm, ntn: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">POS ID (for FBR)</label>
                  <input
                    type="text"
                    value={storeForm.pos_id}
                    onChange={(e) => setStoreForm({ ...storeForm, pos_id: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                  <select
                    value={storeForm.currency}
                    onChange={(e) => setStoreForm({ ...storeForm, currency: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="PKR">Pakistani Rupee (PKR)</option>
                    <option value="USD">US Dollar (USD)</option>
                    <option value="EUR">Euro (EUR)</option>
                    <option value="GBP">British Pound (GBP)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
                  <select
                    value={storeForm.timezone}
                    onChange={(e) => setStoreForm({ ...storeForm, timezone: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Asia/Karachi">Pakistan Standard Time (Asia/Karachi)</option>
                    <option value="UTC">Coordinated Universal Time (UTC)</option>
                    <option value="Asia/Dubai">Gulf Standard Time (Asia/Dubai)</option>
                    <option value="Asia/Kolkata">India Standard Time (Asia/Kolkata)</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={storeForm.fbr_enabled}
                      onChange={(e) => setStoreForm({ ...storeForm, fbr_enabled: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                    <span className="ml-2 text-sm text-gray-700">Enable FBR Integration</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                <textarea
                  value={storeForm.address}
                  onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Receipt Footer Message</label>
                <textarea
                  value={storeForm.receipt_footer}
                  onChange={(e) => setStoreForm({ ...storeForm, receipt_footer: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="Thank you for shopping with us!"
                />
              </div>

              <button
                type="submit"
                disabled={updateStoreInfo.isPending}
                className="bg-blue-500 text-white px-6 py-3 rounded-md hover:bg-blue-600 disabled:opacity-50 flex items-center"
              >
                <Save className="h-5 w-5 mr-2" />
                {updateStoreInfo.isPending ? 'Saving...' : 'Save Store Info'}
              </button>
            </form>
          )}

          {activeTab === 'receipt' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Receipt Configuration</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Receipt Width</label>
                    <select
                      value={getSettingValue('receipt_width')}
                      onChange={(e) => handleSettingChange('receipt_width', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="80mm">80mm (Standard)</option>
                      <option value="58mm">58mm (Compact)</option>
                      <option value="A6">A6 (105mm)</option>
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={getSettingValue('show_logo') === 'true'}
                        onChange={(e) => handleSettingChange('show_logo', e.target.checked.toString())}
                        className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                      />
                      <span className="ml-2 text-sm text-gray-700">Show Logo on Receipt</span>
                    </label>
                  </div>

                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={getSettingValue('auto_print') === 'true'}
                        onChange={(e) => handleSettingChange('auto_print', e.target.checked.toString())}
                        className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                      />
                      <span className="ml-2 text-sm text-gray-700">Auto Print Receipt</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tax' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Tax Configuration</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Default Tax Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={getSettingValue('default_tax_rate') || '17'}
                      onChange={(e) => handleSettingChange('default_tax_rate', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={getSettingValue('tax_inclusive') === 'true'}
                        onChange={(e) => handleSettingChange('tax_inclusive', e.target.checked.toString())}
                        className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                      />
                      <span className="ml-2 text-sm text-gray-700">Tax Inclusive Pricing</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'alerts' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Alert Configuration</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Low Stock Threshold</label>
                    <input
                      type="number"
                      value={getSettingValue('low_stock_threshold') || '10'}
                      onChange={(e) => handleSettingChange('low_stock_threshold', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Expiry Alert Days</label>
                    <input
                      type="number"
                      value={getSettingValue('expiry_alert_days') || '30'}
                      onChange={(e) => handleSettingChange('expiry_alert_days', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={getSettingValue('email_alerts') === 'true'}
                        onChange={(e) => handleSettingChange('email_alerts', e.target.checked.toString())}
                        className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                      />
                      <span className="ml-2 text-sm text-gray-700">Enable Email Alerts</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'printer' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Printer Configuration</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Printer Type</label>
                    <select
                      value={getSettingValue('printer_type') || 'browser'}
                      onChange={(e) => handleSettingChange('printer_type', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="browser">Browser Print</option>
                      <option value="thermal">Thermal Printer (ESC/POS)</option>
                      <option value="network">Network Printer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Printer IP Address (for Network Printer)</label>
                    <input
                      type="text"
                      value={getSettingValue('printer_ip')}
                      onChange={(e) => handleSettingChange('printer_ip', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      placeholder="192.168.1.100"
                    />
                  </div>

                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={getSettingValue('print_duplicate') === 'true'}
                        onChange={(e) => handleSettingChange('print_duplicate', e.target.checked.toString())}
                        className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                      />
                      <span className="ml-2 text-sm text-gray-700">Print Duplicate Receipt</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Settings