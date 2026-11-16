import React, { useState, useEffect } from 'react';
import {
  Key,
  Webhook,
  BookOpen,
  BarChart2,
  Plus,
  Trash2,
  Copy,
  Check,
  Shield,
  Clock,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Code2
} from 'lucide-react';
import { crmApi, CrmApiKey, CrmWebhook, CrmWebhookDelivery } from './crmApi';

export const DeveloperPortalView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'keys' | 'webhooks' | 'docs' | 'usage'>('keys');

  // Keys state
  const [apiKeys, setApiKeys] = useState<CrmApiKey[]>([]);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    'contacts:read',
    'contacts:write',
    'lists:write',
    'imports:run',
    'extractions:run'
  ]);
  const [isTestKey, setIsTestKey] = useState(false);
  const [generatedSecretKey, setGeneratedSecretKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Webhooks state
  const [webhooks, setWebhooks] = useState<CrmWebhook[]>([]);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>([
    'contact.created',
    'contact.updated',
    'contact.deleted',
    'import.completed',
    'extraction.completed'
  ]);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<CrmWebhookDelivery[]>([]);

  // Usage state
  const [usageStats, setUsageStats] = useState<any>(null);
  const [openApiSpec, setOpenApiSpec] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadPortalData();
  }, [activeTab]);

  const loadPortalData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'keys') {
        const res = await crmApi.listApiKeys();
        if (res.success) setApiKeys(res.api_keys || []);
      } else if (activeTab === 'webhooks') {
        const res = await crmApi.listWebhooks();
        if (res.success) setWebhooks(res.webhooks || []);
      } else if (activeTab === 'usage') {
        const res = await crmApi.getUsageStats();
        if (res.success) setUsageStats(res.stats);
      } else if (activeTab === 'docs') {
        const res = await crmApi.getOpenApiSpec();
        setOpenApiSpec(res);
      }
    } catch (err: any) {
      console.error('Failed to load portal data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    try {
      const res = await crmApi.createApiKey(newKeyName.trim(), selectedScopes, isTestKey);
      if (res.success && res.secret_key) {
        setGeneratedSecretKey(res.secret_key);
        setApiKeys([res.api_key, ...apiKeys]);
      }
    } catch (err: any) {
      alert(`Failed to create API key: ${err.message}`);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action is permanent.')) return;
    try {
      const res = await crmApi.revokeApiKey(id);
      if (res.success) {
        setApiKeys(apiKeys.map((k) => (k.id === id ? { ...k, is_revoked: true } : k)));
      }
    } catch (err: any) {
      alert(`Revoke failed: ${err.message}`);
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.trim()) return;

    try {
      const res = await crmApi.createWebhook(webhookUrl.trim(), webhookEvents);
      if (res.success) {
        setWebhooks([res.webhook, ...webhooks]);
        setIsWebhookModalOpen(false);
        setWebhookUrl('');
      }
    } catch (err: any) {
      alert(`Failed to create webhook: ${err.message}`);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm('Delete this webhook endpoint?')) return;
    try {
      const res = await crmApi.deleteWebhook(id);
      if (res.success) {
        setWebhooks(webhooks.filter((w) => w.id !== id));
      }
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleViewDeliveries = async (hookId: string) => {
    setSelectedWebhookId(hookId);
    try {
      const res = await crmApi.listWebhookDeliveries(hookId);
      if (res.success) setDeliveries(res.deliveries || []);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Code2 className="w-5 h-5 text-indigo-600" />
            Developer Platform & External REST API (/v1)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cryptographic API keys, token-bucket rate limits, wallet credit monetization, and HMAC-SHA256 signed webhooks
          </p>
        </div>

        {/* Subtabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('keys')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition ${
              activeTab === 'keys' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
            }`}
          >
            <Key className="w-3.5 h-3.5" /> API Keys
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('webhooks')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition ${
              activeTab === 'webhooks' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
            }`}
          >
            <Webhook className="w-3.5 h-3.5" /> Webhooks
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('docs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition ${
              activeTab === 'docs' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" /> REST Docs (OpenAPI)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('usage')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition ${
              activeTab === 'usage' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" /> Usage & Billing
          </button>
        </div>
      </div>

      {/* TAB 1: API KEYS */}
      {activeTab === 'keys' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500">
              API keys are hashed via SHA-256 before storage. Pass your secret key via header <code>X-API-Key</code>.
            </span>
            <button
              type="button"
              onClick={() => {
                setGeneratedSecretKey(null);
                setNewKeyName('');
                setIsKeyModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" /> Generate New API Key
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Name / Prefix</th>
                    <th className="py-3 px-4">Environment</th>
                    <th className="py-3 px-4">Scopes</th>
                    <th className="py-3 px-4">Rate Limit</th>
                    <th className="py-3 px-4">Usage</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {apiKeys.map((key) => (
                    <tr key={key.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        <div>{key.name}</div>
                        <div className="font-mono text-[11px] text-slate-400">{key.key_prefix}••••••••</div>
                      </td>
                      <td className="py-3 px-4">
                        {key.is_test ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                            TEST (Free)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                            LIVE
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {key.scopes.map((s) => (
                            <span key={s} className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px]">
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4">{key.rate_limit_per_minute} req/min</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{key.usage_count.toLocaleString()} calls</td>
                      <td className="py-3 px-4 text-slate-400">{new Date(key.created_at).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-right">
                        {key.is_revoked ? (
                          <span className="text-rose-500 font-bold">REVOKED</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRevokeKey(key.id)}
                            className="text-rose-600 hover:text-rose-800 font-semibold"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}

                  {apiKeys.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No API keys generated yet. Create one to begin integrating external workflows.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: WEBHOOKS */}
      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500">
              Webhooks receive event payloads signed with HMAC-SHA256. Verified using header <code>X-Signature-SHA256</code>.
            </span>
            <button
              type="button"
              onClick={() => setIsWebhookModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" /> Add Webhook Endpoint
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">Endpoint URL</th>
                      <th className="py-3 px-4">Events Subscribed</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {webhooks.map((hook) => (
                      <tr key={hook.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono font-medium text-slate-900 truncate max-w-xs">
                          {hook.url}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {hook.events.map((e) => (
                              <span key={e} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px]">
                                {e}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {hook.failure_count === 0 ? (
                            <span className="text-emerald-600 font-bold">Healthy</span>
                          ) : (
                            <span className="text-rose-600 font-bold">{hook.failure_count} failures</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => handleViewDeliveries(hook.id)}
                            className="text-indigo-600 hover:text-indigo-800 font-semibold"
                          >
                            Logs
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteWebhook(hook.id)}
                            className="text-rose-600 hover:text-rose-800 font-semibold"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}

                    {webhooks.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">
                          No webhook endpoints configured.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Deliveries Sidebar */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex flex-col h-[400px]">
              <div className="font-bold text-xs text-slate-800 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span>Recent Webhook Deliveries</span>
                <span className="text-slate-400 text-[11px]">{deliveries.length} items</span>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 mt-2">
                {deliveries.map((del) => (
                  <div key={del.id} className="py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{del.event}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          del.success ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        Status: {del.response_status || 'ERR'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 flex justify-between">
                      <span>{del.attempts} attempt(s)</span>
                      <span>{new Date(del.created_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
                {deliveries.length === 0 && (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    Select a webhook to inspect its delivery logs.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: REST API DOCS (OPENAPI) */}
      {activeTab === 'docs' && (
        <div className="space-y-4">
          <div className="bg-slate-900 text-slate-100 p-6 rounded-2xl shadow-lg space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
              <span>Authentication Header Specification</span>
              <span>REST Base: /v1</span>
            </div>
            <pre className="text-emerald-400 whitespace-pre-wrap">
              {`curl -X GET "https://your-domain.com/v1/contacts?limit=25" \\
  -H "X-API-Key: crm_live_xxxxxxxxxxxxxxxxxxxxxxxx" \\
  -H "Accept: application/json"`}
            </pre>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Supported REST Endpoints (/v1)</h3>
            <div className="divide-y divide-slate-100 text-xs">
              {[
                { method: 'GET', path: '/v1/contacts', desc: 'Keyset cursor paginated contacts list with server-side filters' },
                { method: 'POST', path: '/v1/contacts', desc: 'Create contact with automatic deduplication & idempotency' },
                { method: 'POST', path: '/v1/contacts/bulk', desc: 'Bulk upsert up to 1,000 contacts in transaction batch' },
                { method: 'GET', path: '/v1/contacts/{id}', desc: 'Retrieve single contact with custom fields and tags' },
                { method: 'PUT', path: '/v1/contacts/{id}', desc: 'Update contact record attributes' },
                { method: 'DELETE', path: '/v1/contacts/{id}', desc: 'Soft-delete or permanent GDPR delete contact' },
                { method: 'POST', path: '/v1/contacts/search', desc: 'Fast full-text contact search across name, email, phone' },
                { method: 'GET', path: '/v1/lists', desc: 'List all static and dynamic saved segments' },
                { method: 'POST', path: '/v1/exports', desc: 'Trigger asynchronous streamed file export (CSV/XLSX/JSON)' },
                { method: 'POST', path: '/v1/extractions', desc: 'Trigger lead scraper extraction directly into CRM list' },
                { method: 'GET', path: '/v1/usage', desc: 'Query API key usage quota, credit balance, and rate limit status' }
              ].map((ep) => (
                <div key={ep.path + ep.method} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        ep.method === 'GET'
                          ? 'bg-blue-100 text-blue-700'
                          : ep.method === 'POST'
                          ? 'bg-emerald-100 text-emerald-700'
                          : ep.method === 'PUT'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {ep.method}
                    </span>
                    <span className="font-mono font-bold text-slate-800">{ep.path}</span>
                  </div>
                  <span className="text-slate-500">{ep.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: USAGE & BILLING */}
      {activeTab === 'usage' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total External API Calls</div>
            <div className="text-2xl font-black text-slate-900 mt-2">
              {usageStats?.total_calls ? usageStats.total_calls.toLocaleString() : '0'}
            </div>
            <div className="text-xs text-slate-500 mt-1">Recorded in last 30 days</div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Credits Incurred</div>
            <div className="text-2xl font-black text-indigo-600 mt-2">
              {usageStats?.total_credits ? usageStats.total_credits.toFixed(2) : '0.00'}
            </div>
            <div className="text-xs text-slate-500 mt-1">Deducted from Platform Wallet</div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Token Bucket Quota</div>
            <div className="text-2xl font-black text-emerald-600 mt-2">1,000 / min</div>
            <div className="text-xs text-slate-500 mt-1">Automated per-key burst capacity</div>
          </div>
        </div>
      )}

      {/* CREATE API KEY MODAL */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Generate New API Key</h3>
              <button onClick={() => setIsKeyModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <Trash2 className="hidden" />
                Cancel
              </button>
            </div>

            {!generatedSecretKey ? (
              <form onSubmit={handleCreateKey} className="space-y-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Key Label / Name</label>
                  <input
                    type="text"
                    required
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. Zapier Production, Lead Engine Sync"
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="test_key"
                    checked={isTestKey}
                    onChange={(e) => setIsTestKey(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <label htmlFor="test_key" className="font-semibold text-slate-700">
                    Test Mode Key (No credit charges deducted)
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition"
                >
                  Generate Key
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Copy your secret key now. For your security, this key cannot be displayed again.
                  </span>
                </div>

                <div className="p-3 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl flex items-center justify-between break-all">
                  <span>{generatedSecretKey}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedSecretKey);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                    className="ml-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition shrink-0"
                  >
                    {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsKeyModalOpen(false)}
                  className="w-full py-2.5 font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE WEBHOOK MODAL */}
      {isWebhookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 text-xs">
            <h3 className="text-base font-bold text-slate-900">Add Webhook Endpoint</h3>
            <form onSubmit={handleCreateWebhook} className="space-y-4">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Target Payload URL (HTTPS)</label>
                <input
                  type="url"
                  required
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://api.yourdomain.com/webhooks/crm"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Event Subscriptions</label>
                <div className="space-y-1.5">
                  {['contact.created', 'contact.updated', 'contact.deleted', 'import.completed', 'extraction.completed'].map((ev) => (
                    <label key={ev} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={webhookEvents.includes(ev)}
                        onChange={(e) => {
                          if (e.target.checked) setWebhookEvents([...webhookEvents, ev]);
                          else setWebhookEvents(webhookEvents.filter((x) => x !== ev));
                        }}
                        className="rounded text-indigo-600"
                      />
                      <span className="font-medium text-slate-700">{ev}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsWebhookModalOpen(false)}
                  className="flex-1 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition"
                >
                  Save Webhook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

