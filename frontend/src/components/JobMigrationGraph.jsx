import React, { useState, useEffect, useRef } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, HardDrive, Server, RotateCcw, ArrowRight, Play, Pause,
  CheckCircle2, AlertTriangle, ShieldCheck, Zap, Activity,
  Database, RefreshCw, FileCode, Check, Copy, ExternalLink,
  Layers, Terminal, FastForward, Info, Sparkles
} from 'lucide-react';
import { io } from 'socket.io-client';
import api from '../services/api';

/**
 * Interactive Node Graph visualizing Zero-Loss Job Migration:
 * Node A (Evicted) -> Object Storage (Checkpointing) -> Node B (Resumed)
 */
const JobMigrationGraph = ({
  initialJobId = null,
  compact = false,
  autoStart = false,
  onMigrationComplete = null,
}) => {
  // Migration phases:
  // 0: Stable running on Node A
  // 1: Node A Evicted (Host Reclaim triggered, SIGTERM, buffer flushed)
  // 2: Object Storage Checkpointing (S3 sync, SHA-256 verified)
  // 3: Node B Resumed (Peer worker claimed, weights hydrated, training continuing)
  const [phase, setPhase] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoStart);
  const [speed, setSpeed] = useState(1); // 0.5x, 1x, 2x
  const [selectedNode, setSelectedNode] = useState('storage'); // 'nodeA' | 'storage' | 'nodeB'
  const [isSimulatingBackend, setIsSimulatingBackend] = useState(false);
  const [jobList, setJobList] = useState([]);
  const [activeJobId, setActiveJobId] = useState(initialJobId);

  // Live telemetry state
  const [stepProgress, setStepProgress] = useState(450);
  const totalSteps = 1000;
  const [nodeAData, setNodeAData] = useState({
    id: 'node-a-rtx4090',
    model: 'NVIDIA GeForce RTX 4090',
    vramTotal: 24,
    vramUsed: 18.4,
    temp: 68,
    util: 96,
    host: 'Host Worker #104 (Local Rig)',
    status: 'running', // 'running' | 'evicting' | 'evicted'
  });

  const [storageData, setStorageData] = useState({
    endpoint: 's3://computegrid-checkpoints.internal',
    bucket: 'jobs/checkpoints/v3',
    objectKey: 'chkpt_step450_weights.bin',
    sizeMB: 1420,
    checksum: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    status: 'idle', // 'idle' | 'uploading' | 'stored' | 'streaming'
    uploadSpeed: '850 MB/s',
    dataLoss: '0.00%',
  });

  const [nodeBData, setNodeBData] = useState({
    id: 'node-b-a100',
    model: 'NVIDIA A100-SXM4 (40GB)',
    vramTotal: 40,
    vramUsed: 0,
    temp: 34,
    util: 0,
    host: 'Peer Worker #218 (Decentralized Node)',
    status: 'standby', // 'standby' | 'matched' | 'hydrating' | 'resumed'
  });

  const [logs, setLogs] = useState([
    { time: '03:14:02', text: '[workload] Initialized PyTorch 2.1 CUDA training worker.', type: 'info' },
    { time: '03:14:15', text: '[workload] Training active on Node A (RTX 4090). Step 448/1000.', type: 'info' },
    { time: '03:14:19', text: '[workload] Training active on Node A (RTX 4090). Step 449/1000.', type: 'info' },
    { time: '03:14:24', text: '[workload] Checkpoint milestone snapshot sequence #3 prepared at Step 450.', type: 'success' },
  ]);

  const timerRef = useRef(null);

  // Fetch available user jobs to select from
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const resp = await api.get('/jobs');
        if (resp.data && resp.data.length > 0) {
          setJobList(resp.data);
          if (!activeJobId) {
            // Prefer running or reclaimed job
            const runningJob = resp.data.find(j => j.status === 'running' || j.reclaimed);
            if (runningJob) {
              setActiveJobId(runningJob._id);
            } else {
              setActiveJobId(resp.data[0]._id);
            }
          }
        }
      } catch (e) {
        console.warn('Could not fetch jobs for migration graph:', e.message);
      }
    };
    fetchJobs();
  }, []);

  // Connect to Socket.IO for real-time migration events
  useEffect(() => {
    const token = localStorage.getItem('token');
    const backendUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
    const socket = token ? io(backendUrl, { auth: { token } }) : null;

    if (socket) {
      if (activeJobId) {
        socket.emit('subscribe:job', activeJobId);
      }

      socket.on('job:migration', (data) => {
        console.log('Received job:migration event:', data);
        const logTime = new Date().toLocaleTimeString();

        if (data.stage === 'evicted') {
          setPhase(1);
          setNodeAData(prev => ({
            ...prev,
            status: 'evicted',
            vramUsed: 0.2,
            temp: 42,
            util: 0,
            model: data.fromNode?.model || prev.model,
          }));
          setStorageData(prev => ({
            ...prev,
            status: 'uploading',
            objectKey: data.storage?.objectKey || prev.objectKey,
          }));
          setLogs(prev => [
            ...prev,
            { time: logTime, text: `[scheduler] Node A (${data.fromNode?.model || 'RTX 4090'}) evicted by host reclaim.`, type: 'warning' },
            { time: logTime, text: `[migration] In-memory CUDA context dumped. Checkpoint upload started.`, type: 'info' },
          ]);
        } else if (data.stage === 'checkpointing') {
          setPhase(2);
          setStorageData(prev => ({
            ...prev,
            status: 'stored',
            objectKey: data.storage?.objectKey || prev.objectKey,
          }));
          setNodeBData(prev => ({
            ...prev,
            status: 'matched',
            model: data.toNode?.model || prev.model,
          }));
          setLogs(prev => [
            ...prev,
            { time: logTime, text: `[storage] Checkpoint ${data.storage?.objectKey || 'v3.ckpt'} verified with SHA-256. 0% data loss.`, type: 'success' },
            { time: logTime, text: `[scheduler] Job queued for secondary worker matching.`, type: 'info' },
          ]);
        } else if (data.stage === 'resumed') {
          setPhase(3);
          setStorageData(prev => ({ ...prev, status: 'streaming' }));
          setNodeBData(prev => ({
            ...prev,
            status: 'resumed',
            vramUsed: 18.4,
            temp: 65,
            util: 94,
            model: data.toNode?.model || prev.model,
          }));
          setLogs(prev => [
            ...prev,
            { time: logTime, text: `[scheduler] Node B (${data.toNode?.model || 'A100'}) claimed job lease.`, type: 'info' },
            { time: logTime, text: `[workload] Checkpoint weights hydrated in 1.4s. Resumed compute at Step ${stepProgress}/${totalSteps}!`, type: 'success' },
          ]);
          if (onMigrationComplete) onMigrationComplete(data);
        }
      });

      socket.on('job:log', ({ line }) => {
        if (line) {
          setLogs(prev => [...prev.slice(-20), { time: new Date().toLocaleTimeString(), text: line, type: 'info' }]);
        }
      });
    }

    return () => {
      if (socket) {
        if (activeJobId) socket.emit('unsubscribe:job', activeJobId);
        socket.disconnect();
      }
    };
  }, [activeJobId]);

  // Automated playback sequence
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const baseDelay = 2600 / speed;

    if (phase === 0) {
      // Transition 0 -> 1: Host Reclaims Node A
      timerRef.current = setTimeout(() => {
        applyPhase(1);
      }, baseDelay);
    } else if (phase === 1) {
      // Transition 1 -> 2: Checkpoint Uploaded to Storage
      timerRef.current = setTimeout(() => {
        applyPhase(2);
      }, baseDelay);
    } else if (phase === 2) {
      // Transition 2 -> 3: Node B Resumed
      timerRef.current = setTimeout(() => {
        applyPhase(3);
      }, baseDelay);
    } else if (phase === 3) {
      // Stay on phase 3 or loop
      setIsPlaying(false);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, isPlaying, speed]);

  const applyPhase = (newPhase) => {
    const time = new Date().toLocaleTimeString();
    setPhase(newPhase);

    if (newPhase === 0) {
      // Reset to Stable Node A
      setNodeAData(prev => ({
        ...prev,
        status: 'running',
        vramUsed: 18.4,
        temp: 68,
        util: 96,
      }));
      setStorageData(prev => ({
        ...prev,
        status: 'idle',
      }));
      setNodeBData(prev => ({
        ...prev,
        status: 'standby',
        vramUsed: 0,
        temp: 34,
        util: 0,
      }));
      setLogs(prev => [
        ...prev,
        { time, text: '[scheduler] Workload running steadily on Node A (RTX 4090).', type: 'info' }
      ]);
    } else if (newPhase === 1) {
      // Evicted Node A
      setNodeAData(prev => ({
        ...prev,
        status: 'evicted',
        vramUsed: 0.2,
        temp: 42,
        util: 0,
      }));
      setStorageData(prev => ({
        ...prev,
        status: 'uploading',
      }));
      setNodeBData(prev => ({
        ...prev,
        status: 'standby',
      }));
      setLogs(prev => [
        ...prev,
        { time, text: '⚠️ [HOST RECLAIM] Host requested immediate GPU release on Node A.', type: 'warning' },
        { time, text: '⚡ [SIGTERM] Workload gracefully paused. Checkpoint written to CHECKPOINT_DIR.', type: 'warning' },
        { time, text: '🔒 [EVICTION COMPLETE] Node A VRAM deallocated. GPU is 100% free for host use.', type: 'success' },
      ]);
    } else if (newPhase === 2) {
      // Checkpointing Object Storage
      setStorageData(prev => ({
        ...prev,
        status: 'stored',
      }));
      setNodeBData(prev => ({
        ...prev,
        status: 'matched',
      }));
      setLogs(prev => [
        ...prev,
        { time, text: '📦 [OBJECT STORAGE] Received snapshot: weights (1.42 GB) + optimizer state.', type: 'info' },
        { time, text: '🛡️ [INTEGRITY] SHA-256 checksum verified. Snapshot preserved at Step 450/1000.', type: 'success' },
        { time, text: '🎯 [SCHEDULER] Dispatching requeued job to secondary GPU candidate Node B...', type: 'info' },
      ]);
    } else if (newPhase === 3) {
      // Resumed Node B
      setStorageData(prev => ({
        ...prev,
        status: 'streaming',
      }));
      setNodeBData(prev => ({
        ...prev,
        status: 'resumed',
        vramUsed: 18.4,
        temp: 65,
        util: 94,
      }));
      setLogs(prev => [
        ...prev,
        { time, text: '🚀 [NODE B CLAIM] Node B (A100-SXM4) secured workload lease.', type: 'info' },
        { time, text: '📥 [HYDRATION] Model weights & tensors restored into Node B VRAM in 1.4s.', type: 'info' },
        { time, text: '✨ [RESUMED] Compute execution resumed at Step 450/1000 with ZERO progress lost!', type: 'success' },
      ]);
    }
  };

  const handleTriggerLiveSimulation = async () => {
    setIsSimulatingBackend(true);
    applyPhase(0);
    setIsPlaying(false);

    try {
      const endpoint = activeJobId
        ? `/jobs/${activeJobId}/simulate-migration`
        : '/jobs/simulate-migration';
      
      const resp = await api.post(endpoint, { jobId: activeJobId, force: true });
      if (resp.data) {
        setIsPlaying(true);
      }
    } catch (err) {
      console.warn('Backend simulate endpoint error, running local client simulation:', err.message);
      setIsPlaying(true);
    } finally {
      setIsSimulatingBackend(false);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    applyPhase(0);
  };

  return (
    <div className={`flex flex-col gap-5 ${compact ? 'p-2' : 'p-4 sm:p-6'} bg-[#0a0d13] rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden font-sans`}>
      {/* Background ambient mesh grid & glow */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header & Controls bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-primary/20 border border-amber-500/30 text-amber-300">
              <Activity size={20} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Live Migration Graph
                <span className="text-[0.65rem] font-mono uppercase px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Zero-Loss Checkpoint/Resume
                </span>
              </h3>
              <p className="text-xs text-text-dim">
                Real-time topological handover: Node A (Evicted) $\rightarrow$ Object Storage (Checkpointing) $\rightarrow$ Node B (Resumed)
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Job select if multiple */}
          {jobList.length > 0 && (
            <select
              value={activeJobId || ''}
              onChange={(e) => setActiveJobId(e.target.value)}
              className="bg-black/50 border border-white/10 text-xs text-text-dim hover:text-white px-2.5 py-2 rounded-xl focus:outline-none focus:border-primary font-mono"
            >
              <option value="">Demo Workload (PyTorch Llama)</option>
              {jobList.map((j) => (
                <option key={j._id} value={j._id}>
                  Job {j._id.substring(0, 8)} ({j.status})
                </option>
              ))}
            </select>
          )}

          {/* Speed Selector */}
          <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-0.5 text-xs">
            {[0.5, 1, 2].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2 py-1 rounded-lg font-mono text-[0.7rem] transition-all ${
                  speed === s ? 'bg-white/15 text-white font-bold' : 'text-text-dim hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Play/Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-all"
            title={isPlaying ? "Pause automated transition" : "Play automated transition"}
          >
            {isPlaying ? <Pause size={14} className="text-amber-400" /> : <Play size={14} className="text-primary" />}
            <span>{isPlaying ? 'Pause' : 'Play Flow'}</span>
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-text-dim hover:text-white transition-all"
            title="Reset to initial state"
          >
            <RotateCcw size={15} />
          </button>

          {/* Trigger Reclaim Simulation */}
          <button
            onClick={handleTriggerLiveSimulation}
            disabled={isSimulatingBackend}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 via-orange-500 to-primary text-white text-xs font-bold shadow-[0_0_20px_rgba(245,158,11,0.35)] hover:opacity-95 transition-all"
          >
            <Zap size={14} />
            {isSimulatingBackend ? 'Triggering...' : 'Simulate Host Reclaim'}
          </button>
        </div>
      </div>

      {/* 3-Stage Lifecycle Stepper Navigation */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Stage 1 Pill */}
        <button
          onClick={() => { setIsPlaying(false); applyPhase(1); }}
          className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
            phase === 1
              ? 'bg-amber-500/15 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
              : phase > 1
              ? 'bg-amber-500/5 border-amber-500/20 opacity-70'
              : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
          }`}
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
            phase === 1 ? 'bg-amber-500 text-black animate-pulse' : phase > 1 ? 'bg-amber-500/30 text-amber-300' : 'bg-white/10 text-text-dim'
          }`}>
            1
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-white truncate flex items-center gap-1.5">
              Node A: Evicted
              {phase === 1 && <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />}
            </span>
            <span className="text-[0.7rem] text-text-dim truncate">Host reclaims GPU; SIGTERM dump</span>
          </div>
        </button>

        {/* Stage 2 Pill */}
        <button
          onClick={() => { setIsPlaying(false); applyPhase(2); }}
          className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
            phase === 2
              ? 'bg-blue-500/15 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]'
              : phase > 2
              ? 'bg-blue-500/5 border-blue-500/20 opacity-70'
              : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
          }`}
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
            phase === 2 ? 'bg-blue-500 text-white animate-pulse' : phase > 2 ? 'bg-blue-500/30 text-blue-300' : 'bg-white/10 text-text-dim'
          }`}>
            2
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-white truncate flex items-center gap-1.5">
              Object Storage: Checkpointed
              {phase === 2 && <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />}
            </span>
            <span className="text-[0.7rem] text-text-dim truncate">Durable S3 snapshot; 0% loss</span>
          </div>
        </button>

        {/* Stage 3 Pill */}
        <button
          onClick={() => { setIsPlaying(false); applyPhase(3); }}
          className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
            phase === 3
              ? 'bg-primary/20 border-primary shadow-[0_0_15px_rgba(197,243,106,0.25)]'
              : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
          }`}
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
            phase === 3 ? 'bg-primary text-black font-extrabold shadow-glow' : 'bg-white/10 text-text-dim'
          }`}>
            3
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-white truncate flex items-center gap-1.5">
              Node B: Resumed
              {phase === 3 && <span className="w-2 h-2 rounded-full bg-primary animate-ping" />}
            </span>
            <span className="text-[0.7rem] text-text-dim truncate">Peer worker hydrations; seamless run</span>
          </div>
        </button>
      </div>

      {/* --- Visual Topological Graph Canvas --- */}
      <div className="relative z-10 w-full min-h-[360px] lg:min-h-[420px] bg-black/40 rounded-2xl border border-white/10 p-4 sm:p-6 flex flex-col justify-between overflow-hidden">
        {/* SVG Flow Pipeline Layer */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="gradPath1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={phase >= 1 ? "0.9" : "0.2"} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={phase >= 1 ? "0.9" : "0.2"} />
            </linearGradient>
            <linearGradient id="gradPath2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={phase >= 2 ? "0.9" : "0.2"} />
              <stop offset="100%" stopColor="#c5f36a" stopOpacity={phase >= 3 ? "0.9" : "0.2"} />
            </linearGradient>
            <filter id="glow1" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Left Path: Node A -> Storage */}
          <path
            d="M 28% 50% C 38% 50%, 42% 50%, 50% 50%"
            fill="none"
            stroke="url(#gradPath1)"
            strokeWidth={phase === 1 ? "4" : "2"}
            strokeDasharray={phase === 1 ? "8,4" : "4,4"}
            className={phase === 1 ? "animate-[dash_1s_linear_infinite]" : ""}
            filter="url(#glow1)"
          />

          {/* Right Path: Storage -> Node B */}
          <path
            d="M 50% 50% C 58% 50%, 62% 50%, 72% 50%"
            fill="none"
            stroke="url(#gradPath2)"
            strokeWidth={phase >= 2 ? "4" : "2"}
            strokeDasharray={phase >= 2 ? "8,4" : "4,4"}
            className={phase >= 2 ? "animate-[dash_1s_linear_infinite]" : ""}
            filter="url(#glow1)"
          />

          {/* Animated Traveling Data Packets along SVG paths */}
          {phase === 1 && (
            <>
              <circle r="6" fill="#f59e0b" filter="url(#glow1)">
                <animateMotion
                  path="M 28% 50% C 38% 50%, 42% 50%, 50% 50%"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle r="4" fill="#ffffff">
                <animateMotion
                  path="M 28% 50% C 38% 50%, 42% 50%, 50% 50%"
                  dur="1.2s"
                  begin="0.4s"
                  repeatCount="indefinite"
                />
              </circle>
            </>
          )}

          {phase >= 2 && (
            <>
              <circle r="6" fill="#c5f36a" filter="url(#glow1)">
                <animateMotion
                  path="M 50% 50% C 58% 50%, 62% 50%, 72% 50%"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle r="4" fill="#ffffff">
                <animateMotion
                  path="M 50% 50% C 58% 50%, 62% 50%, 72% 50%"
                  dur="1.2s"
                  begin="0.4s"
                  repeatCount="indefinite"
                />
              </circle>
            </>
          )}
        </svg>

        {/* Top telemetry status pill */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-text-dim">Current Workload:</span>
            <span className="font-mono text-white font-semibold">PyTorch Llama 3 8B Fine-Tuning</span>
          </div>

          <div className="flex items-center gap-3 font-mono text-[0.72rem]">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-black/60 border border-white/10">
              <span className="text-text-dim">Checkpoint Step:</span>
              <span className="text-primary font-bold">{stepProgress} / {totalSteps}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-black/60 border border-white/10">
              <span className="text-text-dim">Zero Data Loss:</span>
              <span className="text-success font-bold">100.0% Preserved</span>
            </div>
          </div>
        </div>

        {/* Nodes Grid (3 Topological Columns) */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 my-auto pt-6 pb-6">
          {/* ========================================================================= */}
          {/* NODE A: Source Host (Evicted)                                            */}
          {/* ========================================================================= */}
          <Motion.div
            layout
            onClick={() => setSelectedNode('nodeA')}
            whileHover={{ scale: 1.02 }}
            className={`cursor-pointer rounded-2xl p-5 border transition-all flex flex-col justify-between gap-4 backdrop-blur-md ${
              selectedNode === 'nodeA'
                ? 'border-amber-500/70 shadow-[0_0_25px_rgba(245,158,11,0.25)] bg-[#121620]/90'
                : 'border-white/10 bg-[#0d1117]/80 hover:border-white/20'
            }`}
          >
            {/* Node A Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${
                  phase === 0
                    ? 'bg-success/15 border-success/30 text-success'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                }`}>
                  <Server size={22} className={phase === 0 ? "animate-pulse" : ""} />
                </div>
                <div>
                  <span className="text-[0.65rem] font-mono uppercase tracking-wider text-text-dim">Source Worker</span>
                  <h4 className="text-sm font-bold text-white">Node A (Host)</h4>
                </div>
              </div>

              {/* Status Badge */}
              <span className={`px-2 py-0.5 rounded text-[0.65rem] font-bold uppercase tracking-wider border ${
                phase === 0
                  ? 'bg-success/10 text-success border-success/30 animate-pulse'
                  : phase === 1
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-bounce'
                  : 'bg-white/10 text-text-dim border-white/10'
              }`}>
                {phase === 0 ? 'Running' : phase === 1 ? 'Evicted' : 'Idle / Freed'}
              </span>
            </div>

            {/* GPU specs box */}
            <div className="bg-black/40 rounded-xl p-3 border border-white/5 flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-text-dim flex items-center gap-1.5">
                  <Cpu size={13} className="text-primary" /> Model:
                </span>
                <span className="text-white font-semibold">{nodeAData.model}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-dim">VRAM Usage:</span>
                <span className={phase === 0 ? "text-primary font-bold" : "text-text-dim font-bold"}>
                  {phase === 0 ? `${nodeAData.vramUsed} GB` : '0.2 GB (Freed)'} / {nodeAData.vramTotal} GB
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-dim">Core Temp:</span>
                <span className={phase === 0 ? "text-amber-400" : "text-text-dim"}>
                  {phase === 0 ? `${nodeAData.temp}°C` : '38°C (Cooling)'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-dim">Compute Load:</span>
                <span className={phase === 0 ? "text-success font-bold" : "text-text-dim font-bold"}>
                  {phase === 0 ? '98% Active' : '0% (Idle)'}
                </span>
              </div>
            </div>

            {/* Node A State indicator */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[0.72rem]">
              <span className="text-text-dim">Role:</span>
              <span className={phase >= 1 ? "text-amber-400 font-semibold" : "text-success font-semibold"}>
                {phase >= 1 ? "Host Reclaimed Hardware" : "Workload Assigned"}
              </span>
            </div>
          </Motion.div>

          {/* ========================================================================= */}
          {/* OBJECT STORAGE: Durable Checkpoint Vault                                 */}
          {/* ========================================================================= */}
          <Motion.div
            layout
            onClick={() => setSelectedNode('storage')}
            whileHover={{ scale: 1.02 }}
            className={`cursor-pointer rounded-2xl p-5 border transition-all flex flex-col justify-between gap-4 backdrop-blur-md ${
              selectedNode === 'storage'
                ? 'border-blue-500/70 shadow-[0_0_25px_rgba(59,130,246,0.25)] bg-[#0f172a]/90'
                : 'border-white/10 bg-[#0d1117]/80 hover:border-white/20'
            }`}
          >
            {/* Storage Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${
                  phase === 1
                    ? 'bg-amber-500/20 border-amber-500/30 text-amber-300 animate-pulse'
                    : phase >= 2
                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-300'
                    : 'bg-white/10 border-white/10 text-text-dim'
                }`}>
                  <Database size={22} className={phase === 2 ? "animate-bounce" : ""} />
                </div>
                <div>
                  <span className="text-[0.65rem] font-mono uppercase tracking-wider text-text-dim">Central Vault</span>
                  <h4 className="text-sm font-bold text-white">Object Storage</h4>
                </div>
              </div>

              {/* Status Badge */}
              <span className={`px-2 py-0.5 rounded text-[0.65rem] font-bold uppercase tracking-wider border ${
                phase === 1
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                  : phase === 2
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  : phase === 3
                  ? 'bg-primary/20 text-primary border-primary/40'
                  : 'bg-white/10 text-text-dim border-white/10'
              }`}>
                {phase === 1 ? 'Writing Checkpoint' : phase === 2 ? 'Durable (Saved)' : phase === 3 ? 'Hydrating Target' : 'Standby'}
              </span>
            </div>

            {/* Storage specs box */}
            <div className="bg-black/40 rounded-xl p-3 border border-white/5 flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-text-dim flex items-center gap-1.5">
                  <HardDrive size={13} className="text-blue-400" /> S3 Key:
                </span>
                <span className="text-blue-300 font-semibold truncate max-w-[140px]" title={storageData.objectKey}>
                  {storageData.objectKey}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-dim">Snapshot Size:</span>
                <span className="text-white font-bold">{storageData.sizeMB} MB (Tensors)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-dim">Transfer Throughput:</span>
                <span className="text-success font-bold">{storageData.uploadSpeed}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-dim">State Integrity:</span>
                <span className="text-blue-400 font-bold flex items-center gap-1">
                  <ShieldCheck size={13} /> SHA-256 OK
                </span>
              </div>
            </div>

            {/* Storage Progress indicator */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[0.72rem]">
              <span className="text-text-dim">Preserved State:</span>
              <span className="text-primary font-mono font-bold">
                Step {stepProgress} / {totalSteps} (0 loss)
              </span>
            </div>
          </Motion.div>

          {/* ========================================================================= */}
          {/* NODE B: Target Peer Worker (Resumed)                                      */}
          {/* ========================================================================= */}
          <Motion.div
            layout
            onClick={() => setSelectedNode('nodeB')}
            whileHover={{ scale: 1.02 }}
            className={`cursor-pointer rounded-2xl p-5 border transition-all flex flex-col justify-between gap-4 backdrop-blur-md ${
              selectedNode === 'nodeB'
                ? 'border-primary/70 shadow-[0_0_25px_rgba(197,243,106,0.25)] bg-[#121c17]/90'
                : 'border-white/10 bg-[#0d1117]/80 hover:border-white/20'
            }`}
          >
            {/* Node B Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${
                  phase === 3
                    ? 'bg-primary/20 border-primary text-primary shadow-glow'
                    : 'bg-white/10 border-white/10 text-text-dim'
                }`}>
                  <Server size={22} className={phase === 3 ? "animate-pulse" : ""} />
                </div>
                <div>
                  <span className="text-[0.65rem] font-mono uppercase tracking-wider text-text-dim">Target Worker</span>
                  <h4 className="text-sm font-bold text-white">Node B (Peer)</h4>
                </div>
              </div>

              {/* Status Badge */}
              <span className={`px-2 py-0.5 rounded text-[0.65rem] font-bold uppercase tracking-wider border ${
                phase < 2
                  ? 'bg-white/10 text-text-dim border-white/10'
                  : phase === 2
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse'
                  : 'bg-primary/20 text-primary border-primary shadow-glow animate-pulse'
              }`}>
                {phase < 2 ? 'Standby' : phase === 2 ? 'Matched' : 'Resumed'}
              </span>
            </div>

            {/* Node B specs box */}
            <div className="bg-black/40 rounded-xl p-3 border border-white/5 flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-text-dim flex items-center gap-1.5">
                  <Cpu size={13} className="text-primary" /> Model:
                </span>
                <span className="text-white font-semibold">{nodeBData.model}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-dim">VRAM Usage:</span>
                <span className={phase === 3 ? "text-primary font-bold" : "text-text-dim font-bold"}>
                  {phase === 3 ? `${nodeBData.vramUsed} GB` : '0 GB'} / {nodeBData.vramTotal} GB
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-dim">Hydration Time:</span>
                <span className={phase === 3 ? "text-primary font-bold" : "text-text-dim"}>
                  {phase === 3 ? '1.4s (Fast)' : '--'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-dim">Compute Status:</span>
                <span className={phase === 3 ? "text-success font-bold" : "text-text-dim"}>
                  {phase === 3 ? 'Active Training' : 'Awaiting Task'}
                </span>
              </div>
            </div>

            {/* Node B Resume progress */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[0.72rem]">
              <span className="text-text-dim">Execution:</span>
              <span className={phase === 3 ? "text-primary font-semibold" : "text-text-dim"}>
                {phase === 3 ? "Resumed from Step 450" : "Queue Standby"}
              </span>
            </div>
          </Motion.div>
        </div>

        {/* Bottom Flow Caption */}
        <div className="relative z-10 p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between text-xs text-text-dim">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary shrink-0" />
            <span>
              {phase === 0 && "Workload is currently running on Node A. Click 'Simulate Host Reclaim' to see the migration in action."}
              {phase === 1 && "Stage 1: Host requested reclaim. Node A dumps in-memory state and releases GPU slot. Checkpoint upload begins."}
              {phase === 2 && "Stage 2: Checkpoint safely stored in Object Storage. Scheduler matches an available peer worker (Node B)."}
              {phase === 3 && "Stage 3: Node B hydrates state from Object Storage. Workload resumes at the exact step with ZERO compute lost!"}
            </span>
          </div>
          <span className="font-mono text-[0.7rem] text-primary whitespace-nowrap hidden sm:inline">
            Phase {phase}/3
          </span>
        </div>
      </div>

      {/* --- Detail Inspector & Live Terminal Drawer --- */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Node Inspector Card */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Layers size={14} className="text-primary" />
              Detailed Node Inspector: <span className="text-primary">{selectedNode.toUpperCase()}</span>
            </h4>
            <span className="text-[0.65rem] font-mono text-text-dim">Click any node above to inspect</span>
          </div>

          {selectedNode === 'nodeA' && (
            <div className="flex flex-col gap-2.5 text-xs text-text-dim">
              <p className="text-white font-medium">Node A (Source Host - RTX 4090)</p>
              <div className="bg-black/40 p-3 rounded-lg border border-white/5 font-mono text-[0.75rem] flex flex-col gap-1.5">
                <div>Container PID: <span className="text-white">docker://d8f28a9b (llama-finetune)</span></div>
                <div>Isolation: <span className="text-success">Rootless Docker + GPU Pass-through</span></div>
                <div>Eviction Protocol: <span className="text-amber-400">SIGTERM → Memory Flush → Docker Stop</span></div>
                <div>Host Benefit: <span className="text-white">Host reclaims 100% VRAM instantly without killing user's training progress.</span></div>
              </div>
            </div>
          )}

          {selectedNode === 'storage' && (
            <div className="flex flex-col gap-2.5 text-xs text-text-dim">
              <p className="text-white font-medium">Object Storage (Checkpoint Vault)</p>
              <div className="bg-black/40 p-3 rounded-lg border border-white/5 font-mono text-[0.75rem] flex flex-col gap-1.5">
                <div>Bucket Path: <span className="text-blue-300">s3://computegrid-checkpoints/job-482a/</span></div>
                <div>Payload Archive: <span className="text-white">weights.safetensors, optimizer.pt, rng_state.pth</span></div>
                <div>Integrity Check: <span className="text-success">SHA-256 Checksum Verified (Bit-for-bit identity)</span></div>
                <div>Preserved Step: <span className="text-primary font-bold">Step 450 of 1000 (0 Step Loss)</span></div>
              </div>
            </div>
          )}

          {selectedNode === 'nodeB' && (
            <div className="flex flex-col gap-2.5 text-xs text-text-dim">
              <p className="text-white font-medium">Node B (Secondary Host - A100-SXM4)</p>
              <div className="bg-black/40 p-3 rounded-lg border border-white/5 font-mono text-[0.75rem] flex flex-col gap-1.5">
                <div>Scheduler Match: <span className="text-primary">Auto-matched within 850ms</span></div>
                <div>Hydration Latency: <span className="text-white">1.4s checkpoint download + tensor load</span></div>
                <div>Memory Restored: <span className="text-white">18.4 GB tensors mapped into 40GB VRAM</span></div>
                <div>Resumption: <span className="text-success font-bold">Resumed batch step 450/1000 seamlessly</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Live Event & Telemetry Logs */}
        <div className="p-4 rounded-xl bg-black/60 border border-white/5 flex flex-col gap-2.5 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <Terminal size={14} className="text-primary" />
              Live Telemetry Stream
            </span>
            <span className="text-[0.65rem] text-text-dim">Socket.IO Active</span>
          </div>

          <div className="max-h-40 overflow-y-auto flex flex-col gap-1 pr-1 text-[0.72rem] leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-white/30 whitespace-nowrap">[{l.time}]</span>
                <span className={
                  l.type === 'warning' ? 'text-amber-400' :
                  l.type === 'success' ? 'text-emerald-400 font-semibold' :
                  'text-[#c9d1d9]'
                }>
                  {l.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobMigrationGraph;
