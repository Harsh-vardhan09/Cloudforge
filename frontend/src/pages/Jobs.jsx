import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import {
  Square, Terminal as TerminalIcon, RefreshCw, XCircle, Loader2, PlayCircle, Download,
  Bot, Sparkles, AlertCircle, CheckCircle2, ArrowRight, Copy, Check, ExternalLink, Wrench, Network
} from 'lucide-react';
import api from '../services/api';
import JobLaunchModal from '../components/JobLaunchModal';
import JobMigrationGraph from '../components/JobMigrationGraph';

const AiExplainerModal = ({ jobId, onClose, onRelaunchWithFix }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchExplanation = async () => {
      try {
        setLoading(true);
        setError('');
        const resp = await api.post('/ai/explain-failure', { jobId });
        setAnalysis(resp.data);
      } catch (err) {
        console.error('Failed to get AI explanation:', err);
        setError(err.response?.data?.message || 'Could not analyze job failure. Ensure logs exist.');
      } finally {
        setLoading(false);
      }
    };
    if (jobId) {
      fetchExplanation();
    }
  }, [jobId]);

  const handleCopySummary = () => {
    if (!analysis) return;
    const text = `GPU Job Failure Diagnosis (${jobId}):
Error: ${analysis.errorType}
Summary: ${analysis.summary}
Root Cause: ${analysis.rootCauseSnippet}
Recommended Fixes:
${(analysis.fixes || []).map((f) => `- ${f}`).join('\n')}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  return (
    <Motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-2xl bg-[#0d1117] rounded-2xl flex flex-col shadow-[0_30px_70px_rgba(0,0,0,0.95)] z-[1002] border border-purple-500/30 overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-primary" />

      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between bg-white/[0.02] border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-purple-500/20 text-purple-400 rounded-lg">
            <Bot size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              AI Failure Diagnostic
              <span className="text-[0.65rem] px-2 py-0.5 rounded font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Module 9
              </span>
            </h3>
            <p className="text-xs text-text-dim font-mono">Job ID: {jobId?.substring(0, 12)}...</p>
          </div>
        </div>
        <button className="text-text-dim hover:text-white p-1 rounded-lg hover:bg-white/5" onClick={onClose}>
          <XCircle size={20} />
        </button>
      </div>

      {/* Body */}
      <div className="p-6 overflow-y-auto max-h-[70vh] flex flex-col gap-5 text-sm leading-relaxed">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-text-dim">
            <Loader2 className="animate-spin text-purple-400" size={36} />
            <p className="font-medium text-white">AI is reading logs and pinpointing root cause...</p>
            <p className="text-xs text-text-dim">Checking CUDA allocations, missing dependencies, and exit signals</p>
          </div>
        ) : error ? (
          <div className="p-4 bg-error/10 border border-error/20 rounded-xl text-error text-center flex flex-col items-center gap-2">
            <AlertCircle size={24} />
            <p>{error}</p>
          </div>
        ) : analysis ? (
          <>
            {/* Classification & Summary */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getSeverityBadge(analysis.severity)}`}>
                  {analysis.errorType || 'Runtime Failure'}
                </span>
                <span className="text-xs text-text-dim">Severity: <strong className="uppercase text-white">{analysis.severity || 'high'}</strong></span>
              </div>
              <p className="text-white text-[0.95rem] font-medium leading-relaxed bg-white/[0.02] p-3.5 rounded-xl border border-white/5">
                {analysis.summary}
              </p>
            </div>

            {/* Root Cause snippet */}
            {analysis.rootCauseSnippet && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Identified Root Cause Snippet</span>
                <div className="p-3 bg-black/60 rounded-xl border border-white/10 font-mono text-xs text-red-400 overflow-x-auto whitespace-pre-wrap">
                  {analysis.rootCauseSnippet}
                </div>
              </div>
            )}

            {/* Recommended fixes */}
            {analysis.fixes && analysis.fixes.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-text-dim uppercase tracking-wider flex items-center gap-1.5">
                  <Wrench size={14} className="text-primary" /> Recommended Solutions
                </span>
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col gap-2">
                  {analysis.fixes.map((fix, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-[#c9d1d9]">
                      <span className="text-success font-bold mt-0.5">•</span>
                      <span>{fix}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <button
                onClick={handleCopySummary}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-text-dim hover:text-white flex items-center gap-1.5 transition-all"
              >
                {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                {copied ? 'Copied Diagnostic' : 'Copy Report'}
              </button>

              <button
                onClick={() => onRelaunchWithFix(analysis)}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-primary text-white text-xs font-bold flex items-center gap-2 hover:opacity-95 shadow-glow transition-all"
              >
                <Sparkles size={14} />
                Fix & Re-launch Container <ArrowRight size={14} />
              </button>
            </div>
          </>
        ) : null}
      </div>
    </Motion.div>
  );
};

const LogTerminal = ({ jobId, job, onClose, onOpenAiExplainer }) => {
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState(job?.status || 'loading');

  useEffect(() => {
    const backendBase = import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://localhost:5000';
    // EventSource cannot set headers, so the stream takes the JWT as a query param.
    const streamToken = localStorage.getItem('token') || '';
    const eventSource = new EventSource(
      `${backendBase}/api/jobs/${jobId}/stream?token=${encodeURIComponent(streamToken)}`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.line) {
          setLogs(prev => [...prev, data.line]);
        }
        if (data.done) {
          setStatus(data.status);
          eventSource.close();
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
      eventSource.close();
    };

    return () => eventSource.close();
  }, [jobId]);

  return (
    <Motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-4xl h-[560px] bg-[#0d1117] rounded-2xl flex flex-col shadow-[0_30px_70px_rgba(0,0,0,0.95)] z-[1000] border border-white/10 overflow-hidden"
    >
      <div className="px-5 py-3.5 flex items-center justify-between bg-white/[0.03] border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          <span className="text-xs font-semibold text-text-dim font-mono">Job: {jobId}</span>
          <span className={`px-2 py-0.5 rounded text-[0.65rem] font-extrabold uppercase ${
            status === 'running' ? 'bg-success/10 text-success animate-pulse' :
            status === 'completed' ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'
          }`}>
            {status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* AI Explainer button when failed */}
          {status === 'failed' && (
            <button
              onClick={() => onOpenAiExplainer(jobId)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600/30 text-purple-300 border border-purple-500/50 hover:bg-purple-600 hover:text-white transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(168,85,247,0.3)]"
            >
              <Bot size={14} className="animate-pulse" />
              Explain Crash with AI
            </button>
          )}
          <button className="text-text-dim hover:text-white p-1 rounded-lg hover:bg-white/5" onClick={onClose}>
            <XCircle size={18} />
          </button>
        </div>
      </div>

      <div className="p-4 flex-1 overflow-y-auto font-mono text-[0.82rem] leading-relaxed text-[#c9d1d9] bg-black/40">
        {logs.length === 0 && <div className="text-text-dim animate-pulse">Connecting to live container output stream...</div>}
        {logs.map((log, i) => (
          <div key={i} className="flex gap-3 mb-1">
            <span className="opacity-30 whitespace-nowrap text-[0.75rem]">[{i}]</span>
            <span className={log.includes('❌') || log.includes('Error') || log.includes('error') ? 'text-red-400 font-semibold' : ''}>
              {log}
            </span>
          </div>
        ))}
        {status === 'running' && <div className="inline-block w-2 h-4 bg-primary align-middle animate-pulse ml-1" />}
      </div>
    </Motion.div>
  );
};

const Jobs = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [migrationModalJob, setMigrationModalJob] = useState(null);
  const [explainingJobId, setExplainingJobId] = useState(null);
  const [downloadingJobId, setDownloadingJobId] = useState(null);

  // Re-launch with AI fix state
  const [relaunchModalGpu, setRelaunchModalGpu] = useState(null);
  const [relaunchConfig, setRelaunchConfig] = useState(null);

  const fetchJobs = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const response = await api.get('/jobs');
      setJobs(response.data);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(() => fetchJobs(false), 15000);
    const token = localStorage.getItem('token');
    const backendUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
    const socket = token ? io(backendUrl, { auth: { token } }) : null;
    socket?.on('job:progress', ({ jobId, progress }) => {
      setJobs((current) => current.map((job) =>
        job._id === jobId ? { ...job, progress } : job
      ));
    });
    socket?.on('job:status', () => fetchJobs(false));
    socket?.on('connect_error', (error) => {
      console.error('Job monitoring connection failed:', error.message);
    });
    return () => {
      clearInterval(interval);
      socket?.disconnect();
    };
  }, []);

  const handleRelaunchWithFix = (analysis) => {
    const job = jobs.find(j => j._id === explainingJobId);
    setExplainingJobId(null);
    setSelectedJob(null);

    setRelaunchConfig({
      command: analysis.suggestedCommand || job?.command,
      dockerImage: analysis.suggestedDockerImage || job?.dockerImage,
      vramRequired: (job?.vramRequired || 8) * (analysis.suggestedVramMultiplier || 1.0),
    });
    setRelaunchModalGpu(job?.gpu || { model: 'Auto-Matched GPU', vram: 8 });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-primary" size={48} />
        <span className="text-text-dim font-medium">Fetching your compute jobs...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="glass-card relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full border border-primary/10 shadow-[0_0_0_34px_rgba(197,243,106,0.025)]" />
        <div className="relative z-[1] flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">Workload control</span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Your compute jobs</h2>
          <p className="mt-2 text-sm text-text-dim">Follow live execution, inspect output, and diagnose failures.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/migration')}
            className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs font-semibold text-amber-300 transition-all hover:bg-amber-500/20 shadow-glow"
          >
            <Network size={14} /> Migration Graph
          </button>
          <button
            onClick={fetchJobs}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs font-semibold text-white transition-all hover:bg-white/[0.08]"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        </div>
        <div className="relative z-[1] mt-6 grid grid-cols-3 gap-2 sm:max-w-lg sm:gap-3">
          {[
            { label: 'Running', count: jobs.filter((job) => job.status === 'running').length, tone: 'text-success' },
            { label: 'Queued', count: jobs.filter((job) => job.status === 'queued').length, tone: 'text-accent' },
            { label: 'Completed', count: jobs.filter((job) => job.status === 'completed').length, tone: 'text-primary' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/[0.07] bg-black/15 px-3 py-3">
              <span className="block font-mono text-[0.58rem] uppercase tracking-wider text-text-dim">{item.label}</span>
              <span className={`mt-1 block text-xl font-semibold ${item.tone}`}>{item.count}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3 sm:px-5">
          <span className="text-sm font-medium text-white">Deployment activity</span>
          <span className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim">Auto-refresh · 15 sec</span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[860px] p-2 sm:p-3">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center text-text-dim">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/10 bg-primary/[0.05] text-primary/60">
              <PlayCircle size={30} />
            </div>
            <div>
              <p className="text-base font-semibold text-white">No workloads yet</p>
              <p className="mt-1 text-sm">Submit a job from the marketplace to see it here.</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="border-b border-white/[0.07] p-3 text-[0.62rem] font-semibold uppercase tracking-wider text-text-dim">ID</th>
                <th className="border-b border-white/[0.07] p-3 text-[0.62rem] font-semibold uppercase tracking-wider text-text-dim">Status</th>
                <th className="border-b border-white/[0.07] p-3 text-[0.62rem] font-semibold uppercase tracking-wider text-text-dim">GPU resource</th>
                <th className="border-b border-white/[0.07] p-3 text-[0.62rem] font-semibold uppercase tracking-wider text-text-dim">Launched at</th>
                <th className="border-b border-white/[0.07] p-3 text-[0.62rem] font-semibold uppercase tracking-wider text-text-dim">Cost</th>
                <th className="border-b border-white/[0.07] p-3 text-[0.62rem] font-semibold uppercase tracking-wider text-text-dim">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {jobs.map((job) => (
                <tr key={job._id} className="group transition-colors hover:bg-white/[0.025]">
                  <td className="p-3 font-mono text-xs text-primary/80">
                    {job._id.substring(0, 8)}...
                  </td>
                  <td className="p-3">
                    <span className={`px-2.5 py-1 rounded-md text-[0.7rem] font-bold uppercase border
                      ${job.status === 'queued' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse' :
                        job.status === 'saving_checkpoint' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse' :
                        job.status === 'migrating' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 animate-pulse' :
                        job.status === 'running' && job.reclaimed ? 'bg-success/20 text-emerald-300 border-emerald-500/40' :
                        job.status === 'running' ? 'bg-success/10 text-success border-success/20' :
                        job.status === 'completed' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-error/10 text-error border-error/20'}`}>
                      {job.status === 'saving_checkpoint' ? 'Checkpointing' :
                       job.status === 'migrating' ? 'Migrating' :
                       job.status === 'running' && job.reclaimed ? 'Running (Resumed)' :
                       job.status}
                    </span>
                    {job.progress?.total > 0 && (
                      <div className="mt-2 min-w-32">
                        <div className="mb-1 flex justify-between gap-2 text-[10px] text-text-dim">
                          <span className="max-w-28 truncate">{job.progress.message || 'Progress'}</span>
                          <span>{Math.round((job.progress.step / job.progress.total) * 100)}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.min(100, (job.progress.step / job.progress.total) * 100)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] text-text-dim">
                          Step {job.progress.step} / {job.progress.total}
                        </p>
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-sm text-text-dim">
                    <div className="flex flex-col">
                      <span>{job.gpu?.model || (job.status === 'queued' ? 'Awaiting Idle Worker' : 'Provisioning...')}</span>
                      {job.scriptName && (
                        <span className="text-[0.65rem] text-primary font-mono truncate max-w-[180px]">
                          📄 {job.scriptName}
                        </span>
                      )}
                      {job.reclaimed && (
                        <span className="text-[0.65rem] text-amber-400 font-mono">
                          • Migrated from host
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-xs text-text-dim">{new Date(job.createdAt).toLocaleString()}</td>
                  <td className="p-3 font-mono text-sm font-medium text-success">${job.billingCost || 0}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {job.status === 'completed' && job.outputReady && (
                        <button
                          onClick={async () => {
                            try {
                              setDownloadingJobId(job._id);
                              const { data } = await api.get(`/jobs/${job._id}/result`);
                              const link = document.createElement('a');
                              link.href = data.downloadUrl;
                              link.download = `${job._id}-output.zip`;
                              link.rel = 'noopener';
                              document.body.appendChild(link);
                              link.click();
                              link.remove();
                            } catch (err) {
                              alert(err.response?.data?.message || 'Could not download job output.');
                            } finally {
                              setDownloadingJobId(null);
                            }
                          }}
                          disabled={downloadingJobId === job._id}
                          title="Download job output"
                          className="h-8 px-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary flex items-center gap-1.5 hover:bg-primary/20 transition-all text-xs disabled:opacity-50"
                        >
                          {downloadingJobId === job._id
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Download size={14} />}
                          Download
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedJob(job)}
                        title="View Live Logs"
                        className="h-8 px-2.5 rounded-lg bg-surface-hover border border-white/10 text-text-dim flex items-center gap-1.5 hover:bg-white/10 hover:text-white transition-all text-xs"
                      >
                        <TerminalIcon size={14} />
                        Logs
                      </button>

                      <button
                        onClick={() => setMigrationModalJob(job)}
                        title="View Migration Graph (Node A → Storage → Node B)"
                        className="h-8 px-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1.5 hover:bg-amber-500/20 hover:text-white transition-all text-xs"
                      >
                        <Network size={14} />
                        Migration
                      </button>

                      {job.status === 'failed' && (
                        <button
                          onClick={() => setExplainingJobId(job._id)}
                          title="Explain Crash with AI"
                          className="h-8 px-2.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center gap-1.5 hover:bg-purple-500/20 hover:text-purple-300 transition-all text-xs font-semibold"
                        >
                          <Bot size={14} />
                          AI Explain
                        </button>
                      )}
                      
                      {job.status === 'queued' && (
                        <button
                          onClick={async () => {
                            try {
                              if (confirm('Are you sure you want to cancel this queued job?')) {
                                await api.delete(`/jobs/${job._id}`);
                                fetchJobs();
                              }
                            } catch (err) {
                              alert(err.response?.data?.message || 'Failed to cancel job');
                            }
                          }}
                          title="Cancel Job"
                          className="h-8 px-2.5 rounded-lg bg-error/10 border border-error/30 text-error flex items-center gap-1.5 hover:bg-error/20 transition-all text-xs"
                        >
                          <XCircle size={14} />
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
          </div>
        </div>
      </div>

      {/* Terminal Modal */}
      <AnimatePresence>
        {selectedJob && (
          <>
            <Motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[999]"
              onClick={() => setSelectedJob(null)}
            />
            <LogTerminal
              jobId={selectedJob._id}
              job={selectedJob}
              onClose={() => setSelectedJob(null)}
              onOpenAiExplainer={(id) => setExplainingJobId(id)}
            />
          </>
        )}
      </AnimatePresence>

      {/* AI Failure Explainer Modal */}
      <AnimatePresence>
        {explainingJobId && (
          <>
            <Motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[1001]"
              onClick={() => setExplainingJobId(null)}
            />
            <AiExplainerModal
              jobId={explainingJobId}
              onClose={() => setExplainingJobId(null)}
              onRelaunchWithFix={handleRelaunchWithFix}
            />
          </>
        )}
      </AnimatePresence>

      {/* Re-launch Modal with AI Fix applied */}
      <AnimatePresence>
        {relaunchModalGpu && (
          <JobLaunchModal
            gpu={relaunchModalGpu}
            initialConfig={relaunchConfig}
            onClose={() => {
              setRelaunchModalGpu(null);
              setRelaunchConfig(null);
            }}
            onSuccess={() => {
              setRelaunchModalGpu(null);
              setRelaunchConfig(null);
              fetchJobs();
            }}
          />
        )}
      </AnimatePresence>

      {/* Migration Graph Modal */}
      <AnimatePresence>
        {migrationModalJob && (
          <div className="fixed inset-0 z-[1050] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
            <div className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[#0a0d13] border border-white/20 p-2 sm:p-4 shadow-2xl">
              <button
                onClick={() => setMigrationModalJob(null)}
                className="absolute top-4 right-4 z-30 p-2 text-text-dim hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-all"
                title="Close Graph"
              >
                <XCircle size={20} />
              </button>
              <JobMigrationGraph initialJobId={migrationModalJob._id} autoStart={false} />
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Jobs;
