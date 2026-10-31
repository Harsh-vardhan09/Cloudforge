import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Globe, Key, Shield, DollarSign, ExternalLink, Loader2, Sparkles, Plus, X, CreditCard, Pencil, Trash2 } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const ApiCard = ({ resource, onRent, onEdit, onDelete }) => (
  <motion.div 
    layout
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="p-6 glass-card bg-gradient-to-br from-white/[0.03] to-primary/5 hover:border-primary/50 transition-all group"
  >
    <div className="flex justify-between items-start mb-4">
      <div className="flex flex-col">
        <h4 className="text-lg font-bold flex items-center gap-2 group-hover:text-primary transition-colors">
          {resource.name}
          <Sparkles size={16} className="text-accent" />
        </h4>
        <span className="text-[0.7rem] text-text-dim uppercase tracking-tighter">Provided by {resource.host?.name}</span>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="px-2.5 py-1 rounded-full text-[0.65rem] font-black uppercase tracking-widest bg-success/10 text-success border border-success/20">
          {resource.status || 'Active'}
        </div>
        {onEdit && (
          <div className="flex gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); onEdit(resource); }} 
              className="p-2 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-white transition-all border border-primary/20"
              title="Edit Resource"
            >
              <Pencil size={12} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(resource._id); }} 
              className="p-2 rounded-lg bg-error/10 hover:bg-error text-error hover:text-white transition-all border border-error/20"
              title="Delete Resource"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    </div>

    <div className="flex gap-4 py-4 border-y border-white/5 mb-4">
      <div className="flex-1">
        <p className="text-[0.6rem] text-text-dim uppercase font-bold mb-1">Provider</p>
        <p className="text-sm font-semibold capitalize flex items-center gap-2">
           <Globe size={14} className="text-primary" />
           {resource.provider === 'custom' ? resource.customProviderName : resource.provider}
        </p>
      </div>
      <div className="flex-1">
        <p className="text-[0.6rem] text-text-dim uppercase font-bold mb-1">Rates</p>
        <div className="flex flex-col gap-1">
           <p className="text-[0.7rem] font-bold flex items-center gap-1">
              <DollarSign size={12} className="text-success" />
              {resource.hourlyRate} <span className="text-[0.5rem] text-text-dim">/ Hr</span>
           </p>
           <p className="text-[0.7rem] font-bold flex items-center gap-1">
              <Key size={12} className="text-accent" />
              {resource.tokenRate} <span className="text-[0.5rem] text-text-dim">/ 1M Tokens</span>
           </p>
        </div>
      </div>
    </div>

    <button 
      onClick={() => onRent(resource)}
      className="w-full py-3 rounded-xl bg-primary/10 text-primary font-bold hover:bg-primary hover:text-white transition-all flex items-center justify-center gap-2 group"
    >
      Rent This Model
      <Key size={16} className="group-hover:rotate-12 transition-transform" />
    </button>
  </motion.div>
);

const RentedApiCard = ({ resource }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const expires = new Date(resource.activeRental?.expiresAt);
      const diff = expires - now;

      if (diff <= 0) {
        setTimeLeft('Expired');
        clearInterval(timer);
      } else {
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeft(`${d}d ${h}h ${m}m`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [resource.activeRental?.expiresAt]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-8 glass-card bg-gradient-to-br from-success/5 to-primary/5 border-success/30 flex flex-col gap-6"
    >
      <div className="flex justify-between items-center">
        <div>
          <h4 className="text-xl font-black flex items-center gap-2">
            {resource.name}
            <div className="px-2 py-0.5 rounded bg-success text-[0.6rem] text-white uppercase">Active Access</div>
          </h4>
          <p className="text-xs text-text-dim">Host: {resource.host?.name} | Provider: <span className="capitalize">{resource.provider}</span></p>
        </div>
        <div className="text-right">
          <p className="text-[0.6rem] text-text-dim uppercase font-bold">Expires In</p>
          <p className="text-sm font-bold text-success tabular-nums">{timeLeft}</p>
        </div>
      </div>

    <div className="flex flex-col gap-4">
       <div className="p-4 bg-black/40 rounded-xl border border-white/5">
          <label className="text-[0.6rem] font-bold text-text-dim uppercase flex items-center gap-2 mb-2">
            <ExternalLink size={10} /> Your Proxy Endpoint
          </label>
          <div className="flex items-center justify-between gap-3 bg-white/5 p-2 px-3 rounded-lg border border-white/5 group">
             <code className="text-xs text-primary font-mono truncate">
               {window.location.origin}/api/resource/proxy/{resource._id}
             </code>
             <button 
               onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/resource/proxy/${resource._id}`)}
               className="text-[0.6rem] font-bold uppercase hover:text-white transition-colors"
             >
               Copy
             </button>
          </div>
       </div>

       <div className="flex flex-col gap-2">
          <p className="text-[0.65rem] font-bold text-white uppercase tracking-wider">How to use:</p>
          <ol className="text-[0.75rem] text-text-dim list-decimal pl-4 flex flex-col gap-1.5 font-medium leading-relaxed">
             <li>Send your requests to the **Proxy Endpoint** above.</li>
             <li>Include your standard **Authorize Token** in the headers.</li>
             <li>Send the request body as per the <span className="capitalize">{resource.provider}</span> standard.</li>
             <li>We will automatically attach the Host's API keys and forward the request safely.</li>
          </ol>
       </div>
    </div>

    <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 flex gap-3">
       <Shield className="text-orange-500 shrink-0" size={18} />
       <p className="text-[0.7rem] text-orange-200 leading-snug">
         **Security Note**: Your real API key is hidden. This proxy ensures your usage is tracked and paid for without exposing the host's primary credentials.
       </p>
    </div>
  </motion.div>
  );
};

const ApiMarket = () => {
  const { user } = useAuth();
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [viewFilter, setViewFilter] = useState('all'); // 'all', 'mine', or 'rented'
  const [showRentModal, setShowRentModal] = useState(false);
  const [selectedForRent, setSelectedForRent] = useState(null);
  const [rentHours, setRentHours] = useState(1);
  const [paying, setPaying] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ 
    name: '', provider: 'openai', customProviderName: '', apiKey: '', hourlyRate: 0.1, tokenRate: 1.0, billingCycle: 'hourly'
  });

  const fetchResources = async () => {
    try {
      setLoading(true);
      const url = viewFilter === 'rented' ? '/resource/rented' : '/resource';
      const resp = await api.get(url);
      setResources(resp.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, [viewFilter]);

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.patch(`/resource/${editingId}`, formData);
        alert("API Resource Updated!");
      } else {
        await api.post('/resource/register', formData);
        alert("API Resource Listed!");
      }
      setShowRegister(false);
      setEditingId(null);
      fetchResources();
    } catch (err) {
      alert("Action failed");
    }
  };

  const handleRent = async () => {
    if (!selectedForRent) return;
    try {
      await api.post('/resource/rent', { resourceId: selectedForRent._id, hours: rentHours });
      alert(`Success! You have rented ${selectedForRent.name}.`);
      setShowRentModal(false);
      fetchResources();
    } catch (err) {
      alert(err.response?.data?.message || "Rental failed");
    }
  };

  const handlePayAndRent = async () => {
    if (!selectedForRent) return;
    const amount = selectedForRent.hourlyRate * rentHours;
    try {
      setPaying(true);
      const { data: order } = await api.post('/billing/order', { amount });
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_placeholder',
        amount: order.amount,
        currency: order.currency,
        name: "ComputeGrid",
        description: `Rent ${selectedForRent.name} for ${rentHours} hours`,
        order_id: order.id,
        handler: async (response) => {
          try {
            await api.post('/billing/verify', { ...response, amountUSD: amount });
            await api.post('/resource/rent', { resourceId: selectedForRent._id, hours: rentHours });
            alert("Payment successful! Access granted.");
            setShowRentModal(false);
            fetchResources();
          } catch (err) {
            alert("Payment verified but access activation failed.");
          }
        },
        prefill: { name: user?.name, email: user?.email },
        theme: { color: "#3b82f6" },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      alert("Direct payment failed to initiate.");
    } finally {
      setPaying(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to remove this API listing?")) return;
    try {
      await api.delete(`/resource/${id}`);
      fetchResources();
    } catch (err) {
      alert("Delete failed");
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <header className="flex justify-between items-center">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tighter">AI Models & API Gateway</h1>
            <p className="text-text-dim mt-1">Rent high-end LLM tokens securely without exposing keys.</p>
          </div>
          <div className="flex bg-surface-hover glass-card rounded-xl p-1 w-fit">
            <button 
              onClick={() => setViewFilter('all')}
              className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${viewFilter === 'all' ? 'bg-primary text-white shadow-glow' : 'text-text-dim hover:text-white'}`}
            >
              Public Market
            </button>
            <button 
              onClick={() => setViewFilter('mine')}
              className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${viewFilter === 'mine' ? 'bg-primary text-white shadow-glow' : 'text-text-dim hover:text-white'}`}
            >
              My Listings
            </button>
            <button 
              onClick={() => setViewFilter('rented')}
              className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${viewFilter === 'rented' ? 'bg-primary text-white shadow-glow' : 'text-text-dim hover:text-white'}`}
            >
              Bought Keys
            </button>
          </div>
        </div>
        <button 
          onClick={() => setShowRegister(true)}
          className="glow-btn flex items-center gap-2 px-6 py-3"
        >
          <Plus size={18} />
          List My API Key
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={48} /></div>
      ) : resources.filter(res => viewFilter === 'all' || (res.host?._id || res.host) === (user?._id || user?.id) || viewFilter === 'rented').length === 0 ? (
        <div className="text-center py-20 text-text-dim">
           {viewFilter === 'all' ? "No API resources available." : viewFilter === 'rented' ? "You haven't bought any keys yet." : "You haven't listed any API resources yet."}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
           {resources.map(res => (
             viewFilter === 'rented' ? (
               <RentedApiCard key={res._id} resource={res} />
             ) : (
               <ApiCard 
                 key={res._id} 
                 resource={res} 
                 onRent={() => { setSelectedForRent(res); setShowRentModal(true); }} 
                 onEdit={(res.host?._id || res.host) === (user?._id || user?.id) ? (r) => { 
                   setFormData({ name: r.name, provider: r.provider, customProviderName: r.customProviderName, apiKey: '', hourlyRate: r.hourlyRate, tokenRate: r.tokenRate, billingCycle: r.billingCycle || 'hourly' }); 
                   setEditingId(r._id);
                   setShowRegister(true); 
                 } : null}
                 onDelete={(res.host?._id || res.host) === (user?._id || user?.id) ? handleDelete : null}
               />
             )
           ))}
        </div>
      )}

      {/* Rent Modal */}
      <AnimatePresence>
        {showRentModal && selectedForRent && (
          <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setShowRentModal(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card w-full max-w-sm p-8 relative flex flex-col gap-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Rent API Resource</h3>
                <button onClick={() => setShowRentModal(false)}><X size={20} /></button>
              </div>

              <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                 <p className="text-[0.6rem] text-text-dim uppercase font-bold mb-1">Resource</p>
                 <p className="font-bold text-white">{selectedForRent.name}</p>
                 <p className="text-xs text-primary capitalize">{selectedForRent.provider}</p>
              </div>

              <div className="flex flex-col gap-2">
                 <label className="text-[0.7rem] font-bold text-text-dim uppercase">Rental Duration (Hours)</label>
                 <div className="flex items-center gap-4">
                    <input 
                       type="range" min="1" max="24" step="1"
                       className="flex-1 accent-primary h-2 bg-white/10 rounded-lg appearance-none cursor-pointer" 
                       value={rentHours} onChange={e => setRentHours(parseInt(e.target.value))}
                    />
                    <span className="w-10 text-center font-bold text-primary">{rentHours}h</span>
                 </div>
              </div>

              <div className="flex justify-between items-center p-4 bg-white/5 rounded-xl border border-white/5">
                 <div className="flex flex-col">
                    <p className="text-[0.6rem] text-text-dim uppercase font-bold">Total Cost</p>
                    <p className="text-xl font-black text-success">${(selectedForRent.hourlyRate * rentHours).toFixed(2)}</p>
                 </div>
                 <CreditCard className="text-text-dim opacity-20" size={32} />
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={handlePayAndRent}
                  disabled={paying}
                  className="glow-btn py-4 font-bold flex items-center justify-center gap-2"
                >
                  {paying ? <Loader2 className="animate-spin text-white" size={18} /> : (
                    <>
                      <DollarSign size={18} />
                      Pay Directly
                    </>
                  )}
                </button>
                <button 
                  onClick={handleRent}
                  className="py-3 text-sm font-bold text-text-dim hover:text-white transition-all bg-white/5 rounded-xl"
                >
                  Use Account Balance
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Register Modal */}
      <AnimatePresence>
        {showRegister && (
          <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => { setShowRegister(false); setEditingId(null); }}
            />
            <motion.form 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onSubmit={handleRegister}
              className="glass-card w-full max-md p-8 relative flex flex-col gap-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">{editingId ? 'Update API Resource' : 'List API Resource'}</h3>
                <button type="button" onClick={() => { setShowRegister(false); setEditingId(null); }}><X size={20} /></button>
              </div>
              
              <div className="flex flex-col gap-2">
                 <label className="text-[0.7rem] font-bold text-text-dim uppercase">Resource Name</label>
                 <input 
                    type="text" className="bg-white/5 border border-white/10 p-3 rounded-xl focus:border-primary outline-none" 
                    placeholder="e.g. GPT-4 High Priority" required
                    value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                 />
              </div>

              <div className="flex flex-col gap-2">
                 <label className="text-[0.7rem] font-bold text-text-dim uppercase">Provider</label>
                 <select 
                    className="bg-white/5 border border-white/10 p-3 rounded-xl focus:border-primary outline-none"
                    value={formData.provider} onChange={e => setFormData({...formData, provider: e.target.value})}
                 >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google Gemini</option>
                    <option value="custom">Custom Provider</option>
                 </select>
              </div>

              {formData.provider === 'custom' && (
                <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
                   <label className="text-[0.7rem] font-bold text-text-dim uppercase">Provider Name</label>
                   <input 
                      type="text" className="bg-white/5 border border-white/10 p-3 rounded-xl focus:border-primary outline-none" 
                      placeholder="e.g. Mistral, DeepSeek, MyService" required
                      value={formData.customProviderName} onChange={e => setFormData({...formData, customProviderName: e.target.value})}
                   />
                </div>
              )}

              <div className="flex flex-col gap-2">
                 <label className="text-[0.7rem] font-bold text-text-dim uppercase">API Key (Securely Encrypted)</label>
                 <div className="relative">
                    <Key className="absolute left-3 top-3.5 text-text-dim" size={16} />
                    <input 
                       type="password" className="bg-white/5 border border-white/10 p-3 pl-10 rounded-xl w-full focus:border-primary outline-none" 
                       placeholder="sk-..." required
                       value={formData.apiKey} onChange={e => setFormData({...formData, apiKey: e.target.value})}
                    />
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                   <label className="text-[0.7rem] font-bold text-text-dim uppercase">Hourly Rate ($)</label>
                   <input 
                      type="number" step="0.01" className="bg-white/5 border border-white/10 p-3 rounded-xl focus:border-primary outline-none" 
                      required
                      value={formData.hourlyRate} onChange={e => setFormData({...formData, hourlyRate: e.target.value})}
                   />
                </div>
                <div className="flex flex-col gap-2">
                   <label className="text-[0.7rem] font-bold text-text-dim uppercase">Price / 1M Tokens ($)</label>
                   <input 
                      type="number" step="0.1" className="bg-white/5 border border-white/10 p-3 rounded-xl focus:border-primary outline-none" 
                      required
                      value={formData.tokenRate} onChange={e => setFormData({...formData, tokenRate: e.target.value})}
                   />
                </div>
              </div>

              <button type="submit" className="glow-btn py-4 font-bold flex items-center justify-center gap-2 mt-2">
                <Shield size={18} />
                {editingId ? 'Update Resource' : 'Securely List Resource'}
              </button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ApiMarket;
