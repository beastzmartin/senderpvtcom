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
  const [autoLaunchBrowser, setAutoLaunchBrowser] = useState<boolean>(true);
  const [isSubmittingJob, setIsSubmittingJob] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const buildTargetExtractionUrl = (
    sourceId: string,
    keyword: string,
    location: string,
    count: number,
    jobId?: string
  ) => {
    const kw = (keyword || '').trim();
    const loc = (location || '').trim();
    const combined = kw && loc ? `${kw} in ${loc}` : (kw || loc || 'local businesses');
    const encoded = encodeURIComponent(combined);
    const hash = `#auto_extract=${count || 50}${jobId ? `&job_id=${jobId}` : ''}`;

    switch (sourceId) {
      case 'google_maps':
        return `https://www.google.com/maps/search/${encoded}${hash}`;
      case 'justdial':
        return `https://www.justdial.com/${encodeURIComponent(loc || 'Delhi')}/${encodeURIComponent(kw || 'All')}${hash}`;
      case 'indiamart':
        return `https://dir.indiamart.com/search.mp?ss=${encoded}${hash}`;
      case 'yellowpages':
        return `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(kw)}&geo_location_terms=${encodeURIComponent(loc)}${hash}`;
      case 'yelp':
        return `https://www.yelp.com/search?find_desc=${encodeURIComponent(kw)}&find_loc=${encodeURIComponent(loc)}${hash}`;
      case 'linkedin_sales':
        return `https://www.linkedin.com/search/results/companies/?keywords=${encoded}`;
      case 'website_extractor':
        if (kw.startsWith('http://') || kw.startsWith('https://')) return kw;
        if (kw.includes('.')) return `https://${kw}`;
        return `https://www.google.com/search?q=${encoded}`;
      default:
        return `https://www.google.com/maps/search/${encoded}${hash}`;
    }
  };

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
        requested_count: Number(jobCount) || 50
      });

      setJobs([created, ...jobs]);
      setIsCreateJobOpen(false);

      if (autoLaunchBrowser) {
        const targetUrl = buildTargetExtractionUrl(
          selectedSourceId,
          jobKeyword,
          jobLocation,
          jobCount,
          created.id
        );
        window.open(targetUrl, '_blank');
      }

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
      const job = jobs.find((j) => j.id === jobId);
      const updated = await api.extractionJobs.start(jobId);
      setJobs(jobs.map((j) => (j.id === jobId ? updated : j)));

      // Automatically launch Google Maps and trigger extraction in browser!
      const targetUrl = buildTargetExtractionUrl(
        'google_maps',
        job?.keyword || '',
        job?.location || '',
        job?.requested_count || 50,
        jobId
      );
      window.open(targetUrl, '_blank');
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
      const job = jobs.find((j) => j.id === jobId);
      const updated = await api.extractionJobs.resume(jobId);
      setJobs(jobs.map((j) => (j.id === jobId ? updated : j)));

      // Re-open Google Maps to continue scraping
      const targetUrl = buildTargetExtractionUrl(
        'google_maps',
        job?.keyword || '',
        job?.location || '',
        job?.requested_count || 50,
        jobId
      );
      window.open(targetUrl, '_blank');
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
      {/* Top Banner - Focused strictly on Google Maps Lead Extractor */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 rounded-2xl p-6 sm:p-8 text-white shadow-xl shadow-emerald-950/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 z-10 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-white/20 backdrop-blur-md border border-white/20">
            <MapPin className="w-3.5 h-3.5 text-amber-300" />
            GOOGLE MAPS LEAD EXTRACTOR PRO
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            Google Maps Lead Extraction Studio
          </h1>
          <p className="text-emerald-100 text-xs sm:text-sm leading-relaxed">
            Extract verified business names, direct phone numbers, full addresses, ratings, reviews, and websites straight from Google Maps directly into your CRM with automatic background cloud sync.
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
              View Extracted Leads CRM
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Decorative backdrop glow */}
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 rounded-full bg-emerald-400/20 blur-3xl pointer-events-none"></div>
      </div>

      {/* SECTION 1: GOOGLE MAPS INSTANT EXTRACTION CONSOLE */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm hover:shadow-md transition space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-600" />
                Launch Google Maps Lead Prospector
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Type your target category and location. Clicking Start automatically opens Google Maps in a new tab and begins extracting leads immediately.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const sampleUrl = buildTargetExtractionUrl('google_maps', jobKeyword || 'Restaurants', jobLocation || 'Dubai', jobCount);
                window.open(sampleUrl, '_blank');
              }}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
              Open Live Google Maps
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleCreateJob} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-4">
            <label className="text-xs font-bold text-slate-700 mb-1.5 block">
              Business Category / Keyword
            </label>
            <input
              type="text"
              value={jobKeyword}
              onChange={(e) => setJobKeyword(e.target.value)}
              placeholder="e.g. Dentists, Real Estate Agents, Cafes, Digital Agencies"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-emerald-500 transition"
              required
            />
          </div>

          <div className="md:col-span-4">
            <label className="text-xs font-bold text-slate-700 mb-1.5 block">
              Target City / Location / Region
            </label>
            <input
              type="text"
              value={jobLocation}
              onChange={(e) => setJobLocation(e.target.value)}
              placeholder="e.g. Dubai, New York, Mumbai, London, Toronto"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-emerald-500 transition"
              required
            />
          </div>

          <div className="md:col-span-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">Lead Target Count</label>
              <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                {jobCount} Leads
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={10000}
                value={jobCount}
                onChange={(e) => setJobCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-emerald-500"
              />
              <div className="flex items-center gap-1 overflow-x-auto">
                {[50, 100, 250, 500, 1000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setJobCount(preset)}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition ${
                      jobCount === preset
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="md:col-span-12 pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={autoLaunchBrowser}
                onChange={(e) => setAutoLaunchBrowser(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 border-slate-300"
              />
              <span>Automatically open Google Maps & start scraping leads immediately</span>
            </label>

            <button
              type="submit"
              disabled={isSubmittingJob}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-extrabold transition shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isSubmittingJob ? 'Launching...' : '🚀 Start Google Maps Scraping'}</span>
            </button>
          </div>
        </form>
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
                          <button
                            onClick={() => {
                              const targetUrl = buildTargetExtractionUrl(
                                job.source,
                                job.keyword || '',
                                job.location || '',
                                job.requested_count,
                                job.id
                              );
                              window.open(targetUrl, '_blank');
                            }}
                            className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 hover:text-emerald-700 transition"
                            title="Open & Auto-Extract in Browser"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                          {onNavigateToLeads && (
                            <button
                              onClick={onNavigateToLeads}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-blue-600 hover:text-blue-700 transition"
                              title="View Extracted Leads in CRM"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          )}
                          {job.status === 'pending' && (
                            <button
                              onClick={() => handleStartJob(job.id)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs"
                              title="Start Scraping on Google Maps"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Start Scrape</span>
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
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs"
                              title="Resume Scraping on Google Maps"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Resume</span>
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
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Google Maps Lead Extractor</div>
                  <div className="text-[10px] text-emerald-700 font-semibold">Verified Contact & Local Business Discovery Engine</div>
                </div>
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
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">Requested Lead Count</label>
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    {jobCount} leads target
                  </span>
                </div>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={jobCount}
                  onChange={(e) => setJobCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  placeholder="Enter custom count, e.g. 150"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 mb-2"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {[25, 50, 100, 250, 500, 1000, 2500].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setJobCount(preset)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition ${
                        jobCount === preset
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer bg-slate-50 p-2.5 rounded-xl border border-slate-200 hover:bg-emerald-50/50 hover:border-emerald-200 transition">
                  <input
                    type="checkbox"
                    checked={autoLaunchBrowser}
                    onChange={(e) => setAutoLaunchBrowser(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 border-slate-300"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 block">Auto-Launch & Extract Immediately</span>
                    <span className="text-slate-500 text-[11px]">
                      Opens Google Maps / target platform in a new tab with your search criteria and automatically starts lead extraction.
                    </span>
                  </div>
                </label>
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

