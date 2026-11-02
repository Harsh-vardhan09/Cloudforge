import { motion as Motion } from 'framer-motion';
import {
  Network, ShieldCheck, Zap, RotateCcw, Sparkles
} from 'lucide-react';
import JobMigrationGraph from '../components/JobMigrationGraph';

const Migration = () => {
  return (
    <div className="page-migration flex flex-col gap-6">
      {/* Hero section */}
      <Motion.header
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card relative overflow-hidden p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-amber-500/10 shadow-[0_0_0_40px_rgba(245,158,11,0.03)]" />
        <div className="pointer-events-none absolute right-48 -bottom-16 h-48 w-48 rounded-full border border-primary/10 shadow-[0_0_0_30px_rgba(197,243,106,0.03)]" />

        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="eyebrow flex items-center gap-1.5 text-amber-400">
              <Sparkles size={13} /> GPU migration
            </span>
          </div>

          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl text-white">
            Keep your job running when a GPU goes offline
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-text-dim">
            The network saves your job's progress, moves it to another available GPU, and continues from where it stopped.
            Follow the steps below to see how it works.
          </p>
        </div>

        {/* Highlights metrics strip */}
        <div className="relative z-10 mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-ink/15 bg-surface-muted p-3.5 flex flex-col gap-1">
            <span className="text-[0.62rem] font-mono uppercase tracking-wider text-text-dim">Saved progress retained</span>
            <span className="text-xl font-bold text-success flex items-center gap-1">
              <ShieldCheck size={18} /> 100.0%
            </span>
          </div>

          <div className="rounded-xl border border-ink/15 bg-surface-muted p-3.5 flex flex-col gap-1">
            <span className="text-[0.62rem] font-mono uppercase tracking-wider text-text-dim">Average resume time</span>
            <span className="text-xl font-bold text-primary flex items-center gap-1">
              <Zap size={18} /> 1.4s Avg
            </span>
          </div>

          <div className="rounded-xl border border-ink/15 bg-surface-muted p-3.5 flex flex-col gap-1">
            <span className="text-[0.62rem] font-mono uppercase tracking-wider text-text-dim">GPU release</span>
            <span className="text-xl font-bold text-amber-400 flex items-center gap-1">
              <RotateCcw size={18} /> Instant
            </span>
          </div>

          <div className="rounded-xl border border-ink/15 bg-surface-muted p-3.5 flex flex-col gap-1">
            <span className="text-[0.62rem] font-mono uppercase tracking-wider text-text-dim">Successful resumes</span>
            <span className="text-xl font-bold text-white flex items-center gap-1">
              <Network size={18} /> 142 Completed
            </span>
          </div>
        </div>
      </Motion.header>

      {/* Main Interactive Node Graph */}
      <Motion.section
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <JobMigrationGraph autoStart={false} />
      </Motion.section>

      {/* Plain-language explanation of the migration stages */}
      <Motion.section
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-5"
      >
        {/* Card 1 */}
        <div className="glass-card p-5 flex flex-col gap-3 border-amber-500/20 bg-amber-500/[0.02]">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
            1
          </div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            Release the current GPU
          </h3>
          <p className="text-xs text-text-dim leading-relaxed">
            If the host needs their GPU back, your job pauses safely and the GPU is released for the host to use.
          </p>
        </div>

        {/* Card 2 */}
        <div className="glass-card p-5 flex flex-col gap-3 border-blue-500/20 bg-blue-500/[0.02]">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
            2
          </div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            Save the job's progress
          </h3>
          <p className="text-xs text-text-dim leading-relaxed">
            A checkpoint is a saved snapshot of the job, including its current training step. It is stored safely so the job can continue later.
          </p>
        </div>

        {/* Card 3 */}
        <div className="glass-card p-5 flex flex-col gap-3 border-primary/20 bg-primary/[0.02]">
          <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold">
            3
          </div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            Continue on another GPU
          </h3>
          <p className="text-xs text-text-dim leading-relaxed">
            When another GPU is available, it loads the saved checkpoint and resumes the job from the same step.
          </p>
        </div>
      </Motion.section>
    </div>
  );
};

export default Migration;
