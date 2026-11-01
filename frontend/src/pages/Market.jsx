import React, { useState, useEffect, useCallback } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { Search, HardDrive, Zap, DollarSign, Loader2, AlertCircle, Cpu, ArrowUpRight } from 'lucide-react';
import api from '../services/api';
import JobLaunchModal from '../components/JobLaunchModal';
import { useNavigate } from 'react-router-dom';

const SHOWCASE_GPUS = [
  { _id: 'showcase-rtx-4090', model: 'NVIDIA RTX 4090', vram: 24, pricePerHour: 0.72 },
  { _id: 'showcase-rtx-3090', model: 'NVIDIA RTX 3090', vram: 24, pricePerHour: 0.48 },
  { _id: 'showcase-a100', model: 'NVIDIA A100', vram: 40, pricePerHour: 1.35 },
  { _id: 'showcase-l40s', model: 'NVIDIA L40S', vram: 48, pricePerHour: 1.08 },
];

const GpuCard = ({ gpu, onDeploy, isShowcase = false, canDeploy = true, unavailableReason = '' }) => (
  <Motion.div
    layout
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ y: -8 }}
    className="glass-card flex flex-col gap-5 p-5 transition-colors hover:border-primary/20 sm:p-6"
  >
    <div className="flex justify-between items-start">
      <div className="flex min-w-0 flex-col">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/[0.07] text-primary">
          <Cpu size={19} />
        </div>
        <h4 className="truncate text-lg font-semibold tracking-tight">{gpu.model}</h4>
        <span className="text-[0.75rem] text-text-dim">
          {isShowcase ? 'Sample listing · runs on your GPU' : `via ${gpu.host?.name || 'Unknown Provider'}`}
        </span>
      </div>
      {isShowcase ? (
        <div className="rounded-full border border-accent/30 bg-accent/15 px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-wider text-text">
          Demo
        </div>
      ) : (
        <div className={`rounded-full border px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-wider
          ${gpu.status === 'available' ? 'bg-success/10 text-success border-success/20' :
            gpu.status === 'busy' ? 'bg-error/10 text-error border-error/20' : 'bg-gray-500/10 text-gray-500 border-gray-500/20'}`}>
          {gpu.status}
        </div>
      )}
    </div>

    <div className="grid grid-cols-2 gap-3 border-y border-ink/15 py-4">
      <div className="flex items-center gap-2.5 text-text-dim">
        <HardDrive size={16} className="shrink-0 text-primary" />
        <div className="flex flex-col">
          <span className="text-[0.62rem] uppercase tracking-wider">Memory</span>
          <span className="text-sm font-medium text-white">{gpu.vram} GB VRAM</span>
        </div>
      </div>
      <div className="flex items-center gap-2.5 text-text-dim">
        <DollarSign size={16} className="shrink-0 text-primary" />
        <div className="flex flex-col">
          <span className="text-[0.62rem] uppercase tracking-wider">Rate</span>
          <span className="text-sm font-medium text-white">${gpu.pricePerHour || 0.5}<span className="text-xs text-text-dim"> / hr</span></span>
        </div>
      </div>
    </div>

      <button
        disabled={isShowcase ? !canDeploy : gpu.status !== 'available'}
        onClick={() => onDeploy(gpu)}
        className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all
        ${(isShowcase ? !canDeploy : gpu.status !== 'available') ? 'cursor-not-allowed bg-surface-hover text-text-dim' : 'bg-primary text-background hover:-translate-y-0.5 hover:bg-accent hover:shadow-glow'}`}>
        {isShowcase
          ? canDeploy ? 'Run on my GPU' : unavailableReason || 'Connect your GPU'
          : gpu.status === 'available' ? 'Deploy Now' : 'Unavailable'}
        {(isShowcase ? canDeploy : gpu.status === 'available') && <ArrowUpRight size={16} />}
      </button>
  </Motion.div>
);

const Market = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [gpus, setGpus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGpu, setSelectedGpu] = useState(null);
  const [myGpu, setMyGpu] = useState(null);
  const [myGpuLoading, setMyGpuLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('available'); // default to online/available

  const fetchGpus = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const response = await api.get('/gpu/gpus', { params });
      setGpus(response.data);
    } catch (err) {
      console.error('Failed to fetch GPUs:', err);
      setError('Could not load marketplace data. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchGpus();
  }, [fetchGpus]);

  useEffect(() => {
    let active = true;
    const refreshMyGpu = () => {
      api.get('/gpu/my')
        .then(({ data }) => {
          if (active) setMyGpu(data);
        })
        .catch((requestError) => {
          if (!active) return;
          if (requestError.response?.status === 404) {
            setMyGpu(null);
          } else {
            console.error('Could not check your registered GPU:', requestError);
          }
        })
        .finally(() => {
          if (active) setMyGpuLoading(false);
        });
    };
    refreshMyGpu();
    const intervalId = window.setInterval(refreshMyGpu, 15_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const myGpuOnline = Boolean(
    myGpu &&
    myGpu.acceptingJobs !== false &&
    ['available', 'busy'].includes(myGpu.status) &&
    Date.now() - new Date(myGpu.lastSeen).getTime() <= 60_000
  );
  const showcaseUnavailableReason = myGpuLoading
    ? 'Checking your GPU…'
    : !myGpu
      ? 'Register your GPU first'
      : myGpuOnline
        ? ''
        : 'Your GPU is offline';

  const filteredGpus = gpus.filter(gpu =>
    gpu.model.toLowerCase().includes(search.toLowerCase())
  );
  const filteredShowcaseGpus = SHOWCASE_GPUS.filter(gpu =>
    gpu.model.toLowerCase().includes(search.toLowerCase())
  );
  const showShowcaseGpus = statusFilter === 'all' || statusFilter === 'available';

  return (
    <div className="page-market flex flex-col gap-6">
      <section className="glass-card relative overflow-hidden p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border border-primary/10 shadow-[0_0_0_32px_rgba(197,243,106,0.025),0_0_0_68px_rgba(197,243,106,0.02)]" />
        <div className="relative z-[1] flex flex-col gap-5">
          <div>
            <span className="eyebrow">The compute exchange</span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Find your next GPU.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-text-dim">Browse community-powered hardware and launch your workload on the resources that fit.</p>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-ink/15 bg-surface-muted px-4 py-3 transition-colors focus-within:border-primary/40">
              <Search size={17} className="shrink-0 text-text-dim" />
              <input
                type="search"
                aria-label="Search GPU models"
                placeholder="Search GPU models..."
                className="min-w-0 flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-text-dim/70 focus:outline-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-ink/15 bg-surface-muted p-1">
              {['all', 'available', 'busy', 'offline'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  aria-pressed={statusFilter === status}
                  className={`shrink-0 rounded-lg px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wider transition-all sm:px-4
                    ${statusFilter === status ? 'bg-primary text-background' : 'text-text-dim hover:bg-white/[0.05] hover:text-white'}`}
                >
                  {status === 'available' ? 'Online' : status}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {showShowcaseGpus && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-bold">GPU showcase</h3>
            <p className="text-sm text-text-dim">
              Sample listings for exploring the marketplace. Jobs selected here are sent to your registered GPU
              {myGpu ? ` (${myGpu.model}, ${myGpu.vram} GB)` : ''}.
            </p>
          </div>
          {filteredShowcaseGpus.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4">
              {filteredShowcaseGpus.map((gpu) => (
                <GpuCard
                  key={gpu._id}
                  gpu={{ ...gpu, status: 'available', host: { name: 'ComputeGrid showcase' } }}
                  isShowcase
                  canDeploy={myGpuOnline}
                  unavailableReason={showcaseUnavailableReason}
                  onDeploy={() => setSelectedGpu({ ...gpu, executionGpu: myGpu })}
                />
              ))}
            </div>
          ) : (
            <div className="glass-card py-8 text-center text-sm text-text-dim">
              No showcase GPUs match “{search}”.
            </div>
          )}
        </section>
      )}

      {!loading && !error && gpus.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white">{filteredGpus.length} <span className="text-text-dim">{filteredGpus.length === 1 ? 'GPU' : 'GPUs'} found</span></span>
          <span className="font-mono text-[0.62rem] uppercase tracking-wider text-text-dim">Network inventory</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-primary" size={48} />
          <span className="text-text-dim font-medium tracking-tight">Accessing GPU Network...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-error">
          <AlertCircle size={48} />
          <span className="font-medium">{error}</span>
          <button onClick={() => window.location.reload()} className="text-primary hover:underline">Retry</button>
        </div>
      ) : gpus.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center gap-3 py-16 text-center text-text-dim">
          <Cpu size={32} className="text-primary/60" />
          <span className="text-sm">No community GPUs are currently listed. Try a showcase GPU above.</span>
        </div>
      ) : filteredGpus.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center gap-3 py-16 text-center text-text-dim">
          <Search size={30} className="text-primary/60" />
          <span className="text-sm">No GPUs match “{search}”. Try another model name.</span>
        </div>
      ) : (
        <Motion.div
          layout
          className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4"
        >
          {filteredGpus.map((gpu) => (
            <GpuCard
              key={gpu._id}
              gpu={gpu}
              onDeploy={(gpu) => setSelectedGpu(gpu)}
            />
          ))}
        </Motion.div>
      )}

      <AnimatePresence>
        {selectedGpu && (
          <JobLaunchModal
          gpu={selectedGpu.executionGpu
            ? { ...selectedGpu.executionGpu, vram: selectedGpu.executionGpu.maxVram || selectedGpu.executionGpu.vram }
            : selectedGpu}
            showcaseGpu={selectedGpu.executionGpu ? selectedGpu : null}
            onClose={() => setSelectedGpu(null)}
            onSuccess={() => navigate('/jobs')}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Market;
