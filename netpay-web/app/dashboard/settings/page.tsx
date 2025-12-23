'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, Button, Input, Badge, Select } from '@/components/ui';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { CopyIcon, CheckIcon, KeyIcon, PlusIcon, RefreshIcon, GlobeIcon, BellIcon } from '@/components/icons';

interface Merchant {
  businessName: string;
  businessEmail: string;
  website: string;
  walletAddress: string;
  supportEmail: string;
  description: string;
  apiKey: string;
  createdAt: string;
}

interface NotificationSettings {
  emailSettlements: boolean;
  emailFailures: boolean;
  emailCredits: boolean;
  emailWeekly: boolean;
  emailMarketing: boolean;
}

const mockWebhooks = [
  {
    id: 'wh_1',
    url: 'https://acme.com/webhooks/x402',
    events: ['settlement.completed', 'settlement.failed'],
    isActive: true,
    lastTriggered: new Date('2024-12-22T14:25:00'),
  },
];

export default function SettingsPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailSettlements: true,
    emailFailures: true,
    emailCredits: true,
    emailWeekly: false,
    emailMarketing: false,
  });
  const [webhooks, setWebhooks] = useState(mockWebhooks);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [showNewWebhookModal, setShowNewWebhookModal] = useState(false);
  const [showDeleteKeyDialog, setShowDeleteKeyDialog] = useState<string | null>(null);
  const [showNewKey, setShowNewKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'api' | 'webhooks' | 'notifications'>('profile');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/dashboard/settings');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setMerchant(data.merchant);
      if (data.notifications) setNotifications(data.notifications);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!merchant) return;
    
    setIsSaving(true);
    setSaveMessage(null);
    
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant, notifications }),
      });
      
      if (!res.ok) throw new Error('Failed to save');
      
      setSaveMessage({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error('Save error:', error);
      setSaveMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateKey = () => {
    // Simulate creating a new key
    setShowNewKey('pk_live_' + Math.random().toString(36).substring(2, 15));
    setShowNewKeyModal(false);
  };

  const tabs = [
    { id: 'profile', label: 'Business Profile' },
    { id: 'api', label: 'API Keys' },
    { id: 'webhooks', label: 'Webhooks' },
    { id: 'notifications', label: 'Notifications' },
  ] as const;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-gray-400 mt-1">Manage your account and integration settings</p>
        </div>
        {saveMessage && (
          <div className={`px-4 py-2 rounded-lg ${
            saveMessage.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {saveMessage.text}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-cyan-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
            )}
          </button>
        ))}
      </div>

      {/* Business Profile Tab */}
      {activeTab === 'profile' && merchant && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-white">Business Information</h3>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Business Name"
                  value={merchant.businessName}
                  onChange={(e) => setMerchant({ ...merchant, businessName: e.target.value })}
                />
                <Input
                  label="Website"
                  type="url"
                  value={merchant.website || ''}
                  onChange={(e) => setMerchant({ ...merchant, website: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Business Email"
                  type="email"
                  value={merchant.businessEmail || ''}
                  onChange={(e) => setMerchant({ ...merchant, businessEmail: e.target.value })}
                />
                <Input
                  label="Support Email"
                  type="email"
                  value={merchant.supportEmail || ''}
                  onChange={(e) => setMerchant({ ...merchant, supportEmail: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">Description</label>
                <textarea
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 text-sm"
                  rows={3}
                  value={merchant.description || ''}
                  onChange={(e) => setMerchant({ ...merchant, description: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">Settlement Wallet</label>
                <div className="flex items-center gap-2 p-3 bg-gray-800/50 rounded-lg">
                  <code className="flex-1 text-sm text-cyan-400 font-mono">{merchant.walletAddress}</code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(merchant.walletAddress, 'wallet')}
                    className="text-gray-500 hover:text-white transition-colors"
                  >
                    {copiedId === 'wallet' ? <CheckIcon className="w-4 h-4 text-green-400" /> : <CopyIcon className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500">All settlements will be sent to this wallet address</p>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">Member Since</label>
                <p className="text-sm text-gray-300">{new Date(merchant.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* API Keys Tab */}
      {activeTab === 'api' && merchant && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">API Key</h3>
                <p className="text-sm text-gray-400 mt-1">Use this key to authenticate API requests</p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-800 rounded-lg">
                    <KeyIcon className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">Live API Key</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="text-xs text-gray-400 font-mono">
                        {showApiKey ? merchant.apiKey : `${merchant.apiKey?.slice(0, 8)}••••••••••••••••`}
                      </code>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                  >
                    {showApiKey ? 'Hide' : 'Reveal'}
                  </button>
                  <button
                    onClick={() => copyToClipboard(merchant.apiKey, 'apikey')}
                    className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                  >
                    {copiedId === 'apikey' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-400/20 bg-yellow-400/5">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <div className="text-yellow-400 mt-0.5">⚠️</div>
                <div>
                  <h4 className="text-sm font-medium text-yellow-400">Keep your API key secure</h4>
                  <p className="text-sm text-gray-400 mt-1">
                    Never share your API key in publicly accessible areas. If you believe your key has been compromised, contact support immediately.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">Webhook Endpoints</h3>
                <p className="text-sm text-gray-400 mt-1">Receive real-time notifications for settlement events</p>
              </div>
              <Button size="sm" onClick={() => setShowNewWebhookModal(true)}>
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Endpoint
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {webhooks.length > 0 ? (
                <div className="divide-y divide-gray-800">
                  {webhooks.map((webhook) => (
                    <div key={webhook.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gray-800 rounded-lg">
                            <GlobeIcon className="w-5 h-5 text-cyan-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <code className="text-sm text-white">{webhook.url}</code>
                              <Badge variant={webhook.isActive ? 'success' : 'warning'} size="sm">
                                {webhook.isActive ? 'Active' : 'Disabled'}
                              </Badge>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Last triggered {webhook.lastTriggered?.toLocaleString() || 'Never'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
                            Edit
                          </button>
                          <button className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
                            Test
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {webhook.events.map((event) => (
                          <span key={event} className="px-2 py-0.5 text-xs bg-gray-800 text-gray-400 rounded">
                            {event}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <div className="text-gray-500">No webhooks configured</div>
                  <p className="text-sm text-gray-600 mt-1">Add an endpoint to receive settlement notifications</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-white">Available Events</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { event: 'settlement.completed', desc: 'When a settlement is successfully completed' },
                  { event: 'settlement.failed', desc: 'When a settlement fails' },
                  { event: 'settlement.pending', desc: 'When a new settlement is initiated' },
                  { event: 'credits.low', desc: 'When credit balance falls below threshold' },
                  { event: 'credits.purchased', desc: 'When credits are purchased' },
                  { event: 'resource.accessed', desc: 'When a protected resource is accessed' },
                ].map((item) => (
                  <div key={item.event} className="p-3 bg-gray-800/50 rounded-lg">
                    <code className="text-xs text-cyan-400">{item.event}</code>
                    <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-white">Notification Preferences</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { id: 'emailSettlements', label: 'Settlement Notifications', desc: 'Receive email for each completed settlement' },
                { id: 'emailFailures', label: 'Failed Settlement Alerts', desc: 'Immediate notification when a settlement fails' },
                { id: 'emailCredits', label: 'Low Credit Balance', desc: 'Alert when credits fall below 100' },
                { id: 'emailWeekly', label: 'Weekly Summary', desc: 'Weekly digest of your payment activity' },
                { id: 'emailMarketing', label: 'Product Updates', desc: 'News about new features and improvements' },
              ].map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <BellIcon className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium text-white">{item.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{item.desc}</div>
                    </div>
                  </div>
                  <label className="relative inline-flex cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={notifications[item.id as keyof NotificationSettings]}
                      onChange={(e) => setNotifications({ ...notifications, [item.id]: e.target.checked })}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600" />
                  </label>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-4">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Preferences'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create API Key Modal */}
      <Modal
        isOpen={showNewKeyModal}
        onClose={() => setShowNewKeyModal(false)}
        title="Create API Key"
      >
        <form onSubmit={(e) => { e.preventDefault(); handleCreateKey(); }} className="space-y-4">
          <Input
            label="Key Name"
            placeholder="e.g., Production, Development"
            required
          />
          <Select
            label="Environment"
            options={[
              { value: 'live', label: 'Live (Production)' },
              { value: 'test', label: 'Test (Development)' },
            ]}
          />
          <p className="text-sm text-gray-400">
            The full API key will only be shown once. Make sure to copy it immediately.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowNewKeyModal(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Create Key
            </Button>
          </div>
        </form>
      </Modal>

      {/* New Key Display Modal */}
      <Modal
        isOpen={!!showNewKey}
        onClose={() => setShowNewKey(null)}
        title="API Key Created"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Your new API key has been created. Copy it now as it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2 p-3 bg-gray-800 rounded-lg">
            <code className="flex-1 text-sm text-cyan-400 font-mono break-all">{showNewKey}</code>
            <button
              onClick={() => copyToClipboard(showNewKey!, 'newkey')}
              className="text-gray-500 hover:text-white transition-colors"
            >
              {copiedId === 'newkey' ? <CheckIcon className="w-4 h-4 text-green-400" /> : <CopyIcon className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex justify-end pt-4">
            <Button onClick={() => setShowNewKey(null)}>Done</Button>
          </div>
        </div>
      </Modal>

      {/* Add Webhook Modal */}
      <Modal
        isOpen={showNewWebhookModal}
        onClose={() => setShowNewWebhookModal(false)}
        title="Add Webhook Endpoint"
      >
        <form onSubmit={(e) => { e.preventDefault(); setShowNewWebhookModal(false); }} className="space-y-4">
          <Input
            label="Endpoint URL"
            type="url"
            placeholder="https://your-domain.com/webhooks/x402"
            required
          />
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Events to Listen</label>
            <div className="space-y-2">
              {['settlement.completed', 'settlement.failed', 'settlement.pending', 'credits.low', 'credits.purchased'].map((event) => (
                <label key={event} className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked={event.includes('settlement')} className="rounded bg-gray-800 border-gray-700 text-cyan-400 focus:ring-cyan-400" />
                  <span className="text-sm text-gray-300">{event}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowNewWebhookModal(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Add Endpoint
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Key Confirmation */}
      <ConfirmDialog
        isOpen={!!showDeleteKeyDialog}
        onClose={() => setShowDeleteKeyDialog(null)}
        onConfirm={() => setShowDeleteKeyDialog(null)}
        title="Revoke API Key"
        message="Are you sure you want to revoke this API key? Any applications using this key will no longer be able to authenticate."
        confirmText="Revoke Key"
        variant="danger"
      />
    </div>
  );
}
