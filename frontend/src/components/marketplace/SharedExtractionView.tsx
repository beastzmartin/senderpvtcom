import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  FileText,
  FileCode,
  Search,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  Clock,
  Database,
  Image,
  Code,
  AlertCircle
} from 'lucide-react';

interface SharedJobData {
  job: {
    id: string;
    product_name: string;
    product_slug: string;
    status: string;
    items_delivered: number;
    runtime_seconds?: number;
    created_at: string;
  };
  results: any[];
  total: number;
  expiresAt: string;
}

export const SharedExtractionView: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<SharedJobData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'gallery' | 'json'>('table');
  const [copied, setCopied] = useState<boolean>(false);
  const [selectedRow, setSelectedRow] = useState<any | null>(null);

  useEffect(() => {
    const fetchSharedData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/marketplace/shared/${token}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to load shared extraction or link expired.');
        }
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || 'Share link is invalid or expired.');
      } finally {
        setLoading(false);
      }
    };

    fetchSharedData();
  }, [token]);

  const filteredResults = useMemo(() => {
    if (!data?.results) return [];
    if (!search.trim()) return data.results;
    const q = search.toLowerCase();
    return data.results.filter((row) =>
      Object.values(row).some((val) => String(val ?? '').toLowerCase().includes(q))
    );
  }, [data?.results, search]);

  const columns = useMemo(() => {
    if (!data?.results || data.results.length === 0) return [];
    const keys = new Set<string>();
    data.results.slice(0, 50).forEach((row) => {
      Object.keys(row).forEach((k) => keys.add(k));
    });
    return Array.from(keys);
  }, [data?.results]);

  const exportClientCsv = () => {
    if (!data?.results || data.results.length === 0) return;
    const header = columns.join(',');
    const rows = data.results.map((row) =>
      columns
        .map((col) => {
          const val = row[col];
          const escaped = String(val ?? '').replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(',')
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent([header, ...rows].join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `${data.job.product_slug}_shared_results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportClientJson = () => {
    if (!data?.results) return;
    const jsonStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data.results, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', jsonStr);
    link.setAttribute('download', `${data.job.product_slug}_shared_results.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-sm font-semibold tracking-wide text-slate-300">Loading Shared Extraction Results...</h2>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Link Inactive or Expired</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {error || 'This extraction share link is either invalid, reached its 72-hour expiration window, or was revoked.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-base tracking-tight text-white">{data.job.product_name}</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {data.job.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-3">
                <span>{data.total} records delivered</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  Expires: {new Date(data.expiresAt).toLocaleDateString()}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verified Share
                </span>
              </p>
            </div>
          </div>

          {/* Export Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportClientCsv}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700 shadow-sm"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>Download CSV</span>
            </button>
            <button
              type="button"
              onClick={exportClientJson}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700 shadow-sm"
            >
              <FileCode className="w-3.5 h-3.5 text-amber-400" />
              <span>Download JSON</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto w-full p-6 space-y-6 flex-1">
        {/* Controls Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-3 rounded-2xl">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search across all records..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                  viewMode === 'table' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('gallery')}
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                  viewMode === 'gallery' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Image className="w-3.5 h-3.5" />
                <span>Gallery</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('json')}
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                  viewMode === 'json' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>
            </div>
          </div>
        </div>

        {/* View Mode Content */}
        {filteredResults.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs bg-slate-900 border border-slate-800 rounded-2xl">
            No matching records found.
          </div>
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 shadow-xl max-h-[600px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-300 font-bold sticky top-0 border-b border-slate-800 z-10">
                <tr>
                  <th className="px-4 py-3 w-12 text-center text-slate-500">#</th>
                  {columns.map((col) => (
                    <th key={col} className="px-4 py-3 whitespace-nowrap text-slate-400">
                      {col}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredResults.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-2.5 text-center text-slate-500 font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    {columns.map((col) => {
                      const val = row[col];
                      const str = String(val ?? '');
                      const isUrl = str.startsWith('http://') || str.startsWith('https://');
                      const isImg = isUrl && (str.endsWith('.png') || str.endsWith('.jpg') || str.endsWith('.jpeg') || str.endsWith('.webp'));

                      return (
                        <td key={col} className="px-4 py-2.5 max-w-xs truncate text-slate-300">
                          {isImg ? (
                            <img src={str} alt="" className="w-8 h-8 object-cover rounded shadow inline" />
                          ) : isUrl ? (
                            <a
                              href={str}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-400 hover:underline flex items-center gap-1"
                            >
                              <span className="truncate">{str}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          ) : typeof val === 'object' && val !== null ? (
                            <span className="font-mono text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-emerald-400">
                              {JSON.stringify(val)}
                            </span>
                          ) : (
                            str
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedRow(row)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : viewMode === 'gallery' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredResults.map((row, idx) => {
              let imgUrl: string | null = null;
              for (const k of Object.keys(row)) {
                const v = String(row[k] ?? '');
                if (v.startsWith('http') && (v.includes('.png') || v.includes('.jpg') || v.includes('.jpeg') || v.includes('.webp') || k.toLowerCase().includes('image') || k.toLowerCase().includes('photo') || k.toLowerCase().includes('logo'))) {
                  imgUrl = v;
                  break;
                }
              }
              const title = row.title || row.name || row.company || `Item #${idx + 1}`;

              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-lg hover:border-slate-700 transition flex flex-col"
                >
                  <div className="aspect-square bg-slate-950 flex items-center justify-center overflow-hidden">
                    {imgUrl ? (
                      <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Image className="w-8 h-8 text-slate-700" />
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <h4 className="font-semibold text-xs text-white truncate">{title}</h4>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>#{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedRow(row)}
                        className="text-emerald-400 hover:underline"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-slate-900 px-4 py-2 rounded-t-2xl border border-slate-800">
              <span className="text-xs font-mono text-slate-400">{filteredResults.length} records</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(filteredResults, null, 2));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="px-3 py-1 bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy JSON'}</span>
              </button>
            </div>
            <pre className="bg-slate-900 p-4 rounded-b-2xl border border-t-0 border-slate-800 text-xs font-mono text-emerald-400 max-h-[550px] overflow-auto">
              {JSON.stringify(filteredResults, null, 2)}
            </pre>
          </div>
        )}

        {/* Row Detail Modal */}
        {selectedRow && (
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setSelectedRow(null)}
          >
            <div
              className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-sm text-white">Record Details</h3>
                <button
                  type="button"
                  onClick={() => setSelectedRow(null)}
                  className="text-slate-400 hover:text-white font-bold text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2">
                {Object.entries(selectedRow).map(([k, v]) => (
                  <div key={k} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                    <span className="font-mono text-[10px] text-slate-500 uppercase font-bold">{k}</span>
                    <div className="text-slate-200 font-mono break-all whitespace-pre-wrap">
                      {typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v ?? '')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-800 py-4 text-center text-xs text-slate-500 font-sans">
        Powered by Enterprise Extraction Network • End-to-End Encrypted Data Delivery
      </footer>
    </div>
  );
};

