import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { ExtractionSourceRecord, ExtractionJobRecord } from '../../types';
import { ExtensionPairingModal } from './ExtensionPairingModal';
import {
  Layers,
  MapPin,
  Globe,
  BookOpen,
  Building2,
  Mail,
  Phone,
  Linkedin,
  ShoppingBag,
  Home,
  Briefcase,
  Utensils,
  Award,
  Plus,
  Play,
  Pause,
  RotateCw,
  XCircle,
  Trash2,
  Chrome,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

interface ExtractionHubViewProps {
  onNavigateToLeads?: () => void;
}

export const ExtractionHubView: React.FC<ExtractionHubViewProps> = ({ onNavigateToLeads }) => {
  const [sources, setSources] = useState<ExtractionSourceRecord[]>([]);
  const [jobs, setJobs] = useState<ExtractionJobRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPairingOpen, setIsPairingOpen] = useState<boolean>(false);
  const [isCreateJobOpen, setIsCreateJobOpen] = useState<boolean>(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('google_maps');

  // Job creation form
  const [jobKeyword, setJobKeyword] = useState<string>('');
  const [jobLocation, setJobLocation] = useState<string>('');
  const [jobCount, setJobCount] = useState<number>(50);
  const [isSubmittingJob, setIsSubmittingJob] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [srcList, jobList] = await Promise.all([
        api.extractionJobs.listSources(),
        api.extractionJobs.list(50)
      ]);
      setSources(srcList);
      setJobs(jobList);
    } catch (err: any) {
      console.error('Failed to load extraction hub data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getSourceIcon = (iconName: string) => {
    switch (iconName) {
      case 'MapPin': return <MapPin className="w-5 h-5" />;
      case 'Globe': return <Globe className="w-5 h-5" />;
      case 'BookOpen': return <BookOpen className="w-5 h-5" />;
      case 'Building2': return <Building2 className="w-5 h-5" />;
      case 'Mail': return <Mail className="w-5 h-5" />;
      case 'Phone': return <Phone className="w-5 h-5" />;
      case 'Linkedin': return <Linkedin className="w-5 h-5" />;
      case 'ShoppingBag': return <ShoppingBag className="w-5 h-5" />;
      case 'Home': return <Home className="w-5 h-5" />;
      case 'Briefcase': return <Briefcase className="w-5 h-5" />;
      case 'Utensils': return <Utensils className="w-5 h-5" />;
      case 'Award': return <Award className="w-5 h-5" />;
      default: return <Layers className="w-5 h-5" />;
    }
  };

  const handleLaunchModalForSource = (sourceId: string) => {
    setSelectedSourceId(sourceId);
    setIsCreateJobOpen(true);
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobKeyword.trim() && !jobLocation.trim()) {
      setFormError('Please enter a search keyword, category, or target location.');
      return;
    }

    try {
      setIsSubmittingJob(true);
      setFormError(null);
      const created = await api.extractionJobs.create({
        source: selectedSourceId,
        keyword: jobKeyword.trim(),
        location: jobLocation.trim(),
        requested_count: jobCount
      });

      setJobs([created, ...jobs]);
      setIsCreateJobOpen(false);
      setJobKeyword('');
      setJobLocation('');
    } catch (err: any) {
      setFormError(err.message || 'Failed to initialize extraction job.');
    } finally {
      setIsSubmittingJob(false);
    }
  };

  const handleStartJob = async (jobId: string) => {
    try {
      const updated = await api.extractionJobs.start(jobId);
      setJobs(jobs.map((j) => (j.id === jobId ? updated : j)));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handlePauseJob = async (jobId: string) => {
    try {
      const updated = await api.extractionJobs.pause(jobId);
      setJobs(jobs.map((j) => (j.id === jobId ? updated : j)));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResumeJob = async (jobId: string) => {
    try {
      const updated = await api.extractionJobs.resume(jobId);
      setJobs(jobs.map((j) => (j.id === jobId ? updated : j)));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      const updated = await api.extractionJobs.cancel(jobId);
      setJobs(jobs.map((j) => (j.id === jobId ? updated : j)));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!window.confirm('Delete this extraction job record?')) return;
    try {
      await api.extractionJobs.delete(jobId);
      setJobs(jobs.filter((j) => j.id !== jobId));
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 rounded-2xl p-6 sm:p-8 text-white shadow-xl shadow-emerald-950/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 z-10 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-white/20 backdrop-blur-md border border-white/20">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            MULTI-SOURCE LEAD INTELLIGENCE ENGINE
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            Extraction Hub & Marketplace
          </h1>
          <p className="text-emerald-100 text-xs sm:text-sm leading-relaxed">
            Prospect business leads from Google Maps, corporate websites, B2B directories, and company registries. Synchronize thousands of verified contacts directly to your dashboard.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 z-10 shrink-0">
          <button
            onClick={() => setIsPairingOpen(true)}
            className="px-4 py-2.5 bg-white text-emerald-950 hover:bg-emerald-50 active:bg-emerald-100 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg"
          >
            <Chrome className="w-4 h-4 text-emerald-600" />
            Connect Chrome Extension
          </button>

          {onNavigateToLeads && (
            <button
              onClick={onNavigateToLeads}
              className="px-4 py-2.5 bg-emerald-800/60 hover:bg-emerald-800 text-white border border-white/20 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              View Extracted Leads
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Decorative backdrop glow */}
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 rounded-full bg-emerald-400/20 blur-3xl pointer-events-none"></div>
      </div>

      {/* SECTION 1: EXTRACTION MARKETPLACE */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Supported Extraction Connectors</h2>
            <p className="text-xs text-slate-500">Modular prospecting engines configured for specialized lead pipelines.</p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            {sources.length} Active Connectors
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sources.map((src) => (
            <div
              key={src.id}
              className="bg-white border border-slate-200/80 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-md transition flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition shadow-sm">
                    {getSourceIcon(src.icon || 'Layers')}
                  </div>
                  {src.badge && (
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {src.badge}
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition">
                    {src.name}
                  </h3>
                  <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">{src.category}</span>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {src.description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1 pt-1">
                  {(src.supported_fields || []).slice(0, 4).map((f) => (
                    <span
                      key={f}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-100"
                    >
                      {f.replace(/_/g, ' ')}
                    </span>
                  ))}
                  {(src.supported_fields || []).length > 4 && (
                    <span className="text-[10px] font-semibold text-slate-400 px-1 py-0.5">
                      +{(src.supported_fields || []).length - 4} more
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => setIsPairingOpen(true)}
                  className="text-xs font-semibold text-slate-500 hover:text-emerald-600 flex items-center gap-1"
                >
                  <Chrome className="w-3.5 h-3.5" /> Extension Mode
                </button>

                <button
                  onClick={() => handleLaunchModalForSource(src.id)}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Launch Job
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 2: EXTRACTION JOB MANAGER */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Extraction Job Manager & Progress</h2>
            <p className="text-xs text-slate-500">Live orchestration of ongoing background tasks and extraction history.</p>
          </div>
          <button
            onClick={() => handleLaunchModalForSource('google_maps')}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> New Extraction Job
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Extraction Jobs Yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Start an extraction job from any of the connectors above or use your browser extension to pull leads directly into your dashboard.
            </p>
            <button
              onClick={() => handleLaunchModalForSource('google_maps')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              Start Google Maps Extraction
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Extraction Source</th>
                    <th className="py-3 px-4">Search Target</th>
                    <th className="py-3 px-4">Progress & Yield</th>
                    <th className="py-3 px-4">Duplicates</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <span className="capitalize">{job.source.replace(/_/g, ' ')}</span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{job.keyword || 'General'}</div>
                        <div className="text-[11px] text-slate-400">{job.location || 'Worldwide'}</div>
                      </td>

                      <td className="py-3 px-4 min-w-[180px]">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1">
                          <span>{job.collected_count} / {job.requested_count} leads</span>
                          <span>{job.current_progress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                            style={{ width: `${job.current_progress}%` }}
                          ></div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-500 font-medium">
                        {job.duplicate_count} skipped
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                            job.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : job.status === 'running'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
                              : job.status === 'paused'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : job.status === 'failed'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {job.status === 'running' && <RotateCw className="w-3 h-3 animate-spin" />}
                          {job.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-500">
                        {new Date(job.created_at).toLocaleDateString()}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {job.status === 'pending' && (
                            <button
                              onClick={() => handleStartJob(job.id)}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-emerald-600 transition"
                              title="Start Job"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          {job.status === 'running' && (
                            <button
                              onClick={() => handlePauseJob(job.id)}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-amber-600 transition"
                              title="Pause Job"
                            >
                              <Pause className="w-4 h-4" />
                            </button>
                          )}
                          {job.status === 'paused' && (
                            <button
                              onClick={() => handleResumeJob(job.id)}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-emerald-600 transition"
                              title="Resume Job"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          {(job.status === 'running' || job.status === 'paused') && (
                            <button
                              onClick={() => handleCancelJob(job.id)}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-rose-500 transition"
                              title="Cancel Job"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteJob(job.id)}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-600 transition"
                            title="Delete Record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* CREATE JOB MODAL */}
      {isCreateJobOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                Launch Extraction Job
              </h3>
              <button
                onClick={() => setIsCreateJobOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateJob} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">Extraction Source</label>
                <select
                  value={selectedSourceId}
                  onChange={(e) => setSelectedSourceId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 outline-none focus:border-emerald-500"
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">Search Keyword / Category</label>
                <input
                  type="text"
                  value={jobKeyword}
                  onChange={(e) => setJobKeyword(e.target.value)}
                  placeholder="e.g. Real Estate Agents, Digital Marketing, Dental Clinic"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">Target Location / City</label>
                <input
                  type="text"
                  value={jobLocation}
                  onChange={(e) => setJobLocation(e.target.value)}
                  placeholder="e.g. Dubai, Mumbai, New York, London"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">Requested Lead Count</label>
                <select
                  value={jobCount}
                  onChange={(e) => setJobCount(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 outline-none focus:border-emerald-500"
                >
                  <option value={25}>25 leads</option>
                  <option value={50}>50 leads</option>
                  <option value={100}>100 leads</option>
                  <option value={250}>250 leads</option>
                  <option value={500}>500 leads</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateJobOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingJob}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-semibold transition shadow-sm"
                >
                  {isSubmittingJob ? 'Initializing...' : 'Create Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXTENSION PAIRING MODAL */}
      <ExtensionPairingModal isOpen={isPairingOpen} onClose={() => setIsPairingOpen(false)} />
    </div>
  );
};

