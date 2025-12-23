'use client';

import { useState } from 'react';
import { Card, CardHeader, CardContent, Button, Input, Badge, Select } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { PlusIcon, SearchIcon, ExternalLinkIcon, CopyIcon, CheckIcon, KeyIcon, GlobeIcon } from '@/components/icons';
import type { MerchantResource, ResourceType } from '@/types';

// Mock resources data
const mockResources: MerchantResource[] = [
  {
    id: 'res_1',
    merchantId: 'merchant_1',
    name: 'Premium API Access',
    description: 'Full access to all API endpoints with priority rate limits',
    type: 'api',
    creditCost: 1,
    isPublished: true,
    totalAccesses: 1245,
    createdAt: new Date('2024-11-01'),
    updatedAt: new Date('2024-12-15'),
    url: 'https://api.example.com/v2',
    method: 'ANY',
  },
  {
    id: 'res_2',
    merchantId: 'merchant_1',
    name: 'AI Data Analysis',
    description: 'Machine learning powered data analysis with insights',
    type: 'service',
    creditCost: 5,
    isPublished: true,
    totalAccesses: 342,
    createdAt: new Date('2024-11-15'),
    updatedAt: new Date('2024-12-18'),
  },
  {
    id: 'res_3',
    merchantId: 'merchant_1',
    name: 'Premium Dataset Q4 2024',
    description: 'Comprehensive market data for Q4 2024',
    type: 'data',
    creditCost: 10,
    isPublished: true,
    totalAccesses: 89,
    createdAt: new Date('2024-12-01'),
    updatedAt: new Date('2024-12-20'),
  },
  {
    id: 'res_4',
    merchantId: 'merchant_1',
    name: 'Beta Feature Access',
    description: 'Early access to upcoming features',
    type: 'api',
    creditCost: 2,
    isPublished: false,
    totalAccesses: 0,
    createdAt: new Date('2024-12-18'),
    updatedAt: new Date('2024-12-18'),
    url: 'https://api.example.com/beta',
    method: 'GET',
  },
];

const resourceTypes: { value: ResourceType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'api', label: 'API Endpoint' },
  { value: 'service', label: 'Service' },
  { value: 'data', label: 'Data' },
  { value: 'content', label: 'Content' },
  { value: 'compute', label: 'Compute' },
  { value: 'storage', label: 'Storage' },
];

export default function ResourcesPage() {
  const [resources] = useState<MerchantResource[]>(mockResources);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<ResourceType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedResource, setSelectedResource] = useState<MerchantResource | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredResources = resources.filter((resource) => {
    const matchesSearch = 
      resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resource.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || resource.type === typeFilter;
    const matchesStatus = 
      statusFilter === 'all' || 
      (statusFilter === 'published' && resource.isPublished) ||
      (statusFilter === 'draft' && !resource.isPublished);
    return matchesSearch && matchesType && matchesStatus;
  });

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getTypeColor = (type: ResourceType) => {
    const colors = {
      api: 'bg-blue-400/20 text-blue-400',
      service: 'bg-purple-400/20 text-purple-400',
      data: 'bg-green-400/20 text-green-400',
      content: 'bg-yellow-400/20 text-yellow-400',
      compute: 'bg-orange-400/20 text-orange-400',
      storage: 'bg-pink-400/20 text-pink-400',
    };
    return colors[type] || 'bg-gray-400/20 text-gray-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Resources</h1>
          <p className="text-gray-400 mt-1">Manage your protected services and endpoints</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <PlusIcon className="w-4 h-4 mr-2" />
          Create Resource
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-gray-400">Total Resources</div>
          <div className="text-2xl font-bold text-white mt-1">{resources.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-400">Published</div>
          <div className="text-2xl font-bold text-green-400 mt-1">{resources.filter(r => r.isPublished).length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-400">Total Accesses</div>
          <div className="text-2xl font-bold text-cyan-400 mt-1">{resources.reduce((acc, r) => acc + (r.totalAccesses || 0), 0).toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-400">Credits Earned</div>
          <div className="text-2xl font-bold text-white mt-1">{resources.reduce((acc, r) => acc + (r.totalAccesses || 0) * r.creditCost, 0).toLocaleString()}</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search resources..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select
            options={resourceTypes}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ResourceType | 'all')}
            className="w-40"
          />
          <Select
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'published', label: 'Published' },
              { value: 'draft', label: 'Draft' },
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'published' | 'draft')}
            className="w-36"
          />
        </div>
      </Card>

      {/* Resources Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredResources.map((resource) => (
          <Card key={resource.id} className="overflow-hidden hover:border-gray-700 transition-colors">
            <CardHeader className="flex flex-row items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${getTypeColor(resource.type)}`}>
                  {resource.type === 'api' ? <KeyIcon className="w-5 h-5" /> : <GlobeIcon className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-semibold text-white">{resource.name}</h3>
                  <p className="text-sm text-gray-400 mt-0.5">{resource.description}</p>
                </div>
              </div>
              <Badge variant={resource.isPublished ? 'success' : 'warning'}>
                {resource.isPublished ? 'Published' : 'Draft'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Type</span>
                <span className={`px-2 py-0.5 rounded text-xs ${getTypeColor(resource.type)}`}>
                  {resource.type.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Credit Cost</span>
                <span className="text-white font-medium">{resource.creditCost} credit{resource.creditCost !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Total Accesses</span>
                <span className="text-white">{resource.totalAccesses?.toLocaleString() || 0}</span>
              </div>
              {resource.url && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Endpoint</span>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-cyan-400 bg-gray-800 px-2 py-0.5 rounded">
                      {resource.method || 'ANY'} {new URL(resource.url).pathname}
                    </code>
                    <button
                      onClick={() => copyToClipboard(resource.url!, resource.id)}
                      className="text-gray-500 hover:text-white transition-colors"
                    >
                      {copiedId === resource.id ? <CheckIcon className="w-3.5 h-3.5 text-green-400" /> : <CopyIcon className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
              <div className="pt-3 border-t border-gray-800 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Updated {resource.updatedAt.toLocaleDateString()}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedResource(resource)}
                    className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                  >
                    View Details
                  </button>
                  <button className="px-3 py-1.5 text-xs bg-cyan-400/10 hover:bg-cyan-400/20 text-cyan-400 rounded-lg transition-colors">
                    Edit
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredResources.length === 0 && (
        <Card className="p-8 text-center">
          <div className="text-gray-500">No resources found</div>
          <p className="text-sm text-gray-600 mt-1">
            {searchTerm || typeFilter !== 'all' || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Create your first resource to get started'}
          </p>
        </Card>
      )}

      {/* Create Resource Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Resource"
      >
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setShowCreateModal(false); }}>
          <Input
            label="Resource Name"
            placeholder="e.g., Premium API Access"
            required
          />
          <div className="space-y-1">
            <label className="text-sm text-gray-400">Description</label>
            <textarea
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 text-sm"
              rows={3}
              placeholder="Describe what this resource provides..."
            />
          </div>
          <Select
            label="Resource Type"
            options={resourceTypes.filter(t => t.value !== 'all')}
          />
          <Input
            label="Credit Cost"
            type="number"
            min={1}
            defaultValue={1}
            required
          />
          <Input
            label="Endpoint URL (optional)"
            placeholder="https://api.example.com/endpoint"
          />
          <Select
            label="HTTP Method (optional)"
            options={[
              { value: 'ANY', label: 'Any Method' },
              { value: 'GET', label: 'GET' },
              { value: 'POST', label: 'POST' },
              { value: 'PUT', label: 'PUT' },
              { value: 'DELETE', label: 'DELETE' },
            ]}
          />
          <div className="flex items-center gap-2 pt-2">
            <input type="checkbox" id="publish" className="rounded bg-gray-800 border-gray-700 text-cyan-400 focus:ring-cyan-400" />
            <label htmlFor="publish" className="text-sm text-gray-300">Publish immediately</label>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Create Resource
            </Button>
          </div>
        </form>
      </Modal>

      {/* Resource Details Modal */}
      <Modal
        isOpen={!!selectedResource}
        onClose={() => setSelectedResource(null)}
        title="Resource Details"
      >
        {selectedResource && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${getTypeColor(selectedResource.type)}`}>
                {selectedResource.type === 'api' ? <KeyIcon className="w-5 h-5" /> : <GlobeIcon className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="font-semibold text-white">{selectedResource.name}</h3>
                <p className="text-sm text-gray-400">{selectedResource.description}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <div className="text-xs text-gray-500 uppercase">Type</div>
                <div className="text-sm text-white mt-1">{selectedResource.type}</div>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <div className="text-xs text-gray-500 uppercase">Credit Cost</div>
                <div className="text-sm text-white mt-1">{selectedResource.creditCost} credits</div>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <div className="text-xs text-gray-500 uppercase">Total Accesses</div>
                <div className="text-sm text-white mt-1">{selectedResource.totalAccesses?.toLocaleString() || 0}</div>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <div className="text-xs text-gray-500 uppercase">Revenue</div>
                <div className="text-sm text-white mt-1">{((selectedResource.totalAccesses || 0) * selectedResource.creditCost).toLocaleString()} credits</div>
              </div>
            </div>

            {selectedResource.url && (
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <div className="text-xs text-gray-500 uppercase">Endpoint</div>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-sm text-cyan-400">{selectedResource.method || 'ANY'} {selectedResource.url}</code>
                  <button
                    onClick={() => copyToClipboard(selectedResource.url!, 'modal')}
                    className="text-gray-500 hover:text-white transition-colors"
                  >
                    {copiedId === 'modal' ? <CheckIcon className="w-4 h-4 text-green-400" /> : <CopyIcon className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <div className="border-t border-gray-800 pt-4">
              <h4 className="text-sm font-medium text-white mb-3">Integration Code</h4>
              <pre className="p-3 bg-gray-800/50 rounded-lg text-xs text-gray-300 overflow-x-auto">
{`// Protect this resource with x402
app.use('/api/resource/${selectedResource.id}', x402({
  creditCost: ${selectedResource.creditCost},
  resourceId: '${selectedResource.id}'
}));`}
              </pre>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-gray-800">
              <span className="text-xs text-gray-500">
                Created {selectedResource.createdAt.toLocaleDateString()}
              </span>
              <div className="flex gap-2">
                <button className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
                  <ExternalLinkIcon className="w-3.5 h-3.5" />
                  Test Endpoint
                </button>
                <Button size="sm">Edit Resource</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
