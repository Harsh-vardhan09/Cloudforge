import React from 'react';
import { motion as Motion } from 'framer-motion';
import { LayoutDashboard, Cpu, Terminal, CreditCard, LogOut, Share2, Sparkles, MessageSquare, Network } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const menuItems = [
    { name: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
    { name: 'Take GPU', icon: <Cpu size={20} />, path: '/market' },
    { name: 'AI Models', icon: <Sparkles size={20} className="text-accent" />, path: '/ai-market' },
    { name: 'AI Playground', icon: <MessageSquare size={20} className="text-primary" />, path: '/ai-sandbox' },
    { name: 'Add GPU', icon: <Share2 size={20} />, path: '/host' },
    { name: 'My Jobs', icon: <Terminal size={20} />, path: '/jobs' },
    { name: 'Migration Graph', icon: <Network size={20} className="text-amber-400" />, path: '/migration' },
    { name: 'Billing', icon: <CreditCard size={20} />, path: '/billing' },
  ];

  const getInitials = (name) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  return (
    <Motion.aside
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="app-sidebar glass-card flex flex-col"
    >
      <div className="sidebar-brand flex items-center gap-3 px-3 pb-7">
        <div className="sidebar-brand-icon flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-glow">
          <Cpu size={20} />
        </div>
        <span className="sidebar-wordmark text-[1.05rem] font-bold tracking-tight">
          compute<span className="text-primary">grid</span>
        </span>
      </div>

      <div className="sidebar-nav-label mb-2 px-3 text-[0.68rem] font-medium text-text-dim">Workspace</div>
      <nav className="sidebar-nav flex flex-1 flex-col gap-1.5">
        {menuItems.map((item) => (
          <NavLink 
            key={item.path} 
            to={item.path}
            className={({ isActive }) => 
              `sidebar-nav-link group relative flex items-center gap-3 rounded-lg px-3.5 py-2.5 no-underline text-[0.86rem] font-medium transition-colors
               ${isActive ? 'bg-primary/10 text-primary' : 'text-text-dim hover:bg-surface-hover hover:text-slate-900'}`
            }
            end={item.path === '/'}
            title={item.name}
            aria-label={item.name}
          >
            <span className="flex items-center justify-center opacity-85 group-hover:opacity-100">{item.icon}</span>
            <span className="sidebar-link-label">{item.name}</span>
            {((item.path === '/' && location.pathname === '/') || (item.path !== '/' && location.pathname === item.path)) && (
              <Motion.div
                layoutId="active-nav"
                className="absolute left-0 h-5 w-[2px] rounded-r bg-primary"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-profile relative mt-auto flex items-center justify-between border-t border-slate-200 pt-4">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-xs font-bold uppercase text-primary">
            {getInitials(user?.name)}
          </div>
          <div className="sidebar-profile-copy flex min-w-0 flex-col truncate">
            <span className="text-[0.85rem] font-semibold truncate">{user?.name || 'Loading...'}</span>
            <span className="text-[0.62rem] text-text-dim font-medium uppercase tracking-[0.12em]">
              {user?.role || 'Guest'}
            </span>
          </div>
        </div>
        <button 
          onClick={logout}
          className="sidebar-signout flex-shrink-0 rounded-lg p-2 text-text-dim transition-colors hover:bg-error/10 hover:text-error"
          title="Sign Out"
          aria-label="Sign out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </Motion.aside>
  );
};

export default Sidebar;
