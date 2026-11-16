import React, { useState, useEffect } from 'react';
import { ShieldAlert, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { crmApi, CrmSuppressionItem } from './crmApi';

export const SuppressionListView: React.FC = () => {
  const [items, setItems] = useState<CrmSuppressionItem[]>([]);
  const [identifierType, setIdentifierType] = useState<'email' | 'phone'>('email');
  const [identifierValue, setIdentifierValue] = useState('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    loadSuppression();
  }, []);

  const loadSuppression = async () => {
    setIsLoading(true);
    try {
      const res = await crmApi.listSuppression();
      if (res.success) {
        setItems(res.suppression || []);
      }
    } catch (err: any) {
      console.error('Failed to load suppression list:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifierValue.trim()) return;

    setIsAdding(true);
    try {
      const res = await crmApi.addSuppression({
        identifier_type: identifierType,
        identifier_value: identifierValue.trim().toLowerCase(),
        reason: reason.trim() || undefined
      });

      if (res.success) {
        setIdentifierValue('');
        setReason('');
        loadSuppression();
      }
    } catch (err: any) {
      alert(`Failed to suppress contact: ${err.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this entry from the suppression list?')) return;
    try {
      const res = await crmApi.removeSuppression(id);
      if (res.success) {
        setItems(items.filter((i) => i.id !== id));
      }
    } catch (err: any) {
      alert(`Remove failed: ${err.message}`);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Add Suppression Form */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-600" />
          Add to Suppression / Do-Not-Contact
        </h3>
        <p className="text-xs text-slate-500">
          Suppressed emails and phones are rejected during imports and omitted from outgoing campaigns.
        </p>

        <form onSubmit={handleAdd} className="space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Identifier Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIdentifierType('email')}
                className={`py-2 rounded-lg font-bold border transition ${
                  identifierType === 'email'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => setIdentifierType('phone')}
                className={`py-2 rounded-lg font-bold border transition ${
                  identifierType === 'phone'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Phone (E.164)
              </button>
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">
              {identifierType === 'email' ? 'Email Address' : 'Phone Number'}
            </label>
            <input
              type="text"
              required
              value={identifierValue}
              onChange={(e) => setIdentifierValue(e.target.value)}
              placeholder={identifierType === 'email' ? 'user@domain.com' : '+15551234567'}
              className="w-full p-2.5 border border-slate-300 rounded-xl"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Reason / Unsubscribe Note</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Unsubscribe requested, GDPR delete request"
              className="w-full p-2.5 border border-slate-300 rounded-xl"
            />
          </div>

          <button
            type="submit"
            disabled={isAdding}
            className="w-full py-2.5 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition disabled:opacity-50"
          >
            {isAdding ? 'Suppressing...' : 'Add to Suppression List'}
          </button>
        </form>
      </div>

      {/* Suppression List Table */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <span className="text-xs font-bold text-slate-700">Suppressed Identifiers</span>
          <span className="text-xs text-slate-400 font-semibold">{items.length} records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Identifier</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Suppressed At</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-bold text-slate-900 font-mono">{item.identifier_value}</td>
                  <td className="py-3 px-4 uppercase font-semibold text-[10px] text-slate-500">{item.identifier_type}</td>
                  <td className="py-3 px-4 text-slate-500">{item.reason || '—'}</td>
                  <td className="py-3 px-4 text-slate-400">{new Date(item.created_at).toLocaleDateString()}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No suppressed identifiers.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

