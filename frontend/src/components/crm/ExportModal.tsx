import React, { useState } from 'react';
import { X, Download, FileSpreadsheet, FileJson, CheckCircle2, RefreshCw } from 'lucide-react';
import { crmApi, CrmExportJob } from './crmApi';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeFilter?: any;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  activeFilter
}) => {
  const [format, setFormat] = useState<'csv' | 'xlsx' | 'json'>('csv');
  const [isExporting, setIsExporting] = useState(false);
  const [completedJob, setCompletedJob] = useState<CrmExportJob | null>(null);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setIsExporting(true);
    setCompletedJob(null);
    try {
      const res = await crmApi.createExport(format, activeFilter);
      if (res.success && res.export) {
        // Poll for completion
        const timer = setInterval(async () => {
          try {
            const expList = await crmApi.listExports();
            const current = expList.exports?.find((e) => e.id === res.export.id);
            if (current && (current.status === 'completed' || current.status === 'failed')) {
              clearInterval(timer);
              setCompletedJob(current);
              setIsExporting(false);
            }
          } catch {
            clearInterval(timer);
            setIsExporting(false);
          }
        }, 1500);
      }
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
      setIsExporting(false);
    }
  };

  const handleDownloadFile = () => {
    if (!completedJob) return;
    window.open(`/api/crm/exports/${completedJob.id}/download`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Async Stream Export</h3>
              <p className="text-xs text-slate-500">Fast non-blocking stream for large datasets</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {!completedJob ? (
            <>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-2">Select Export Format</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormat('csv')}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition ${
                      format === 'csv'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 font-bold'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                    <span className="text-xs">CSV (.csv)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormat('xlsx')}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition ${
                      format === 'xlsx'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 font-bold'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                    <span className="text-xs">Excel (.xlsx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormat('json')}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition ${
                      format === 'json'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 font-bold'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <FileJson className="w-5 h-5 text-amber-600" />
                    <span className="text-xs">JSON (.json)</span>
                  </button>
                </div>
              </div>

              {activeFilter && activeFilter.conditions?.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                  Export will respect current active filter ({activeFilter.conditions.length} condition(s) applied).
                </div>
              )}

              <button
                type="button"
                onClick={handleStartExport}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Streaming records in background...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Generate Export
                  </>
                )}
              </button>
            </>
          ) : (
            <div className="text-center py-4 space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <div>
                <h4 className="text-base font-bold text-slate-900">Export Ready!</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Exported {completedJob.total_records} contacts successfully.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDownloadFile}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition"
                >
                  <Download className="w-4 h-4" />
                  Download File
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

