import React, { useState } from 'react';
import { Modal } from './Modal';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Hash,
  Phone,
  User,
  Sparkles,
  ArrowRight,
  Send,
  Calendar,
  Database
} from 'lucide-react';

export interface MappedContact {
  lid: string;
  phone?: string;
  name?: string;
  customData?: Record<string, any>;
}

interface CsvUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportToBulkSender?: (contacts: MappedContact[], customHeaders: string[]) => void;
  onImportToScheduler?: (contacts: MappedContact[], customHeaders: string[]) => void;
  onImportToContacts?: (contacts: MappedContact[]) => void;
}

export const CsvUploaderModal: React.FC<CsvUploaderModalProps> = ({
  isOpen,
  onClose,
  onImportToBulkSender,
  onImportToScheduler,
  onImportToContacts
}) => {
  const [rawContent, setRawContent] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);

  // Column Mappings
  const [lidCol, setLidCol] = useState<string>('');
  const [phoneCol, setPhoneCol] = useState<string>('');
  const [nameCol, setNameCol] = useState<string>('');

  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Parse CSV/TSV helper
  const parseCsvText = (text: string) => {
    setError(null);
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      setError('CSV must contain at least 1 header line and 1 row of data.');
      return;
    }

    // Detect delimiter: comma, semicolon, tab
    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

    const parsedHeaders = firstLine
      .split(delimiter)
      .map((h) => h.replace(/^["']|["']$/g, '').trim());

    const parsedRows = lines.slice(1).map((line) => {
      // Basic quoted CSV split
      const values: string[] = [];
      let inQuotes = false;
      let current = '';
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"' || c === "'") {
          inQuotes = !inQuotes;
        } else if (c === delimiter && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += c;
        }
      }
      values.push(current.trim());
      return values;
    });

    setHeaders(parsedHeaders);
    setRows(parsedRows);

    // Auto-detect columns
    const lowerHeaders = parsedHeaders.map((h) => h.toLowerCase());
    
    // Auto-detect LID
    let detectedLid = '';
    const lidIdx = lowerHeaders.findIndex((h) => h.includes('lid') || h === 'id' || h.includes('identity'));
    if (lidIdx >= 0) detectedLid = parsedHeaders[lidIdx];
    else {
      // Check first row values for @lid or 15+ digits
      for (let col = 0; col < parsedHeaders.length; col++) {
        const sample = parsedRows[0]?.[col] || '';
        if (sample.endsWith('@lid') || (/^\d{13,16}$/.test(sample))) {
          detectedLid = parsedHeaders[col];
          break;
        }
      }
    }
    setLidCol(detectedLid || parsedHeaders[0] || '');

    // Auto-detect Phone
    const phoneIdx = lowerHeaders.findIndex(
      (h) => (h.includes('phone') || h.includes('mobile') || h.includes('cell') || h.includes('number')) && h !== detectedLid.toLowerCase()
    );
    if (phoneIdx >= 0) setPhoneCol(parsedHeaders[phoneIdx]);
    else setPhoneCol('');

    // Auto-detect Name
    const nameIdx = lowerHeaders.findIndex(
      (h) => h.includes('name') || h.includes('contact') || h.includes('user') || h.includes('customer')
    );
    if (nameIdx >= 0) setNameCol(parsedHeaders[nameIdx]);
    else setNameCol('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setRawContent(text);
        parseCsvText(text);
      }
    };
    reader.readAsText(file);
  };

  // Build mapped contact objects
  const getMappedContacts = (): MappedContact[] => {
    if (!lidCol || headers.length === 0) return [];

    const lidIdx = headers.indexOf(lidCol);
    const phoneIdx = phoneCol ? headers.indexOf(phoneCol) : -1;
    const nameIdx = nameCol ? headers.indexOf(nameCol) : -1;

    // Remaining custom columns
    const customHeaderIndices: Array<{ name: string; idx: number }> = [];
    headers.forEach((h, idx) => {
      if (idx !== lidIdx && idx !== phoneIdx && idx !== nameIdx) {
        // Clean variable name (only alphanumerics and underscores)
        const cleanVarName = h.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
        customHeaderIndices.push({ name: cleanVarName, idx });
      }
    });

    const contacts: MappedContact[] = [];

    for (const r of rows) {
      let rawLid = (r[lidIdx] || '').trim();
      if (!rawLid) continue;

      if (!rawLid.endsWith('@lid') && /^\d+$/.test(rawLid)) {
        rawLid = `${rawLid}@lid`;
      }

      if (!rawLid.endsWith('@lid')) continue;

      const phone = phoneIdx >= 0 ? r[phoneIdx]?.trim() || undefined : undefined;
      const name = nameIdx >= 0 ? r[nameIdx]?.trim() || undefined : undefined;

      const customData: Record<string, any> = {};
      for (const ch of customHeaderIndices) {
        const val = r[ch.idx]?.trim();
        if (val) customData[ch.name] = val;
      }

      contacts.push({
        lid: rawLid,
        phone,
        name,
        customData: Object.keys(customData).length > 0 ? customData : undefined
      });
    }

    return contacts;
  };

  const customVariables = headers
    .filter((h) => h !== lidCol && h !== phoneCol && h !== nameCol)
    .map((h) => h.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase());

  const mapped = getMappedContacts();

  const handleSendToBulk = () => {
    if (mapped.length === 0) {
      setError('No valid LIDs could be mapped from the uploaded CSV.');
      return;
    }
    if (onImportToBulkSender) {
      onImportToBulkSender(mapped, customVariables);
      onClose();
    }
  };

  const handleSendToScheduler = () => {
    if (mapped.length === 0) {
      setError('No valid LIDs could be mapped from the uploaded CSV.');
      return;
    }
    if (onImportToScheduler) {
      onImportToScheduler(mapped, customVariables);
      onClose();
    }
  };

  const handleSaveToContacts = async () => {
    if (mapped.length === 0) {
      setError('No valid contacts to save.');
      return;
    }
    if (onImportToContacts) {
      onImportToContacts(mapped);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Advanced CSV Audience Uploader & Column Mapper"
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5">
        {/* Upload Zone */}
        {headers.length === 0 ? (
          <div className="space-y-4">
            <div className="p-8 border-2 border-dashed border-slate-200 hover:border-sky-500 rounded-2xl bg-slate-50 text-center transition flex flex-col items-center justify-center gap-3">
              <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 text-sky-600">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Upload CSV / TSV / Excel File</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Upload your contacts list. Supports any custom headers (name, lid, phone, company, city, amount, etc.).
                </p>
              </div>

              <label className="cursor-pointer px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center gap-2 transition shadow-xs">
                <Upload className="w-4 h-4" />
                Select CSV File
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Paste Alternative */}
            <div>
              <label className="text-xs font-semibold text-slate-800 block mb-1">
                Or Paste Raw CSV Data Directly:
              </label>
              <textarea
                rows={4}
                value={rawContent}
                onChange={(e) => {
                  setRawContent(e.target.value);
                  if (e.target.value.includes('\n')) {
                    parseCsvText(e.target.value);
                  }
                }}
                placeholder="name,phone,lid,company&#10;Rahul Sharma,+919876543210,7757465940199@lid,Acme Corp&#10;Priya Verma,,8819204910294@lid,Tech Solutions"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 font-mono resize-none focus:outline-none focus:bg-white focus:border-sky-500 shadow-xs"
              />
              {rawContent.trim() && (
                <button
                  type="button"
                  onClick={() => parseCsvText(rawContent)}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition border border-slate-200 shadow-xs"
                >
                  Parse Pasted CSV
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Step 2: Intelligent Column Mapper */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wide">
                  <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                  Auto-Detected Column Mapping
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setHeaders([]);
                    setRows([]);
                    setRawContent('');
                  }}
                  className="text-[11px] text-slate-500 hover:text-slate-900 underline"
                >
                  Change File
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* LID Column */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1 flex items-center gap-1">
                    <Hash className="w-3 h-3 text-sky-600" />
                    WhatsApp LID Column <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={lidCol}
                    onChange={(e) => setLidCol(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-sky-500 font-medium shadow-xs"
                  >
                    <option value="">-- Select LID Column --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Phone Column */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-emerald-600" />
                    Phone Number (Optional)
                  </label>
                  <select
                    value={phoneCol}
                    onChange={(e) => setPhoneCol(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-sky-500 font-medium shadow-xs"
                  >
                    <option value="">-- None / Skip --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Name Column */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1 flex items-center gap-1">
                    <User className="w-3 h-3 text-purple-600" />
                    Contact Name (Optional)
                  </label>
                  <select
                    value={nameCol}
                    onChange={(e) => setNameCol(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-sky-500 font-medium shadow-xs"
                  >
                    <option value="">-- None / Skip --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic Variables Chips Detected */}
              {customVariables.length > 0 && (
                <div className="pt-2 border-t border-slate-200 text-[11px]">
                  <span className="text-slate-600 mr-2 font-medium">Custom Template Variables Available:</span>
                  <div className="inline-flex flex-wrap gap-1 mt-1">
                    {customVariables.map((v) => (
                      <span
                        key={v}
                        className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-mono text-[10px]"
                      >
                        {`{${v}}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Validation & Stats Card */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Total Rows</span>
                <span className="font-bold text-slate-900 text-base font-mono">{rows.length}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-emerald-700 text-[10px] uppercase font-bold block">Valid LIDs</span>
                <span className="font-bold text-emerald-700 text-base font-mono">{mapped.length}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200">
                <span className="text-purple-700 text-[10px] uppercase font-bold block">Variables</span>
                <span className="font-bold text-purple-800 text-base font-mono">{customVariables.length + 3}</span>
              </div>
            </div>

            {/* Preview Table (First 4 rows) */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">LID Address</th>
                    <th className="py-2 px-3">Phone</th>
                    <th className="py-2 px-3">Name</th>
                    <th className="py-2 px-3">Custom Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white font-mono text-[11px]">
                  {mapped.slice(0, 5).map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-sky-700 font-semibold">{m.lid}</td>
                      <td className="py-2 px-3 text-emerald-700">{m.phone || '—'}</td>
                      <td className="py-2 px-3 text-slate-800 font-sans">{m.name || '—'}</td>
                      <td className="py-2 px-3 text-purple-700 text-[10px] truncate max-w-xs font-sans">
                        {m.customData ? JSON.stringify(m.customData) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Error notice if any */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 shadow-xs">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Destination Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2.5">
              {onImportToContacts && (
                <button
                  type="button"
                  onClick={handleSaveToContacts}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition border border-slate-200 shadow-xs"
                >
                  <Database className="w-3.5 h-3.5 text-purple-600" />
                  Save to Address Book
                </button>
              )}

              {onImportToScheduler && (
                <button
                  type="button"
                  onClick={handleSendToScheduler}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-xs"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Setup Daily Broadcast Schedule
                </button>
              )}

              {onImportToBulkSender && (
                <button
                  type="button"
                  onClick={handleSendToBulk}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  Load into Bulk LID Sender ({mapped.length})
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

