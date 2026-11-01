import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import NotificationsBell from './NotificationsBell';
import { useAuth } from '../context/AuthContext';
import { Search, ArrowUpRight } from 'lucide-react';

const searchItems = [
  { label: 'Dashboard', detail: 'Overview and compute activity', path: '/' },
  { label: 'GPU marketplace', detail: 'Browse available GPUs', path: '/market' },
  { label: 'My jobs', detail: 'View workloads and logs', path: '/jobs' },
  { label: 'Migration graph', detail: 'Track workload migration', path: '/migration' },
  { label: 'Billing', detail: 'Credits and transactions', path: '/billing' },
  { label: 'Host a GPU', detail: 'Manage shared hardware', path: '/host' },
  { label: 'AI models', detail: 'Browse API resources', path: '/ai-market' },
  { label: 'AI playground', detail: 'Test rented models', path: '/ai-sandbox' },
];

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const filteredSearchItems = searchItems.filter((item) =>
    `${item.label} ${item.detail}`.toLowerCase().includes(search.trim().toLowerCase())
  ).slice(0, 5);

  const openSearchItem = (item) => {
    navigate(item.path);
    setSearch('');
    setSearchFocused(false);
  };

  const getPageTitle = (path) => {
    switch(path) {
      case '/': return 'Network overview';
      case '/market': return 'GPU marketplace';
      case '/jobs': return 'Your deployments';
      case '/migration': return 'Workload migration';
      case '/billing': return 'Usage & billing';
      case '/host': return 'Share your GPU';
      case '/ai-market': return 'Model marketplace';
      case '/ai-sandbox': return 'AI playground';
      default: return 'ComputeGrid';
    }
  };

  return (
    <div className="app-shell bg-background text-white">
      <div className="grid-bg" />
      <div className="mesh-gradient" />
      
      <Sidebar />

      <main className="app-main">
        <header className="app-header">
          <div className="app-topbar">
            <div className="app-search-wrap">
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search ComputeGrid"
                placeholder="Search GPUs, jobs, and more"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && filteredSearchItems[0]) {
                    openSearchItem(filteredSearchItems[0]);
                  }
                  if (event.key === 'Escape') {
                    setSearchFocused(false);
                    event.currentTarget.blur();
                  }
                }}
              />
              {searchFocused && search.trim() && (
                <div className="app-search-results" aria-label="Search results">
                  {filteredSearchItems.length ? filteredSearchItems.map((item) => (
                    <button key={item.path} type="button" onMouseDown={() => openSearchItem(item)}>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.detail}</small>
                      </span>
                      <ArrowUpRight size={15} />
                    </button>
                  )) : <p>No pages found. Try another search.</p>}
                </div>
              )}
            </div>
            <div className="app-topbar-actions">
              <div className="app-credit-balance">
                <span>Credits</span>
                <strong>${user?.creditBalance ? user.creditBalance.toFixed(2) : '0.00'}</strong>
              </div>
              <NotificationsBell />
            </div>
          </div>
          <div className="app-page-heading">
            <Motion.h1
              key={location.pathname}
              initial={{ y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="app-header-title"
            >
              {getPageTitle(location.pathname)}
            </Motion.h1>
            <div className="app-network-status">
              <span />
              <span className="network-status-label">Network online</span>
            </div>
          </div>
        </header>

        <div className="relative">
          <AnimatePresence mode="wait">
            <Motion.div
              key={location.pathname}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="pb-10"
            >
              <Outlet />
            </Motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default Layout;
