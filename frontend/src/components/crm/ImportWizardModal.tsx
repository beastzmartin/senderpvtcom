import React, { useState, useEffect } from 'react';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  Check,
  ChevronRight,
  Layers
} from 'lucide-react';
import { crmApi, CrmList, CrmImportJob } from './crmApi';

interface ImportWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  lists: CrmList[];
  onImportCompleted?: () => void;
}

const CRM_TARGET_FIELDS = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'email', label: 'Email Address' },
  { key: 'phone', label: 'Phone Number' },
  { key: 'company_name', label: 'Company Name' },
  { key: 'title', label: 'Job Title' },
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
  { key: 'lead_score', label: 'Lead Score' }
];

export const ImportWizardModal: React.FC<ImportWizardModalProps> = ({
  isOpen,
  onClose,
  lists,
  onImportCompleted
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFilePath, setUploadedFilePath] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [dedupePolicy, setDedupePolicy] = useState<'skip' | 'update' | 'merge'>('update');
  const [targetListId, setTargetListId] = useState<string>('');
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<CrmImportJob | null>(null);
  const [pollInterval, setPollInterval] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen]);

  const resetState = () => {
    setStep(1);
    setSelectedFile(null);
    setIsUploading(false);
    setUploadedFilePath('');
    setHeaders([]);
    setPreviewRows([]);
    setColumnMapping({});
    setDedupePolicy('update');
    setTargetListId('');
    setImportJobId(null);
    setJobStatus(null);
    if (pollInterval) clearInterval(pollInterval);
  };

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    try {
      const res = await crmApi.uploadImportFile(selectedFile);
      if (res.success) {
        setUploadedFilePath(res.file_path);
        setHeaders(res.headers);
        setPreviewRows(res.preview_rows);

        // Auto map obvious headers
        const autoMap: Record<string, string> = {};
        res.headers.forEach((h) => {
          const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (lower.includes('email') || lower === 'mail') autoMap[h] = 'email';
          else if (lower.includes('first') || lower === 'fname') autoMap[h] = 'first_name';
          else if (lower.includes('last') || lower === 'lname') autoMap[h] = 'last_name';
          else if (lower.includes('name') && !autoMap['first_name']) autoMap[h] = 'first_name';
          else if (lower.includes('phone') || lower.includes('mobile') || lower.includes('cell')) autoMap[h] = 'phone';
          else if (lower.includes('company') || lower.includes('org')) autoMap[h] = 'company_name';
          else if (lower.includes('title') || lower.includes('role') || lower.includes('position')) autoMap[h] = 'title';
          else if (lower.includes('city')) autoMap[h] = 'city';
          else if (lower.includes('country')) autoMap[h] = 'country';
        });
        setColumnMapping(autoMap);
        setStep(2);
      }
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleExecuteImport = async () => {
    try {
      const res = await crmApi.executeImport({
        file_path: uploadedFilePath,
        file_name: selectedFile?.name || 'contacts.csv',
        column_mapping: columnMapping,
        dedupe_policy: dedupePolicy,
        target_list_id: targetListId || undefined
      });

      if (res.success && res.import_job_id) {
        setImportJobId(res.import_job_id);
        setStep(4);
        startPolling(res.import_job_id);
      }
    } catch (err: any) {
      alert(`Import start failed: ${err.message}`);
    }
  };

  const startPolling = (jobId: string) => {
    const timer = setInterval(async () => {
      try {
        const res = await crmApi.getImportStatus(jobId);
        if (res.success && res.import) {
          setJobStatus(res.import);
          if (res.import.status === 'completed' || res.import.status === 'failed') {
            clearInterval(timer);
            if (onImportCompleted) onImportCompleted();
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1500);
    setPollInterval(timer);
  };

  const handleDownloadErrors = () => {
    if (!importJobId) return;
    window.open(`/api/crm/imports/${importJobId}/error-report`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Bulk Import Wizard (High-Scale)</h3>
              <p className="text-xs text-slate-500">Chunked streaming import with validation & deduplication</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Steps Stepper */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500">
          <div className={`flex items-center gap-1.5 ${step === 1 ? 'text-indigo-600 font-bold' : ''}`}>
            <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px]">1</span>
            Upload File
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <div className={`flex items-center gap-1.5 ${step === 2 ? 'text-indigo-600 font-bold' : ''}`}>
            <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px]">2</span>
            Column Mapping
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <div className={`flex items-center gap-1.5 ${step === 3 ? 'text-indigo-600 font-bold' : ''}`}>
            <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px]">3</span>
            Dedupe & Target List
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <div className={`flex items-center gap-1.5 ${step === 4 ? 'text-indigo-600 font-bold' : ''}`}>
            <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px]">4</span>
            Processing
          </div>
        </div>

        {/* Step Contents */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* STEP 1: UPLOAD */}
          {step === 1 && (
            <div className="space-y-4">
              <label className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 hover:bg-indigo-50/30 transition text-center group">
                <FileSpreadsheet className="w-12 h-12 text-slate-400 group-hover:text-indigo-600 mb-2 transition" />
                <span className="text-sm font-bold text-slate-800">
                  {selectedFile ? selectedFile.name : 'Select CSV or Excel (.xlsx) file'}
                </span>
                <span className="text-xs text-slate-400 mt-1">
                  Supports up to 500MB / millions of rows streamed with chunked batching
                </span>
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {selectedFile && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleUploadFile}
                    disabled={isUploading}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition disabled:opacity-50"
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Uploading & Inspecting...
                      </>
                    ) : (
                      <>
                        Continue to Mapping <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: COLUMN MAPPING */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Match columns detected from <strong>{selectedFile?.name}</strong> to contact attributes.
              </p>

              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {headers.map((hdr) => (
                  <div key={hdr} className="p-2.5 flex items-center justify-between text-xs bg-white hover:bg-slate-50">
                    <div className="w-1/2 font-semibold text-slate-800 flex flex-col">
                      <span>{hdr}</span>
                      <span className="text-[11px] text-slate-400 truncate">
                        Example: {previewRows[0]?.[hdr] ?? '—'}
                      </span>
                    </div>
                    <div className="w-1/2 flex justify-end">
                      <select
                        value={columnMapping[hdr] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setColumnMapping({ ...columnMapping, [hdr]: val });
                        }}
                        className="text-xs font-medium border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 bg-white"
                      >
                        <option value="">(Ignore Column)</option>
                        {CRM_TARGET_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition"
                >
                  Next: Dedupe Policy <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: DEDUPE & TARGET LIST */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Deduplication Strategy</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDedupePolicy('update')}
                    className={`p-3 rounded-xl border text-left transition ${
                      dedupePolicy === 'update'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold text-xs">Update Existing</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Overwrite empty fields with newer data</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDedupePolicy('skip')}
                    className={`p-3 rounded-xl border text-left transition ${
                      dedupePolicy === 'skip'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold text-xs">Skip Existing</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Keep existing record untouched</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDedupePolicy('merge')}
                    className={`p-3 rounded-xl border text-left transition ${
                      dedupePolicy === 'merge'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold text-xs">Deep Merge</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Merge tags and custom field dictionaries</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Add to CRM List (Optional)</label>
                <select
                  value={targetListId}
                  onChange={(e) => setTargetListId(e.target.value)}
                  className="w-full text-xs font-medium border border-slate-300 rounded-xl px-3 py-2 text-slate-800 bg-white"
                >
                  <option value="">Do not assign to list</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.cached_count} contacts)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleExecuteImport}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition"
                >
                  Start Streaming Import <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: PROGRESS & SUMMARY */}
          {step === 4 && (
            <div className="space-y-4 py-4 text-center">
              {jobStatus?.status === 'processing' || !jobStatus ? (
                <div className="space-y-3">
                  <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
                  <h4 className="text-sm font-bold text-slate-900">Streaming & Ingesting Records...</h4>
                  <p className="text-xs text-slate-500">
                    Processed: <strong>{jobStatus?.processed_rows || 0}</strong> / {jobStatus?.total_rows || 'calculating...'}
                  </p>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                      style={{
                        width: `${
                          jobStatus?.total_rows
                            ? Math.min(100, Math.round((jobStatus.processed_rows / jobStatus.total_rows) * 100))
                            : 10
                        }%`
                      }}
                    />
                  </div>
                </div>
              ) : jobStatus.status === 'completed' ? (
                <div className="space-y-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                  <div>
                    <h4 className="text-base font-bold text-slate-900">Import Complete!</h4>
                    <p className="text-xs text-slate-500 mt-1">All batches ingested and normalized into CRM database.</p>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div>
                      <div className="text-xs font-bold text-slate-400">Total</div>
                      <div className="text-sm font-bold text-slate-800">{jobStatus.total_rows}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-emerald-600">Created</div>
                      <div className="text-sm font-bold text-emerald-600">{jobStatus.created_rows}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-indigo-600">Updated</div>
                      <div className="text-sm font-bold text-indigo-600">{jobStatus.updated_rows}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-amber-600">Skipped</div>
                      <div className="text-sm font-bold text-amber-600">{jobStatus.skipped_rows}</div>
                    </div>
                  </div>

                  {jobStatus.error_rows > 0 && (
                    <div className="flex items-center justify-between p-3 bg-rose-50 border border-rose-200 rounded-xl text-left">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span className="text-xs font-semibold text-rose-800">
                          {jobStatus.error_rows} rows had formatting errors
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleDownloadErrors}
                        className="flex items-center gap-1 text-xs font-bold text-rose-700 hover:text-rose-800 underline"
                      >
                        <Download className="w-3 h-3" /> Error CSV
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition"
                  >
                    Done & View Contacts
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
                  <h4 className="text-base font-bold text-slate-900">Import Failed</h4>
                  <p className="text-xs text-rose-600">{jobStatus.error_message || 'An error occurred during import'}</p>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2 text-xs font-bold bg-slate-800 text-white rounded-xl"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

