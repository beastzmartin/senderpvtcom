import React, { useState, useEffect } from 'react';
import { RefreshCw, Users, GitMerge, Check, AlertCircle, ArrowRight } from 'lucide-react';
import { crmApi, CrmContact } from './crmApi';

export const DedupeMergeView: React.FC = () => {
  const [field, setField] = useState<'email' | 'phone'>('email');
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number | null>(null);

  // Merge state for selected pair
  const [primaryIndex, setPrimaryIndex] = useState<number>(0);
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, any>>({});
  const [isMerging, setIsMerging] = useState(false);

  useEffect(() => {
    loadDuplicates();
  }, [field]);

  const loadDuplicates = async () => {
    setIsLoading(true);
    setSelectedGroupIndex(null);
    try {
      const res = await crmApi.findDuplicates(field);
      if (res.success) {
        setDuplicateGroups(res.duplicate_groups || []);
      }
    } catch (err: any) {
      console.error('Failed to load duplicates:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectGroup = (idx: number) => {
    setSelectedGroupIndex(idx);
    setPrimaryIndex(0);
    setFieldOverrides({});
  };

  const currentGroup = selectedGroupIndex !== null ? duplicateGroups[selectedGroupIndex] : null;
  const contactA: CrmContact | undefined = currentGroup?.contacts?.[0];
  const contactB: CrmContact | undefined = currentGroup?.contacts?.[1];

  const handleExecuteMerge = async () => {
    if (!contactA || !contactB) return;
    const primary = primaryIndex === 0 ? contactA : contactB;
    const duplicate = primaryIndex === 0 ? contactB : contactA;

    setIsMerging(true);
    try {
      const res = await crmApi.mergeContacts(primary.id, duplicate.id, fieldOverrides);
      if (res.success) {
        alert('Contacts merged successfully! Duplicate record marked deleted.');
        loadDuplicates();
      }
    } catch (err: any) {
      alert(`Merge failed: ${err.message}`);
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-indigo-600" />
            Duplicate Finder & Conflict Resolver
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Identify conflicting duplicates across 100M+ contacts with field-level resolution choice
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setField('email')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                field === 'email' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              Match by Email
            </button>
            <button
              type="button"
              onClick={() => setField('phone')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                field === 'phone' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              Match by Phone
            </button>
          </div>

          <button
            type="button"
            onClick={loadDuplicates}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Scan Now
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left List of Duplicate Groups */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs font-bold text-slate-700">Duplicate Candidate Groups</span>
            <span className="text-xs text-slate-400 font-semibold">{duplicateGroups.length} found</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Scanning for duplicates...</div>
            ) : duplicateGroups.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No duplicate records found for matching field "{field}". Database is deduplicated.
              </div>
            ) : (
              duplicateGroups.map((grp, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectGroup(idx)}
                  className={`w-full p-4 text-left transition flex items-center justify-between ${
                    selectedGroupIndex === idx
                      ? 'bg-indigo-50/60 border-l-4 border-indigo-600'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-bold text-slate-900 truncate">{grp.group_key}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {grp.contacts?.length || 2} matching records
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Side-by-Side Conflict Resolution */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col h-[600px] overflow-hidden">
          {contactA && contactB ? (
            <div className="flex-1 flex flex-col overflow-hidden space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Side-by-Side Field Conflict Resolver</h3>
                  <p className="text-xs text-slate-500">
                    Select which value to keep into the surviving primary record
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Primary Record:</span>
                  <select
                    value={primaryIndex}
                    onChange={(e) => setPrimaryIndex(Number(e.target.value))}
                    className="text-xs font-bold border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800"
                  >
                    <option value={0}>Record A ({contactA.first_name || 'Contact A'})</option>
                    <option value={1}>Record B ({contactB.first_name || 'Contact B'})</option>
                  </select>
                </div>
              </div>

              {/* Field comparison table */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {[
                  { key: 'first_name', label: 'First Name' },
                  { key: 'last_name', label: 'Last Name' },
                  { key: 'email', label: 'Email' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'company_name', label: 'Company' },
                  { key: 'title', label: 'Job Title' },
                  { key: 'city', label: 'City' },
                  { key: 'country', label: 'Country' },
                  { key: 'lead_score', label: 'Lead Score' }
                ].map((fieldDef) => {
                  const valA = (contactA as any)[fieldDef.key] ?? '';
                  const valB = (contactB as any)[fieldDef.key] ?? '';
                  const chosenVal = fieldOverrides[fieldDef.key] !== undefined
                    ? fieldOverrides[fieldDef.key]
                    : (primaryIndex === 0 ? valA : valB);

                  return (
                    <div
                      key={fieldDef.key}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-4 text-xs"
                    >
                      <div className="w-28 font-bold text-slate-700">{fieldDef.label}</div>

                      {/* Option A */}
                      <button
                        type="button"
                        onClick={() => setFieldOverrides({ ...fieldOverrides, [fieldDef.key]: valA })}
                        className={`flex-1 p-2 rounded-lg border text-left truncate transition ${
                          chosenVal === valA
                            ? 'border-indigo-600 bg-indigo-50 font-bold text-indigo-900'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 block font-normal">Record A:</span>
                        {String(valA || '—')}
                      </button>

                      {/* Option B */}
                      <button
                        type="button"
                        onClick={() => setFieldOverrides({ ...fieldOverrides, [fieldDef.key]: valB })}
                        className={`flex-1 p-2 rounded-lg border text-left truncate transition ${
                          chosenVal === valB
                            ? 'border-indigo-600 bg-indigo-50 font-bold text-indigo-900'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 block font-normal">Record B:</span>
                        {String(valB || '—')}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Merge Action Button */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Duplicate record will be soft-deleted. All tags and timeline activities will be retained.
                </span>
                <button
                  type="button"
                  onClick={handleExecuteMerge}
                  disabled={isMerging}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {isMerging ? 'Merging Records...' : 'Execute Merge'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <Users className="w-12 h-12 mb-2 text-slate-300" />
              <p className="text-sm font-semibold">Select a duplicate candidate group from the left</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Compare properties side-by-side and choose which values to retain in the merged contact.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

