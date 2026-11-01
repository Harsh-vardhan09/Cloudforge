import React, { useState, useEffect } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { 
  Play, TrendingUp, Cpu, Server, Clock, Terminal, CreditCard, 
  Loader2, BarChart3, UploadCloud, ListOrdered, ArrowRight, Network
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import JobLaunchModal from '../components/JobLaunchModal';
import { useNavigate } from 'react-router-dom';

const StatsCard = ({ title, value, icon, trend, color, loading }) => {
  const colorMap = {
    blue: 'bg-primary/10 text-primary',
    amber: 'bg-accent/10 text-accent',
    purple: 'bg-white/[0.06] text-white/75',
    cyan: 'bg-accent/10 text-accent',
    green: 'bg-success/10 text-success'
  };

  return (
    <Motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      className="stat-card glass-card flex h-full flex-col justify-between gap-4 p-5"
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
          {icon}
        </div>
        <div className="flex flex-col">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-text-dim">{title}</span>
          {loading ? (
             <div className="h-8 w-24 bg-white/5 animate-pulse rounded mt-1" />
          ) : (
            <h3 className="text-2xl font-semibold tracking-tight text-white">
              {value}
            </h3>
          )}
        </div>
      </div>
      {trend && !loading && (
        <div className="flex items-center gap-1 text-[0.75rem] font-semibold text-success">
          <TrendingUp size={14} />
          <span>{trend}</span>
        </div>
      )}
    </Motion.div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [usageData, setUsageData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Script upload modal from dashboard
  const [showUploadModal, setShowUploadModal] = useState(false);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [statsResp, usageResp] = await Promise.all([
        api.get('/jobs/stats'),
        api.get('/resource/usage-stats')
      ]);
      setStats(statsResp.data);
      setUsageData(usageResp.data);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <Motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="dashboard-hero glass-card"
      >
        <div className="dashboard-hero-content">
          <span className="eyebrow">Your compute, in motion</span>
          <h2 className="mt-3 max-w-xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
            Put the network to work.
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-text-dim">
            Launch a workload on distributed GPU power or contribute your own hardware to the network.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => setShowUploadModal(true)}
              className="glow-btn flex items-center gap-2 px-4 py-2.5 text-sm"
            >
              <UploadCloud size={16} />
              Launch a job
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => navigate('/market')}
              className="subtle-btn"
            >
              Explore GPUs
            </button>
            <button
              onClick={() => navigate('/migration')}
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 flex items-center gap-2 shadow-glow"
            >
              <Network size={16} />
              Migration Graph
            </button>
          </div>
        </div>
      </Motion.div>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <StatsCard 
          title="Total Spent" 
          value={`$${stats?.totalSpent || 0}`} 
          icon={<CreditCard size={22} />} 
          trend="+0% this month" 
          color="blue"
          loading={loading}
        />
        <StatsCard 
          title="Queued Jobs" 
          value={stats?.queued || 0} 
          icon={<ListOrdered size={22} />} 
          color="amber"
          loading={loading}
        />
        <StatsCard 
          title="Active Jobs" 
          value={stats?.running || 0} 
          icon={<Terminal size={22} />} 
          color="purple"
          loading={loading}
        />
        <StatsCard 
          title="Completed Jobs" 
          value={stats?.completed || 0} 
          icon={<Server size={22} />} 
          color="cyan"
          loading={loading}
        />
        <StatsCard 
          title="Failed Jobs" 
          value={stats?.failed || 0} 
          icon={<Clock size={22} />} 
          color="green"
          loading={loading}
        />
      </section>

      {/* Evolution Chart & Quick Actions */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card min-h-[380px] p-5 sm:p-7 lg:col-span-2"
        >
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold">
              <BarChart3 className="text-primary" size={19} />
              Compute usage
              </h3>
              <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-text-dim">Token activity · last 7 days</p>
            </div>
          </div>
          
          <div className="h-[300px] w-full">
            {loading ? (
                <div className="h-full w-full flex items-center justify-center bg-white/5 animate-pulse rounded-2xl" />
            ) : usageData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={usageData}>
                        <defs>
                            <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e7ebf2" vertical={false} />
                        <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fill: '#718096', fontSize: 10}}
                            dy={10}
                        />
                        <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fill: '#718096', fontSize: 10}}
                        />
                        <Tooltip 
                            contentStyle={{ 
                                backgroundColor: '#ffffff',
                                border: '1px solid #dfe5ee',
                                borderRadius: '8px',
                                boxShadow: '0 6px 18px rgba(16, 24, 40, 0.12)',
                                color: '#1f2937'
                            }}
                            itemStyle={{ color: 'var(--primary)', fontWeight: 'bold' }}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="tokens" 
                            stroke="var(--primary)" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorTokens)" 
                        />
                    </AreaChart>
                </ResponsiveContainer>
            ) : (
                <div className="h-full w-full flex items-center justify-center border border-white/5 rounded-2xl bg-white/[0.02]">
                    <p className="text-sm text-text-dim italic">Insufficient data to generate chart</p>
                </div>
            )}
          </div>
        </Motion.div>

        <Motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-card flex flex-col gap-5 p-5 sm:p-6"
        >
          <h3 className="text-lg font-bold">Quick Actions</h3>
          <div className="flex flex-col gap-3">
             <button 
               onClick={() => setShowUploadModal(true)}
               className="flex w-full items-center gap-3 rounded-xl border border-primary/15 bg-primary/[0.06] p-3.5 text-left transition-all hover:border-primary/30 hover:bg-primary/[0.1]"
             >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                   <UploadCloud size={18} />
                </div>
                <div className="flex flex-col">
                   <span className="text-sm font-semibold text-white">Launch a workload</span>
                   <span className="text-[0.7rem] text-text-dim">Upload a script or start a job</span>
                </div>
             </button>

             <button 
               onClick={() => navigate('/host')}
               className="flex w-full items-center gap-3 rounded-xl border border-transparent bg-white/[0.025] p-3.5 text-left transition-all hover:border-white/[0.08] hover:bg-white/[0.05]"
             >
                <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                   <Cpu size={18} />
                </div>
                <div className="flex flex-col">
                   <span className="text-sm font-bold">Register GPU</span>
                   <span className="text-[0.7rem] text-text-dim">Earn by sharing resources</span>
                </div>
             </button>
             <button 
               onClick={() => navigate('/billing')}
               className="flex w-full items-center gap-3 rounded-xl border border-transparent bg-white/[0.025] p-3.5 text-left transition-all hover:border-white/[0.08] hover:bg-white/[0.05]"
             >
                <div className="w-8 h-8 rounded-lg bg-secondary/20 text-secondary flex items-center justify-center">
                   <CreditCard size={18} />
                </div>
                <div className="flex flex-col">
                   <span className="text-sm font-bold">Top Up Wallet</span>
                   <span className="text-[0.7rem] text-text-dim">Add credits to your account</span>
                </div>
             </button>
             <button 
               onClick={() => navigate('/ai-sandbox')}
               className="flex w-full items-center gap-3 rounded-xl border border-transparent bg-white/[0.025] p-3.5 text-left transition-all hover:border-white/[0.08] hover:bg-white/[0.05]"
             >
                <div className="w-8 h-8 rounded-lg bg-white/10 text-white flex items-center justify-center">
                   <Play size={16} fill="currentColor" />
                </div>
                <div className="flex flex-col">
                   <span className="text-sm font-bold text-white">AI Playground</span>
                   <span className="text-[0.7rem] text-text-dim">Chat with rented models</span>
                </div>
             </button>
          </div>
        </Motion.div>
      </section>

      {/* Module 4: Job Upload & Launch Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <JobLaunchModal 
            onClose={() => setShowUploadModal(false)}
            onSuccess={() => {
              setShowUploadModal(false);
              navigate('/jobs');
            }}
            defaultTab="script"
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
