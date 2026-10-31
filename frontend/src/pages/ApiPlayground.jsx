import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Loader2, Sparkles, Trash2, Cpu, MessageSquare, ShieldCheck, Zap } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const ApiPlayground = () => {
    const { token } = useAuth();
    const [rentedModels, setRentedModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [fetchingModels, setFetchingModels] = useState(true);
    const scrollRef = useRef(null);

    useEffect(() => {
        const fetchRented = async () => {
            try {
                setFetchingModels(true);
                const resp = await api.get('/resource/rented');
                setRentedModels(resp.data);
                if (resp.data.length > 0) setSelectedModel(resp.data[0]);
            } catch (err) {
                console.error("Failed to fetch rented models");
            } finally {
                setFetchingModels(false);
            }
        };
        fetchRented();
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || !selectedModel || loading) return;

        const userMsg = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const resp = await api.post(`/resource/proxy/${selectedModel._id}`, {
                messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
            });

            const assistantMsg = { 
                role: 'assistant', 
                content: selectedModel.provider === 'anthropic' ? resp.data.content[0].text : resp.data.choices[0].message.content 
            };
            setMessages(prev => [...prev, assistantMsg]);
        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', content: "Error: Failed to process request through the proxy.", isError: true }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] gap-6">
            <header className="flex justify-between items-center bg-white/[0.02] p-4 px-6 rounded-2xl border border-white/5 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                        <MessageSquare size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">AI Playground</h2>
                        <p className="text-[0.65rem] text-text-dim uppercase tracking-widest font-black">Interactive Sandbox</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {fetchingModels ? (
                        <Loader2 className="animate-spin text-primary" size={20} />
                    ) : (
                        <select 
                            className="bg-black/40 border border-white/10 rounded-xl p-2 px-4 text-xs font-bold outline-none focus:border-primary transition-all"
                            value={selectedModel?._id || ''}
                            onChange={(e) => setSelectedModel(rentedModels.find(m => m._id === e.target.value))}
                        >
                            {rentedModels.length > 0 ? rentedModels.map(m => (
                                <option key={m._id} value={m._id}>{m.name} ({m.provider})</option>
                            )) : (
                                <option value="">No active rentals</option>
                            )}
                        </select>
                    )}
                    <button 
                        onClick={() => setMessages([])}
                        className="p-2.5 rounded-xl bg-white/5 hover:bg-error/20 hover:text-error transition-all border border-white/5"
                        title="Clear Chat"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </header>

            <main className="flex-1 flex flex-col glass-card relative overflow-hidden bg-gradient-to-b from-transparent to-primary/5">
                {/* Background Decor */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none">
                   <Sparkles size={400} className="text-primary animate-pulse" />
                </div>

                <div 
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-8 flex flex-col gap-6 scroll-smooth"
                >
                    {messages.length === 0 && (
                        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 opacity-40">
                            <Bot size={64} className="text-primary" />
                            <div>
                                <h3 className="text-xl font-bold">Start a conversation</h3>
                                <p className="text-sm max-w-xs mx-auto">This playground uses your rented keys securely. Credits are deducted based on usage.</p>
                            </div>
                        </div>
                    )}

                    <AnimatePresence initial={false}>
                        {messages.map((msg, i) => (
                            <motion.div 
                                key={i}
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-primary text-white' : 'bg-secondary/20 text-secondary'}`}>
                                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                                </div>
                                <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                                    msg.role === 'user' 
                                    ? 'bg-primary/20 border border-primary/20 text-white rounded-tr-none' 
                                    : 'bg-white/5 border border-white/5 text-text-dim rounded-tl-none'
                                } ${msg.isError ? 'border-error/50 text-error bg-error/5' : ''}`}>
                                    {msg.content}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {loading && (
                        <div className="flex gap-4 max-w-[80%]">
                             <div className="w-8 h-8 rounded-lg bg-secondary/20 text-secondary flex items-center justify-center shrink-0 animate-pulse">
                                <Bot size={16} />
                            </div>
                            <div className="p-4 bg-white/5 border border-white/5 rounded-2xl rounded-tl-none flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 pt-0">
                    <form onSubmit={handleSend} className="relative group">
                        <div className="absolute inset-0 bg-primary/20 blur-xl opacity-0 group-focus-within:opacity-30 transition-opacity rounded-2xl" />
                        <input 
                            type="text"
                            placeholder={selectedModel ? `Message ${selectedModel.name}...` : "Please rent a model first"}
                            disabled={!selectedModel || loading}
                            className="w-full bg-black/40 border border-white/10 p-5 pr-16 rounded-2xl outline-none focus:border-primary/50 backdrop-blur-xl transition-all relative z-[1]"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                        />
                        <button 
                            type="submit"
                            disabled={!selectedModel || loading || !input.trim()}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all z-[2]"
                        >
                            <Send size={18} />
                        </button>
                    </form>
                    <div className="flex justify-between items-center mt-4 px-2">
                        <div className="flex gap-4">
                            <div className="flex items-center gap-1.5 text-[0.6rem] text-text-dim font-bold uppercase tracking-widest">
                                <ShieldCheck size={12} className="text-success" />
                                Proxy Verified
                            </div>
                            <div className="flex items-center gap-1.5 text-[0.6rem] text-text-dim font-bold uppercase tracking-widest">
                                <Zap size={12} className="text-accent" />
                                Instant Billing
                            </div>
                        </div>
                        {selectedModel && (
                            <p className="text-[0.65rem] text-primary/60 font-black italic">
                                Rates: ${selectedModel.hourlyRate}/hr + ${selectedModel.tokenRate}/1M tokens
                            </p>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ApiPlayground;
