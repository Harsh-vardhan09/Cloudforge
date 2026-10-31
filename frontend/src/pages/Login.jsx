import React, { useState } from 'react';
import { motion as Motion } from 'framer-motion';
import { Mail, Lock, User, Cpu, ArrowRight, Loader2, Globe2, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'user' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isLogin) {
        await login(formData.email, formData.password);
      } else {
        await register(formData.name, formData.email, formData.password, formData.role);
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell relative">
      <div className="grid-bg" />
      <div className="mesh-gradient" />

      <Motion.section
        initial={{ opacity: 0, x: -18 }}
        animate={{ opacity: 1, x: 0 }}
        className="login-story"
        aria-label="ComputeGrid network"
      >
        <a href="/login" className="flex w-fit items-center gap-3 text-white no-underline" aria-label="ComputeGrid home">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-background">
            <Cpu size={21} />
          </span>
          <span className="text-base font-bold tracking-tight">compute<span className="text-primary">grid</span></span>
        </a>

        <div className="max-w-2xl py-10">
          <div className="mb-6 flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-2 text-[0.68rem] font-medium text-primary">
            <Globe2 size={14} />
            An open network for accelerated compute
          </div>
          <h1 className="login-story-title text-5xl font-semibold leading-[1.06] tracking-[-0.055em] text-white">
            Big ideas need <span className="text-primary">bigger compute.</span>
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-text-dim">
            Rent the GPU power you need. Share the power you have. One connected network, built for work that moves the world forward.
          </p>

          <div className="mt-10 grid max-w-xl grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Zap size={16} /></div>
              <div className="text-sm font-semibold text-white">On-demand power</div>
              <div className="mt-1 text-xs leading-5 text-text-dim">Find the right GPU for every workload.</div>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent"><ShieldCheck size={16} /></div>
              <div className="text-sm font-semibold text-white">Built to connect</div>
              <div className="mt-1 text-xs leading-5 text-text-dim">A distributed marketplace for compute.</div>
            </div>
          </div>
        </div>

        <div className="login-story-foot flex items-center gap-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-text-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Powering the next generation of AI
        </div>
      </Motion.section>

      <div className="login-panel-wrap">
        <Motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="login-panel glass-card relative overflow-hidden"
        >
          <div className="mb-8">
            <div className="eyebrow mb-3">{isLogin ? 'Welcome back' : 'Get started'}</div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              {isLogin ? 'Sign in to your workspace' : 'Create your account'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-dim">
              {isLogin ? 'Pick up where your next big idea begins.' : 'Join the network and put compute to work.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!isLogin && (
            <div>
              <label className="mb-2 block text-xs font-medium text-text-dim" htmlFor="full-name">Full name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim" size={17} />
                <input
                  id="full-name"
                  autoComplete="name"
                  type="text"
                  placeholder="Your name"
                  className="login-input w-full rounded-xl py-3 pl-11 pr-4 text-sm transition-colors"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-2 block text-xs font-medium text-text-dim" htmlFor="email-address">Email address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim" size={17} />
              <input
                id="email-address"
                autoComplete="email"
                type="email"
                placeholder="you@example.com"
                className="login-input w-full rounded-xl py-3 pl-11 pr-4 text-sm transition-colors"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-text-dim" htmlFor="password">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim" size={17} />
              <input
                id="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                type="password"
                placeholder="Enter your password"
                className="login-input w-full rounded-xl py-3 pl-11 pr-4 text-sm transition-colors"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                required
              />
            </div>
          </div>

          {!isLogin && (
            <fieldset className="mb-1">
              <legend className="mb-2 text-xs font-medium text-text-dim">How will you use ComputeGrid?</legend>
              <div className="flex gap-3">
               <label className={`flex flex-1 cursor-pointer flex-col rounded-xl border p-3.5 transition-all ${formData.role === 'user' ? 'border-primary/50 bg-primary/[0.08]' : 'border-white/10 bg-white/[0.025] hover:border-white/20'}`}>
                  <input type="radio" value="user" name="role" className="sr-only" checked={formData.role === 'user'} onChange={() => setFormData({...formData, role: 'user'})} />
                  <span className="text-xs font-semibold text-white">Rent compute</span>
                  <span className="mt-1 text-[0.65rem] text-text-dim">Run jobs on GPUs</span>
               </label>
               <label className={`flex flex-1 cursor-pointer flex-col rounded-xl border p-3.5 transition-all ${formData.role === 'host' ? 'border-primary/50 bg-primary/[0.08]' : 'border-white/10 bg-white/[0.025] hover:border-white/20'}`}>
                  <input type="radio" value="host" name="role" className="sr-only" checked={formData.role === 'host'} onChange={() => setFormData({...formData, role: 'host'})} />
                  <span className="text-xs font-semibold text-white">Share a GPU</span>
                  <span className="mt-1 text-[0.65rem] text-text-dim">Host your hardware</span>
               </label>
              </div>
            </fieldset>
          )}

          {error && <p role="alert" className="mt-1 text-center text-xs font-medium text-error">{error}</p>}

          <button 
            type="submit" 
            disabled={loading}
            className="glow-btn mt-2 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : (
              <>
                {isLogin ? 'Sign in' : 'Create account'}
                <ArrowRight size={18} />
              </>
            )}
          </button>
          
          <button 
            type="button" 
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              setError('');
              try {
                await login('demo@example.com', 'password123');
                navigate('/');
              } catch (err) {
                try {
                  await register('Demo User', 'demo@example.com', 'password123', 'user');
                  navigate('/');
                } catch (e) {
                  setError('Failed to login or create demo user.');
                }
              } finally {
                setLoading(false);
              }
            }}
            className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] py-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.05]"
          >
            Demo Login
          </button>
          </form>

          <div className="mt-7 border-t border-white/[0.08] pt-5 text-center text-xs">
            <span className="text-text-dim">
              {isLogin ? "New to ComputeGrid?" : 'Already have an account?'}
            </span>
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="ml-2 font-semibold text-primary hover:underline"
            >
              {isLogin ? 'Create account' : 'Sign in'}
            </button>
          </div>
        </Motion.div>
      </div>
    </div>
  );
};

export default Login;
