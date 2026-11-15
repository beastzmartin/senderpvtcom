import React, { useState } from 'react';
import { api } from '../../services/api';
import { Modal } from '../common/Modal';
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete
}) => {
  const [csvContent, setCsvContent] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{
    total: number;
    imported: number;
    skipped: number;
    errors: Array<{ row: number; reason: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sampleCsv = `name,phone,lid,notes
Alex Kumar,+919876543210,,Tech lead
Sarah Connor,,7757465940199@lid,Project contact
Michael Scott,+14155552671,38291038291@lid,Enterprise client
Support Desk,+447700900077,,Customer service`;

  const downloadSample = () => {
    const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'whatsapp_contacts_sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvContent.trim()) {
      setError('Please choose a CSV file or paste CSV content below.');
      return;
    }

    setIsImporting(true);
    setError(null);
    setResult(null);

    try {
      const res = await api.contacts.importCsv(csvContent.trim());
      setResult(res.data);
      onImportComplete();
    } catch (err: any) {
      setError(err.message || 'Failed to import CSV contacts.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Contacts from CSV"
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-600">
          Upload or paste a CSV file containing contact records. Contacts may have a phone number, a WhatsApp LID, or both.
        </p>

        {/* Action bar: download template & file upload */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2">
            <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs">
              <Upload className="w-3.5 h-3.5" />
              Upload .CSV File
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={downloadSample}
            className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-200 shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            Download Sample CSV
          </button>
        </div>

        {/* Text Area */}
        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1.5">
            CSV Raw Text Preview
          </label>
          <textarea
            rows={6}
            placeholder={sampleCsv}
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 resize-none leading-relaxed shadow-xs"
          />
        </div>

        {/* Results Banner */}
        {result && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-2 shadow-xs">
            <div className="flex items-center gap-2 font-semibold text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Imported {result.imported} of {result.total} contacts!</span>
            </div>
            {result.skipped > 0 && (
              <p className="text-[11px] text-amber-700">
                {result.skipped} records skipped (e.g. duplicates or missing values).
              </p>
            )}
            {result.errors.length > 0 && (
              <div className="max-h-24 overflow-y-auto space-y-1 text-[10px] text-rose-700 bg-white p-2 rounded border border-rose-200">
                {result.errors.map((err, idx) => (
                  <div key={idx}>Row {err.row}: {err.reason}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 shadow-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={isImporting || !csvContent.trim()}
            className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold shadow-xs transition flex items-center justify-center gap-1.5"
          >
            {isImporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
            Process CSV Import
          </button>
        </div>
      </div>
    </Modal>
  );
};

