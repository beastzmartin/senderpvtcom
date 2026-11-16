import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  GitMerge,
  Sparkles,
  Archive,
  Database,
  Check,
  Zap
} from 'lucide-react';
import { crmApi } from './crmApi';

export const DataHealthDashboardView: React.FC = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [jobFeedback, setJobFeedback] = useState<string | null>(null);

  useEffect(() => {
    loadHealth();
  }, []);

  const loadHealth = async () => {
    setIsLoading(true);
    try {
      const res = await crmApi.getDataHealth();
      if (res.success && res.metrics) {
        setMetrics(res.metrics);
      }
    } catch (err) {
      console.error('Failed to load health metrics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunClean = async () => {
    setActiveJob('clean');
    setJobFeedback(null);
    try {
      const res = await crmApi.runHealthClean();
      if (res.success && res.result) {
        setJobFeedback(`Normalized ${res.result.fixed} contacts across whitespace, E.164 phones, and lowercased emails.`);
        loadHealth();
      }
    } catch (err: any) {
      setJobFeedback(`Clean error: ${err.message}`);
    } finally {
      setActiveJob(null);
    }
  };

  if (isLoading && !metrics) {
    return (
      <div className="bg-white rounded-3xl p-12 border border-slate-200/80 text-center">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-3" />
        <p className="text-sm font-semibold text-slate-600">Calculating Data Health & Quality...</p>
      </div>
    );
  }

  const score = metrics?.data_quality_score || 95;

  return (
    <div className="space-y-6">
      {/* Top Health Overview Card */}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Composite Data Quality Score</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {score}/100 Overall Health Rating
          </h2>
          <p className="text-xs sm:text-sm text-slate-300">
            Continuous identity resolution, MX verification, and format normalization running across your workspace contacts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadHealth}
            disabled={isLoading}
            className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition border border-white/10"
            title="Recalculate Health Score"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 4 Health Dimension Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Email Validity</p>
            <h3 className="text-2xl font-black text-slate-900">{metrics?.email_health?.valid_percentage || 100}%</h3>
            <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {metrics?.email_health?.valid_count || 0} Deliverable Emails
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Phone Coverage</p>
            <h3 className="text-2xl font-black text-slate-900">{metrics?.phone_health?.valid_percentage || 100}%</h3>
            <p className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> E.164 Formatted
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Zap className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Duplicates Review</p>
            <h3 className="text-2xl font-black text-slate-900">{metrics?.duplicates?.detected_count || 0}</h3>
            <p className="text-[10px] text-amber-600 font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> High-Confidence Pairs
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <GitMerge className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Stale Contacts</p>
            <h3 className="text-2xl font-black text-slate-900">{metrics?.stale_records?.percentage || 0}%</h3>
            <p className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
              <Archive className="w-3 h-3" /> &gt; 180 Days Inactive
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center">
            <Archive className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* One-Click Fix Actions Section */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            1-Click Automated Hygiene & Cleanup Jobs
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            Run background optimization routines to eliminate whitespace defects, format international numbers, and deduplicate records.
          </p>
        </div>

        {jobFeedback && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{jobFeedback}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col justify-between space-y-3">
            <div>
              <h4 className="text-xs font-bold text-slate-900">Normalize E.164 & Names</h4>
              <p className="text-[11px] text-slate-500 mt-1">
                Trims unwanted whitespace, capitalizes names, and formats international phone numbers into standard E.164.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunClean}
              disabled={activeJob !== null}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {activeJob === 'clean' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Run Normalization
            </button>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col justify-between space-y-3">
            <div>
              <h4 className="text-xs font-bold text-slate-900">Dedupe Auto-Resolution</h4>
              <p className="text-[11px] text-slate-500 mt-1">
                Finds near-duplicate records and applies survivorship rules to merge contacts with 1-click unmerge capability.
              </p>
            </div>
            <button
              type="button"
              disabled
              className="w-full py-2 bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-not-allowed"
            >
              <GitMerge className="w-3.5 h-3.5" />
              Automated in Background
            </button>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col justify-between space-y-3">
            <div>
              <h4 className="text-xs font-bold text-slate-900">Cold Tier Archival</h4>
              <p className="text-[11px] text-slate-500 mt-1">
                Moves contacts inactive for &gt; 365 days into the cold archive to keep indexed hot partitions fast and lean.
              </p>
            </div>
            <button
              type="button"
              disabled
              className="w-full py-2 bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-not-allowed"
            >
              <Archive className="w-3.5 h-3.5" />
              Tiered Storage Active
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

