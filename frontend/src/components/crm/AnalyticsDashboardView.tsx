import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart,
  Users,
  Target,
  Calendar,
  Download,
  Filter,
  RefreshCw,
  ArrowRight,
  Layers,
  ChevronDown
} from 'lucide-react';
import { crmApi } from './crmApi';

export const AnalyticsDashboardView: React.FC = () => {
  const [funnelData, setFunnelData] = useState<any>(null);
  const [attributionData, setAttributionData] = useState<any>(null);
  const [cohortsData, setCohortsData] = useState<any[]>([]);
  const [reportResult, setReportResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Custom Report Builder state
  const [reportDimension, setReportDimension] = useState<string>('country');
  const [reportMetric, setReportMetric] = useState<string>('count');
  const [reportChartType, setReportChartType] = useState<string>('bar');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  useEffect(() => {
    loadAllAnalytics();
  }, []);

  const loadAllAnalytics = async () => {
    setIsLoading(true);
    try {
      const [resFunnel, resAttr, resCohorts] = await Promise.all([
        crmApi.getFunnelMetrics().catch(() => ({ success: false, funnel: null })),
        crmApi.getAttributionMetrics().catch(() => ({ success: false, attribution: null })),
        crmApi.getCohortRetention(6).catch(() => ({ success: false, cohorts: [] }))
      ]);

      if (resFunnel?.success && resFunnel.funnel) {
        setFunnelData(resFunnel.funnel);
      }
      if (resAttr?.success && resAttr.attribution) {
        setAttributionData(resAttr.attribution);
      }
      if (resCohorts?.success && Array.isArray(resCohorts.cohorts)) {
        setCohortsData(resCohorts.cohorts);
      }

      // Initial custom report
      handleRunReport('country', 'count', 'bar');
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunReport = async (dimension: string, metric: string, chartType: string) => {
    setIsGeneratingReport(true);
    try {
      const metricsArray = metric === 'all'
        ? ['count', 'total_deal_value', 'avg_deal_value']
        : [metric];

      const res = await crmApi.runCustomReport({
        dimension,
        metrics: metricsArray,
        chart_type: chartType
      });

      if (res.success && res.report) {
        setReportResult(res.report);
      }
    } catch (err) {
      console.error('Failed to run custom report:', err);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleExportCsv = () => {
    if (!reportResult || !reportResult.rows || reportResult.rows.length === 0) return;

    const metricKeys = Object.keys(reportResult.rows[0]?.metrics || {});
    const header = [reportResult.dimension, ...metricKeys].join(',');
    const rows = reportResult.rows.map((r: any) => [
      `"${String(r.dimension_value || '').replace(/"/g, '""')}"`,
      ...metricKeys.map(k => r.metrics[k] ?? 0)
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,' + [header, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `crm_report_${reportResult.dimension}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading && !funnelData) {
    return (
      <div className="bg-white rounded-3xl p-12 border border-slate-200/80 text-center">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-3" />
        <p className="text-sm font-semibold text-slate-600">Calculating Funnels & Cohorts...</p>
      </div>
    );
  }

  const stages = funnelData?.stages || [];
  const attributionSources = attributionData?.by_source || [];

  return (
    <div className="space-y-6">
      {/* 3 KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Overall Sales Win Rate</p>
            <h3 className="text-2xl font-black text-slate-900">{funnelData?.overall_win_rate || 0}%</h3>
            <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Won Opportunities
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Target className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Avg Sales Cycle</p>
            <h3 className="text-2xl font-black text-slate-900">{funnelData?.avg_sales_cycle_days || 0} Days</h3>
            <p className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Creation to Closed Won
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Won Revenue</p>
            <h3 className="text-2xl font-black text-slate-900">
              ${(attributionData?.total_won_value_usd || 0).toLocaleString()} USD
            </h3>
            <p className="text-[10px] text-purple-600 font-semibold flex items-center gap-1">
              <Users className="w-3 h-3" /> Across all acquisition channels
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <BarChart3 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Funnel Analysis & Progression */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Pipeline Conversion & Drop-off Funnel</h3>
          </div>
          <button
            type="button"
            onClick={loadAllAnalytics}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        <div className="space-y-3 pt-2">
          {stages.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No pipeline stages found</p>
          ) : (
            stages.map((st: any, idx: number) => {
              const maxDeals = Math.max(...stages.map((s: any) => s.deal_count), 1);
              const barPct = Math.max(10, Math.round((st.deal_count / maxDeals) * 100));

              return (
                <div key={st.stage_id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] flex items-center justify-center font-extrabold">
                        {idx + 1}
                      </span>
                      {st.stage_name}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-extrabold text-slate-900">{st.deal_count} deals</span>
                      <span className="text-slate-400">|</span>
                      <span className="font-bold text-emerald-600">${st.total_value_usd.toLocaleString()}</span>
                      {idx > 0 && (
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                          {st.conversion_from_previous}% Conv
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Attribution & Cohorts 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Acquisition Attribution Table */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Target className="w-4 h-4 text-purple-600" />
              Acquisition Channel Attribution
            </h3>
            <span className="text-xs text-slate-400 font-medium">First-Touch Source</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                  <th className="pb-2">Channel</th>
                  <th className="pb-2 text-right">Contacts</th>
                  <th className="pb-2 text-right">Deals</th>
                  <th className="pb-2 text-right">Won Revenue</th>
                  <th className="pb-2 text-right">Conv %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attributionSources.map((item: any) => (
                  <tr key={item.source} className="hover:bg-slate-50/50">
                    <td className="py-2.5 font-bold text-slate-800 capitalize">{item.source.replace(/_/g, ' ')}</td>
                    <td className="py-2.5 text-right font-semibold text-slate-700">{item.contacts_count}</td>
                    <td className="py-2.5 text-right font-semibold text-slate-700">{item.deals_count}</td>
                    <td className="py-2.5 text-right font-bold text-emerald-600">${item.won_value_usd.toLocaleString()}</td>
                    <td className="py-2.5 text-right font-extrabold text-indigo-600">{item.conversion_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cohort Retention Table */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              Monthly Cohort Retention (30/60/90 Days)
            </h3>
            <span className="text-xs text-slate-400 font-medium">Activity Engaged</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                  <th className="pb-2">Cohort Month</th>
                  <th className="pb-2 text-right">Total</th>
                  <th className="pb-2 text-center">Month 0</th>
                  <th className="pb-2 text-center">Month 1</th>
                  <th className="pb-2 text-center">Month 2</th>
                  <th className="pb-2 text-center">Month 3</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cohortsData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-400">No cohort activity yet</td>
                  </tr>
                ) : (
                  cohortsData.map((c: any) => (
                    <tr key={c.cohort_month} className="hover:bg-slate-50/50">
                      <td className="py-2.5 font-bold text-slate-800">{c.cohort_month}</td>
                      <td className="py-2.5 text-right font-semibold text-slate-600">{c.total_contacts}</td>
                      <td className="py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700">
                          {c.active_m0_pct}%
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
                          {c.active_m1_pct}%
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
                          {c.active_m2_pct}%
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
                          {c.active_m3_pct}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Custom Report Builder & Visualizer */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              Custom Multi-Dimensional Report Builder
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Slice and aggregate contacts and revenue across dimensions with live tabular previews.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!reportResult || !reportResult.rows || reportResult.rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </button>
          </div>
        </div>

        {/* Builder Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Dimension</label>
            <select
              value={reportDimension}
              onChange={e => {
                setReportDimension(e.target.value);
                handleRunReport(e.target.value, reportMetric, reportChartType);
              }}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="country">Country</option>
              <option value="source">Acquisition Source</option>
              <option value="stage">Pipeline Stage</option>
              <option value="status">Lifecycle Status</option>
              <option value="created_month">Creation Month</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Metric</label>
            <select
              value={reportMetric}
              onChange={e => {
                setReportMetric(e.target.value);
                handleRunReport(reportDimension, e.target.value, reportChartType);
              }}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="count">Record Count</option>
              <option value="total_deal_value">Total Deal Value (USD)</option>
              <option value="avg_deal_value">Average Deal Value (USD)</option>
              <option value="all">All Metrics</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Chart Type</label>
            <select
              value={reportChartType}
              onChange={e => {
                setReportChartType(e.target.value);
                handleRunReport(reportDimension, reportMetric, e.target.value);
              }}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="bar">Bar Chart</option>
              <option value="donut">Donut Chart</option>
              <option value="line">Line Chart</option>
              <option value="funnel">Funnel</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => handleRunReport(reportDimension, reportMetric, reportChartType)}
              disabled={isGeneratingReport}
              className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
            >
              {isGeneratingReport ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}
              Generate Report
            </button>
          </div>
        </div>

        {/* Tabular Report Results */}
        <div className="mt-4 border border-slate-100 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-4 capitalize">{reportResult?.dimension || 'Dimension'}</th>
                {reportResult?.rows?.[0] &&
                  Object.keys(reportResult.rows[0].metrics).map(k => (
                    <th key={k} className="py-2.5 px-4 text-right capitalize">
                      {k.replace(/_/g, ' ')}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportResult?.rows?.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">No records found for this dimension</td>
                </tr>
              ) : (
                reportResult?.rows?.map((row: any) => (
                  <tr key={row.dimension_value} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-4 font-bold text-slate-800">{row.dimension_value || 'Unknown'}</td>
                    {Object.keys(row.metrics).map(k => (
                      <td key={k} className="py-2.5 px-4 text-right font-semibold text-slate-700">
                        {k.includes('value') ? `$${Number(row.metrics[k]).toLocaleString()}` : row.metrics[k]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

