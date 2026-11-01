import React, { useState, useEffect } from 'react';
import { motion as Motion } from 'framer-motion';
import { Wallet, PieChart, History, ArrowUpRight, ArrowDownLeft, Loader2, CircleDollarSign, ArrowDownToLine } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const Billing = () => {
  const { user, fetchUser } = useAuth();
  const [data, setData] = useState({ creditBalance: 0, transactions: [] });
  const [loading, setLoading] = useState(true);
  const [addingFunds, setAddingFunds] = useState(false);
  const [customAmount, setCustomAmount] = useState('');

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/billing/history');
      setData(response.data);
    } catch (err) {
      console.error('Failed to fetch billing data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
  }, []);

  const initiatePayment = async (amountInINR) => {
    if (!amountInINR || isNaN(amountInINR) || amountInINR <= 0) return;

    try {
      setAddingFunds(true);
      // 1. Create order on backend
      const { data: order } = await api.post('/billing/order', { amount: parseFloat(amountInINR) });

      // 2. Open Razorpay Checkout
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_placeholder',
        amount: order.amount,
        currency: order.currency,
        name: "HelloSharing",
        description: `Add ${order.creditsToReceive} Credits to wallet`,
        order_id: order.id,
        handler: async (response) => {
          // 3. Verify payment on backend
          try {
            // The server credits the amount recorded when the order was created,
            // so only the Razorpay handshake fields are sent here.
            await api.post('/billing/verify', { ...response });
            alert("Payment successful! Credits added.");
            fetchBillingData();
            fetchUser(); // Refresh user context balance
          } catch {
            alert("Payment verification failed. Please contact support.");
          }
        },
        prefill: {
          name: user?.name,
          email: user?.email,
        },
        theme: {
          color: "#3b82f6",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error("Razorpay error:", err);
      alert("Failed to initiate payment.");
    } finally {
      setAddingFunds(false);
    }
  };

  const handleCustomAmountSubmit = (e) => {
    e.preventDefault();
    initiatePayment(customAmount);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-primary" size={48} />
        <span className="text-text-dim font-medium tracking-tight">Accessing Secure Vault...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.5fr)]">
      <div className="flex flex-col gap-4">
        <Motion.div
          whileHover={{ y: -3 }}
          className="glass-card relative overflow-hidden border-primary/15 bg-[radial-gradient(ellipse_at_95%_0%,rgba(197,243,106,0.12),transparent_45%),linear-gradient(145deg,#192119,#111613)] p-6 sm:p-7"
        >
          <div className="pointer-events-none absolute -right-9 -top-9 text-primary/[0.06]">
             <CircleDollarSign size={170} strokeWidth={0.75} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Wallet size={19} />
              </div>
              <span className="eyebrow">Wallet balance</span>
            </div>
            <p className="mt-8 text-xs font-medium text-text-dim">Available Credits</p>
            <h2 className="mt-1 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              {data.creditBalance ? data.creditBalance.toFixed(2) : '0.00'}<span className="ml-2 text-sm font-medium text-text-dim">CR</span>
            </h2>
            
            <div className="mt-7 flex flex-col gap-3">
              <span className="text-xs font-semibold text-text-dim uppercase tracking-wider">Buy Credits (1 INR = 1 CR)</span>
              <div className="flex flex-wrap items-center gap-2">
                {[500, 1000, 5000].map(amt => (
                  <button
                    key={amt}
                    onClick={() => initiatePayment(amt)}
                    disabled={addingFunds}
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2 px-3 text-sm font-medium hover:bg-white/10 hover:border-primary/50 transition-colors"
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
              <form onSubmit={handleCustomAmountSubmit} className="flex items-center gap-2 mt-1">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim text-sm">₹</span>
                  <input 
                    type="number"
                    min="1"
                    placeholder="Custom Amount"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-7 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={addingFunds || !customAmount}
                  className="glow-btn flex items-center justify-center gap-2 px-4 py-2 text-sm whitespace-nowrap disabled:opacity-50"
                >
                  {addingFunds ? <Loader2 className="animate-spin" size={16} /> : <ArrowDownToLine size={16} />}
                  Add
                </button>
              </form>
            </div>
          </div>
        </Motion.div>

        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PieChart size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-text-dim">Active usage</span>
              <span className="font-mono text-sm font-semibold text-white">0.00 CR/hr</span>
            </div>
          </div>
          <div className="glass-card flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <History size={19} />
            </div>
            <div className="flex flex-col">
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-text-dim">Transactions</span>
              <span className="font-mono text-sm font-semibold text-white">{data.transactions.length} records</span>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card flex min-w-0 flex-col p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div>
            <span className="eyebrow">Account activity</span>
            <h3 className="mt-1 text-lg font-semibold">Transaction & Usage History</h3>
          </div>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-[0.62rem] text-text-dim">
            {data.transactions.length} total
          </span>
        </div>

        <div className="flex max-h-[560px] flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {data.transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-14 text-text-dim">
               <History size={32} className="mb-3 text-primary/50" />
               <span className="text-sm font-medium text-white">Nothing here yet</span>
               <span className="mt-1 text-xs">Your deposits and usage will show up here.</span>
            </div>
          ) : (
            data.transactions.map((tx) => (
              <div key={tx._id} className="flex flex-wrap items-center gap-3 rounded-xl border border-transparent bg-white/[0.02] p-3.5 transition-all hover:border-white/[0.07] hover:bg-white/[0.04] sm:flex-nowrap sm:gap-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                  ${tx.type === 'deposit' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                  {tx.type === 'deposit' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium capitalize text-white">{tx.type} {tx.razorpayPaymentId ? `· ${tx.razorpayPaymentId.substring(0,8)}` : ''}</span>
                  <span className="mt-0.5 text-[0.68rem] text-text-dim">{new Date(tx.createdAt).toLocaleString()}</span>
                </div>
                <span className={`ml-auto font-mono text-sm font-semibold ${tx.type === 'deposit' ? 'text-success' : 'text-error'}`}>
                  {tx.type === 'deposit' ? '+' : '-'}{tx.type === 'deposit' ? tx.creditsAdded : tx.amount?.toFixed(2)} CR
                </span>
                <div className={`rounded-full border px-2 py-1 text-[0.58rem] font-semibold uppercase tracking-wider ${tx.status === 'completed' ? 'border-success/15 bg-success/5 text-success' : 'border-white/10 bg-white/[0.03] text-text-dim'}`}>
                  {tx.status}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Billing;
