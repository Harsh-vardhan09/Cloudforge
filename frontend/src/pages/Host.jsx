import React, { useState, useEffect } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import {
  Terminal, Shield, Cpu, Zap, Download, Copy, Check, DollarSign,
  RotateCcw, ArrowRight, Loader2, AlertTriangle, CheckCircle2, XCircle, HardDrive, Network
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

const ReclaimModal = ({ job, gpu, onClose, onSuccess }) => {
  const navigate = useNavigate();
  const [reclaiming, setReclaiming] = useState(false);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const stages = [
    "Confirm Reclaim",
    "Stopping the workload after its latest checkpoint was uploaded...",
    "GPU reclaimed. Restart the agent when you want to offer it again."
  ];

  const handleExecuteReclaim = async () => {
    try {
      setReclaiming(true);
      setError('');
      setStage(1);

      const resp = await api.post(`/jobs/${job._id}/reclaim`, { force: true });
      setResult(resp.data);
      setStage(2);

      setTimeout(() => {
        onSuccess(resp.data);
      }, 3500);
    } catch (err) {
      console.error('Reclaim error:', err);
      setError(err.response?.data?.message || 'Failed to reclaim GPU. Please try again.');
      setReclaiming(false);
      setStage(0);
    }
  };

  return (
    <Motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-lg bg-[#0d1117] rounded-2xl flex flex-col shadow-[0_30px_70px_rgba(0,0,0,0.95)] z-[1002] border border-amber-500/30 overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-primary" />

      <div className="px-6 py-4 flex items-center justify-between bg-white/[0.02] border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
            <RotateCcw size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Reclaim GPU & Checkpoint
              <span className="text-[0.65rem] px-2 py-0.5 rounded font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Module 8
              </span>
            </h3>
            <p className="text-xs text-text-dim">Take back your hardware using the job's latest saved checkpoint</p>
          </div>
        </div>
        {!reclaiming && (
          <button className="text-text-dim hover:text-white p-1 rounded-lg hover:bg-white/5" onClick={onClose}>
            <XCircle size={20} />
          </button>
        )}
      </div>

      <div className="p-6 flex flex-col gap-5 text-sm">
        {stage === 0 && (
          <>
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
              <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />
              <div className="text-xs leading-relaxed text-amber-200/90">
                <p className="font-semibold text-amber-300 mb-1">Host Reclaim Protocol</p>
                The workload must periodically save its state under CHECKPOINT_DIR. The agent uploads those files; Reclaim stops the container and puts the job back in the scheduler queue to resume on a compatible GPU.
              </div>
            </div>

            {!job?.checkpointData?.objectKey && (
              <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-xs leading-relaxed">
                <span className="font-semibold">No checkpoint has been saved yet.</span> Reclaiming
                now will requeue this job to start over from the beginning.
              </div>
            )}

            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col gap-2">
              <div className="flex justify-between text-xs">
                <span className="text-text-dim">Your Hardware:</span>
                <span className="font-bold text-white">{gpu?.model} ({gpu?.vram}GB)</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-dim">Customer Workload:</span>
                <span className="font-mono text-primary truncate max-w-[220px]">{job?.dockerImage}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-dim">Current State:</span>
                <span className="text-success font-semibold">Running</span>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-xs text-center">
                {error}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-text-dim hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteReclaim}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white text-xs font-bold flex items-center gap-2 hover:opacity-95 shadow-glow transition-all"
              >
                <RotateCcw size={15} />
                Confirm Reclaim & Queue Resume
              </button>
            </div>
          </>
        )}

        {stage > 0 && (
          <div className="py-6 flex flex-col items-center justify-center gap-4 text-center">
            {stage < 2 ? (
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <HardDrive size={22} className="text-amber-400 animate-pulse" />
                </div>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-success/20 border-2 border-success text-success flex items-center justify-center">
                <CheckCircle2 size={36} />
              </div>
            )}

            <div className="flex flex-col gap-1 max-w-sm">
              <h4 className="text-base font-bold text-white">
                {stage === 2 ? "Reclaim Succeeded!" : "Executing Checkpoint Reclaim"}
              </h4>
              <p className="text-xs text-text-dim">
                {stages[stage]}
              </p>
            </div>

            {stage === 2 && result && (
              <div className="w-full bg-white/[0.02] border border-white/5 rounded-xl p-3 text-xs flex flex-col gap-1.5 text-left">
                <div className="flex justify-between">
                  <span className="text-text-dim">Reclaimed Node:</span>
                  <span className="text-success font-semibold">{result.reclaimedGpu?.model} (Scheduling paused)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim">Resume Assignment:</span>
                  <span className="text-primary font-semibold">Waiting for scheduler</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim">Saved Progress:</span>
                  {result.progressPreserved === false ? (
                    <span className="text-error font-semibold">None — restarting from scratch</span>
                  ) : (
                    <span className="text-white font-mono">
                      {result.checkpoint?.totalSteps
                        ? `Step ${result.checkpoint.step}/${result.checkpoint.totalSteps}`
                        : `Snapshot ${result.checkpoint?.sequence ?? 0}`}
                    </span>
                  )}
                </div>
              </div>
            )}

            {stage === 2 && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/migration');
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 via-orange-500 to-primary text-white text-xs font-bold flex items-center justify-center gap-2 hover:opacity-95 shadow-glow transition-all"
              >
                <Network size={15} />
                Watch Migration Graph (Node A → Storage → Node B)
              </button>
            )}
          </div>
        )}
      </div>
    </Motion.div>
  );
};

const Host = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [copied, setCopied] = useState(false);
  const [myGpu, setMyGpu] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingPrice, setEditingPrice] = useState(false);
  const [editingVram, setEditingVram] = useState(false);
  const [newPrice, setNewPrice] = useState('0.5');
  const [newVram, setNewVram] = useState('0');

  // Reclaim Modal state
  const [showReclaimModal, setShowReclaimModal] = useState(false);

  const fetchMyGpu = async () => {
    try {
      const resp = await api.get('/gpu/my');
      setMyGpu(resp.data);
      if (resp.data.status === 'busy') {
         const jobResp = await api.get('/jobs/host/active');
         setActiveJob(jobResp.data);
      } else {
         setActiveJob(null);
      }
    } catch (err) {
      console.info("No GPU registered yet:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSettings = async (updates) => {
    try {
      const resp = await api.patch('/gpu/settings', updates);
      setMyGpu(resp.data.gpu);
      setEditingPrice(false);
      setEditingVram(false);
      alert("Settings updated!");
    } catch (err) {
      console.error('Failed to update GPU settings:', err);
      alert("Failed to update settings");
    }
  };

  useEffect(() => {
    if (token) {
      fetchMyGpu();
      const interval = setInterval(fetchMyGpu, 10000); // refresh every 10s
      return () => clearInterval(interval);
    }
  }, [token]);

  const runCommand = `python main.py --token ${token || 'YOUR_TOKEN_HERE'}`;
  // Full first-run sequence; the Copy button yields something that actually works
  // on a clean machine rather than just the final command.
  const setupSteps = [
    'cd agent',
    'python -m venv .venv',
    '.venv\\Scripts\\activate',
    'pip install -r requirements.txt',
    runCommand,
  ];
  const command = setupSteps.join('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="animate-spin text-primary" size={36} />
        <span className="text-sm text-text-dim">Checking your host status...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="glass-card relative overflow-hidden p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border border-primary/10 shadow-[0_0_0_34px_rgba(197,243,106,0.025)]" />
        <div className="relative z-[1]">
        <span className="eyebrow">Contribute to the network</span>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Put your GPU to work.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-dim">
          Monetize your idle GPU capacity by joining our decentralized network. Run our lightweight agent to start earning $GSHARE tokens or USD.
        </p>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="glass-card border-primary/15 bg-primary/[0.035] p-5 sm:p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Terminal className="text-primary" size={20} />
              Quick Installation
            </h3>
            <p className="text-sm text-text-dim mb-4 leading-relaxed">
              Needs Python 3.11&ndash;3.13 and Docker running. An NVIDIA driver plus the
              Container Toolkit enables GPU jobs; without them the agent still runs CPU work.
            </p>
            <div className="bg-black/40 p-4 rounded-xl border border-white/10 font-mono text-[0.8rem] relative">
              <button
                onClick={handleCopy}
                className="absolute top-3 right-3 p-2 hover:bg-white/10 rounded-lg transition-all text-text-dim hover:text-white"
                title="Copy all steps"
              >
                {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
              </button>
              <div className="flex flex-col gap-1.5 pr-10">
                {setupSteps.map((step, index) => (
                  <div key={index} className="flex gap-2.5 min-w-0">
                    <span className="text-text-dim/50 select-none">$</span>
                    <code className="text-primary truncate">{step}</code>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[0.72rem] text-text-dim mt-3 leading-relaxed">
              On macOS or Linux use <code className="text-accent">source .venv/bin/activate</code> instead.
              To change your hourly rate, set <code className="text-accent font-bold">PRICE_PER_HOUR</code> in
              the agent's <code className="text-accent font-bold">.env</code>, or edit it below once the GPU appears.
            </p>
          </div>

          <div className="glass-card p-5 sm:p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Shield className="text-accent" size={20} />
              Personal Access Token
            </h3>
            <p className="text-[0.75rem] text-text-dim mb-4 leading-relaxed">
              Use this token manually if you are configuring the agent in <code className="text-accent font-bold">.env</code>.
            </p>
            <div className="bg-black/20 p-3 rounded-lg border border-white/5 flex items-center gap-3">
              <code className="text-[0.7rem] text-text-dim truncate flex-1">{token || 'Login to see token'}</code>
              <button
                 onClick={() => { navigator.clipboard.writeText(token); alert('Token copied!'); }}
                 className="p-1.5 hover:bg-white/5 rounded text-text-dim"
              >
                 <Copy size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="p-6 glass-card border-white/5 flex flex-col gap-3">
                <Shield size={24} className="text-accent" />
                <h4 className="font-bold text-sm">Secure Isolation</h4>
                <p className="text-[0.7rem] text-text-dim">Jobs run in hardened Docker containers with zero host filesystem access.</p>
             </div>
             <div className="p-6 glass-card border-white/5 flex flex-col gap-3">
                <Cpu size={24} className="text-secondary" />
                <h4 className="font-bold text-sm">Instant Reclaim</h4>
                <p className="text-[0.7rem] text-text-dim">Need your GPU back? Reclaim saves the latest checkpoint and pauses scheduling on this host.</p>
             </div>
          </div>
        </div>

        <div className="glass-card flex min-w-0 flex-col overflow-hidden">
          <div className="p-6 bg-white/[0.03] border-b border-white/5 flex items-center justify-between">
            <h3 className="font-bold">Active Host Metrics</h3>
            <span className={`px-2 py-0.5 rounded text-[0.6rem] font-bold uppercase tracking-widest ${myGpu ? 'bg-success/10 text-success animate-pulse' : 'bg-white/10 text-text-dim'}`}>
              {myGpu ? myGpu.status : 'Offline'}
            </span>
          </div>

          {myGpu ? (
            <div className="p-8 flex flex-col gap-6">
              <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="p-3 bg-primary/20 rounded-lg text-primary">
                  <Cpu size={24} />
                </div>
                <div>
                  <p className="text-xs text-text-dim font-bold uppercase tracking-wider">Detected Hardware</p>
                  <div className="flex flex-col gap-1">
                     <p className="text-lg font-bold">{myGpu.model} ({myGpu.vram}GB)</p>
                     <div className="flex items-center gap-2">
                        {editingVram ? (
                           <div className="flex items-center gap-2">
                              <input
                                type="number"
                                className="bg-white/10 border border-white/10 px-2 py-1 rounded w-20 text-[0.7rem] font-bold text-secondary focus:outline-none"
                                value={newVram}
                                onChange={(e) => setNewVram(e.target.value)}
                              />
                              <button onClick={() => handleUpdateSettings({ maxVram: newVram })} className="text-[0.6rem] text-success font-bold">SAVE</button>
                           </div>
                        ) : (
                           <button
                             onClick={() => { setEditingVram(true); setNewVram(myGpu.maxVram || myGpu.vram); }}
                             className="text-[0.6rem] text-text-dim border border-white/10 px-2 py-0.5 rounded hover:bg-white/5 transition-all"
                           >
                              Limit to {myGpu.maxVram || myGpu.vram}GB
                           </button>
                        )}
                     </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="p-3 bg-accent/20 rounded-lg text-accent">
                  <DollarSign size={24} />
                </div>
                <div>
                  <p className="text-xs text-text-dim font-bold uppercase tracking-wider">Current Rate</p>
                  <div className="flex items-center gap-2">
                    {editingPrice ? (
                       <div className="flex items-center gap-2">
                          <input
                             type="number"
                             className="bg-white/10 border border-white/10 px-2 py-1 rounded w-20 text-sm font-bold text-primary focus:outline-none focus:border-primary"
                             value={newPrice}
                             onChange={(e) => setNewPrice(e.target.value)}
                             step="0.1"
                          />
                          <button onClick={() => handleUpdateSettings({ pricePerHour: newPrice })} className="text-[0.6rem] bg-success/20 text-success px-2 py-1 rounded font-bold hover:bg-success/30">SAVE</button>
                          <button onClick={() => setEditingPrice(false)} className="text-[0.6rem] bg-white/10 text-white px-2 py-1 rounded font-bold">CANCEL</button>
                       </div>
                    ) : (
                       <>
                          <p className="text-lg font-bold">${myGpu.pricePerHour}/hr</p>
                          <button
                            onClick={() => { setEditingPrice(true); setNewPrice(myGpu.pricePerHour); }}
                            className="text-[0.6rem] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-bold hover:bg-accent/30 transition-all"
                          >
                             EDIT RATE
                          </button>
                       </>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                 <div className="text-center">
                    <p className="text-[0.6rem] text-text-dim uppercase font-bold">Utilization</p>
                    <p className="text-xl font-bold">{myGpu.metrics?.gpu_util || 0}%</p>
                 </div>
                 <div className="text-center">
                    <p className="text-[0.6rem] text-text-dim uppercase font-bold">Last Seen</p>
                    <p className="text-[0.7rem] font-bold text-success">
                       {new Date(myGpu.lastSeen).toLocaleTimeString()}
                    </p>
                 </div>
              </div>

              {/* Module 8: Active Job & Reclaim Card */}
              {activeJob && (
                <div className="mt-2 p-5 bg-gradient-to-br from-primary/15 via-orange-500/10 to-transparent rounded-2xl border border-primary/30 flex flex-col gap-3">
                   <div className="flex justify-between items-center">
                     <p className="text-[0.65rem] text-primary font-bold uppercase tracking-widest flex items-center gap-1.5">
                       <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                       Running Workload
                     </p>
                     <span className="text-[0.65rem] px-2 py-0.5 rounded bg-white/10 text-white font-mono">
                       {activeJob.checkpointData?.objectKey ? 'Checkpoint saved' : 'Waiting for checkpoint'}
                     </span>
                   </div>

                   <div className="flex flex-col gap-1 bg-black/40 p-3 rounded-xl border border-white/5">
                      <p className="text-xs font-mono text-white truncate">{activeJob.dockerImage}</p>
                      <p className="text-[0.65rem] text-text-dim">Customer: {activeJob.user?.name || 'Customer'}</p>
                   </div>

                   <div className="flex gap-2 pt-1">
                     <button
                       type="button"
                       onClick={() => setShowReclaimModal(true)}
                       className="flex-1 py-2.5 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:opacity-95 shadow-glow flex items-center justify-center gap-2 transition-all"
                     >
                       <RotateCcw size={14} />
                       Reclaim GPU
                     </button>
                     <button
                       type="button"
                       onClick={() => navigate('/migration')}
                       className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all flex items-center gap-1.5"
                       title="Watch Live Node Migration Graph"
                     >
                       <Network size={14} />
                       <span className="hidden sm:inline">Graph</span>
                     </button>
                     <button
                       type="button"
                       onClick={() => navigate('/jobs')}
                       className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-text-dim hover:text-white transition-all flex items-center gap-1"
                       title="View Live Logs"
                     >
                       <Terminal size={14} />
                     </button>
                   </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-10 flex-1 flex flex-col items-center justify-center gap-6 text-center">
              <div className="w-24 h-24 rounded-full border-4 border-primary/20 border-t-primary animate-[spin_3s_linear_infinite] flex items-center justify-center">
                  <Zap size={40} className="text-primary" />
              </div>
              <div>
                  <p className="text-lg font-bold">No GPU Detected yet</p>
                  <p className="text-sm text-text-dim max-w-[200px]">Once you run the agent, your hardware will appear here.</p>
              </div>
              <button
                onClick={handleCopy}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-2"
              >
                  <Download size={14} /> Download Agent Manual (.pdf)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Module 8: Reclaim Confirmation Modal */}
      <AnimatePresence>
        {showReclaimModal && activeJob && (
          <>
            <Motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[1001]"
              onClick={() => setShowReclaimModal(false)}
            />
            <ReclaimModal
              job={activeJob}
              gpu={myGpu}
              onClose={() => setShowReclaimModal(false)}
              onSuccess={() => {
                setShowReclaimModal(false);
                fetchMyGpu();
              }}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Host;
