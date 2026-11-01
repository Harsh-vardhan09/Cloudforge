import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, PlayCircle, Loader2, Server, Cpu, Layers, CreditCard, 
  Sparkles, Bot, Check, ArrowRight, Lightbulb, Code2, AlertTriangle,
  UploadCloud, FileCode, CheckCircle2, Trash2, ListOrdered
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const AI_PRESETS = [
  { label: 'PyTorch CUDA Benchmark', prompt: 'Matrix multiplication benchmark with CUDA TFLOPs calculation' },
  { label: 'Train CNN (CIFAR-10)', prompt: 'Train a CNN model on GPU with synthetic batch tensors' },
  { label: 'Whisper Speech to Text', prompt: 'Setup OpenAI Whisper for GPU audio transcription' },
  { label: 'HuggingFace LLM Stack', prompt: 'Load HuggingFace transformer tokenizer and test GPU inference' },
  { label: 'Stable Diffusion Latents', prompt: 'Test FP16 latent tensor pipeline for Stable Diffusion' },
];

const SAMPLE_SCRIPTS = {
  mnist: {
    name: 'train_mnist.py',
    content: `import torch
import torch.nn as nn
import torch.optim as optim
import time

print(f"CUDA Available: {torch.cuda.is_available()}")
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})")

class Net(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv = nn.Conv2d(1, 32, 3)
        self.fc = nn.Linear(32 * 26 * 26, 10)
    def forward(self, x):
        return self.fc(torch.relu(self.conv(x)).flatten(1))

model = Net().to(device)
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

print("Starting 10 synthetic training epochs...")
for epoch in range(1, 11):
    x = torch.randn(64, 1, 28, 28, device=device)
    y = torch.randint(0, 10, (64,), device=device)
    optimizer.zero_grad()
    loss = criterion(model(x), y)
    loss.backward()
    optimizer.step()
    print(f"Epoch {epoch:02d}/10 | Loss: {loss.item():.4f}")

print("Training finished successfully on GPU!")
`
  },
  benchmark: {
    name: 'cuda_benchmark.py',
    content: `import torch
import time

print("Initializing CUDA Benchmark...")
if not torch.cuda.is_available():
    print("CUDA is unavailable!")
    exit(1)

device = "cuda"
print(f"Device: {torch.cuda.get_device_name(0)}")
n = 8192
a = torch.randn(n, n, device=device)
b = torch.randn(n, n, device=device)

# Warmup
torch.matmul(a, b)
torch.cuda.synchronize()

print(f"Running 10 matrix multiplications ({n}x{n})...")
t0 = time.time()
for _ in range(10):
    torch.matmul(a, b)
torch.cuda.synchronize()
avg_time = (time.time() - t0) / 10.0

tflops = (2 * n**3) / (avg_time * 1e12)
print(f"Average time: {avg_time*1000:.2f} ms")
print(f"Compute Throughput: {tflops:.2f} TFLOPs")
print("Benchmark completed with 0 errors.")
`
  }
};

const JobLaunchModal = ({ gpu = null, onClose, onSuccess, initialConfig = null, defaultTab = 'script' }) => {
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  // Tab mode: 'script' (Upload Script) or 'command' (Raw Command)
  const [tabMode, setTabMode] = useState(defaultTab);

  // Script Upload state
  const [scriptName, setScriptName] = useState(initialConfig?.scriptName || '');
  const [scriptContent, setScriptContent] = useState(initialConfig?.scriptContent || '');

  const [formData, setFormData] = useState({
    dockerImage: initialConfig?.dockerImage || 'pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime', 
    command: initialConfig?.command || 'python -c "import torch; print(f\\"GPU Available: {torch.cuda.is_available()}\\"); print(\\"Starting compute task...\\"); import time; time.sleep(5); print(\\"Task complete!\\")"',
    vramRequired: initialConfig?.vramRequired || gpu?.vram || 8
  });

  const [loading, setLoading] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  // AI Assistant States
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiApplied, setAiApplied] = useState(false);

  // Handle file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(py|sh)$/i.test(file.name)) {
      setError('Only Python (.py) and shell (.sh) scripts can be uploaded.');
      e.target.value = '';
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('Scripts must be 50 MB or smaller.');
      e.target.value = '';
      return;
    }

    setError('');
    setScriptName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result || '';
      setScriptContent(content);

      // Auto-set execution command
      const cmd = file.name.toLowerCase().endsWith('.sh')
        ? `bash /workspace/${file.name}` 
        : `python /workspace/${file.name}`;
      setFormData(prev => ({ ...prev, command: cmd }));
    };
    reader.readAsText(file);
  };

  const handleLoadSample = (key) => {
    const sample = SAMPLE_SCRIPTS[key];
    if (!sample) return;
    setScriptName(sample.name);
    setScriptContent(sample.content);
    setFormData(prev => ({
      ...prev,
      command: `python /workspace/${sample.name}`
    }));
  };

  const handleClearScript = () => {
    setScriptName('');
    setScriptContent('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAskAi = async (customPrompt) => {
    const promptToSend = customPrompt || aiPrompt;
    if (!promptToSend && !formData.command && !scriptContent) return;

    try {
      setAiLoading(true);
      setError('');
      const resp = await api.post('/ai/assistant', {
        prompt: promptToSend,
        gpuModel: gpu?.model,
        gpuVram: gpu?.vram,
        currentCommand: formData.command,
        currentImage: formData.dockerImage,
      });

      setAiResult(resp.data);
      setAiApplied(false);
    } catch (err) {
      console.error('AI Assistant Error:', err);
      setError(err.response?.data?.message || 'AI Assistant service unavailable');
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyAiSuggestion = () => {
    if (!aiResult) return;
    setFormData({
      dockerImage: aiResult.dockerImage || formData.dockerImage,
      command: aiResult.command || formData.command,
      vramRequired: aiResult.vramRequired !== undefined ? aiResult.vramRequired : formData.vramRequired,
    });
    setAiApplied(true);
    setTimeout(() => {
      setShowAiAssistant(false);
      setAiApplied(false);
    }, 1200);
  };

  const submitJob = async () => {
    let inputObjectKey = '';
    if (scriptName) {
      const contentType = scriptName.toLowerCase().endsWith('.sh')
        ? 'text/x-shellscript'
        : 'text/x-python';
      const scriptBlob = new Blob([scriptContent], { type: contentType });
      const { data: upload } = await api.post('/jobs/uploads/presign', {
        fileName: scriptName,
        size: scriptBlob.size,
      });
      const uploadFormData = new FormData();
      Object.entries(upload.fields).forEach(([key, value]) => uploadFormData.append(key, value));
      uploadFormData.append('file', scriptBlob, scriptName);
      const uploadResponse = await fetch(upload.url, { method: 'POST', body: uploadFormData });
      if (!uploadResponse.ok) {
        throw new Error('Could not upload script to object storage.');
      }
      inputObjectKey = upload.objectKey;
    }

    const payload = {
      ...formData,
      vramRequired: parseFloat(formData.vramRequired),
      gpuId: gpu?._id,
      scriptName: scriptName || "",
      inputObjectKey,
    };
    const resp = await api.post('/jobs', payload);
    onSuccess(resp.data);
    onClose();
  };

  // Module 4: Explicit Queue Submission
  const handleQueueJob = async () => {
    try {
      setQueuing(true);
      setError('');
      await submitJob();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to queue job.');
    } finally {
      setQueuing(false);
    }
  };

  // Immediate Launch
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await submitJob();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to submit job.');
    } finally {
      setLoading(false);
    }
  };

  const handlePayAndLaunch = async () => {
    const amount = gpu?.pricePerHour || 1.0;
    try {
      setPaying(true);
      setError('');
      const { data: order } = await api.post('/billing/order', { amount });

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_placeholder',
        amount: order.amount,
        currency: order.currency,
        name: "ComputeGrid",
        description: `Direct Launch on ${gpu?.model || 'GPU'}`,
        order_id: order.id,
        handler: async (response) => {
          try {
            await api.post('/billing/verify', { ...response, amountUSD: amount });
            await submitJob();
          } catch {
            setError("Payment verified but job dispatch failed.");
          }
        },
        prefill: { name: user?.name, email: user?.email },
        theme: { color: "#3b82f6" },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch {
      setError("Failed to initiate direct payment.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[1001] p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/85 backdrop-blur-md"
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-2xl glass-card p-6 md:p-8 relative overflow-hidden flex flex-col gap-5 max-h-[92vh] overflow-y-auto"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-purple-500 to-accent" />
        
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <PlayCircle className="text-primary" />
                Submit Compute Job
              </h2>
              <span className="px-2 py-0.5 rounded text-[0.65rem] font-extrabold uppercase tracking-wider bg-primary/20 text-primary border border-primary/30">
                {gpu ? gpu.model : 'Cluster Pool'}
              </span>
            </div>
            <p className="text-xs text-text-dim">
              Module 4: Upload a script to queue or deploy on the GPU cluster
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAiAssistant(!showAiAssistant)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border ${
                showAiAssistant 
                  ? 'bg-purple-600/30 text-purple-300 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.4)]' 
                  : 'bg-white/5 text-purple-400 border-purple-500/20 hover:bg-purple-500/10'
              }`}
            >
              <Sparkles size={14} className="text-purple-400 animate-pulse" />
              {showAiAssistant ? 'Hide AI' : '✨ AI Assistant'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-text-dim hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab Switcher: Upload Script vs Command */}
        <div className="flex p-1 bg-white/5 rounded-xl border border-white/10 gap-1">
          <button
            type="button"
            onClick={() => setTabMode('script')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              tabMode === 'script'
                ? 'bg-primary text-white shadow-glow'
                : 'text-text-dim hover:text-white hover:bg-white/5'
            }`}
          >
            <UploadCloud size={14} />
            Upload Script (.py / .sh)
          </button>
          <button
            type="button"
            onClick={() => setTabMode('command')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              tabMode === 'command'
                ? 'bg-primary text-white shadow-glow'
                : 'text-text-dim hover:text-white hover:bg-white/5'
            }`}
          >
            <Code2 size={14} />
            Inline Command
          </button>
        </div>

        {/* AI Assistant Drawer */}
        <AnimatePresence>
          {showAiAssistant && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-purple-950/20 border border-purple-500/30 rounded-2xl p-5 flex flex-col gap-4 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="text-purple-400" size={18} />
                  <span className="text-sm font-bold text-white">AI Script Assistant & Validator</span>
                </div>
                <span className="text-[0.65rem] text-purple-300/80 uppercase tracking-widest font-mono">
                  Module 9 Helper
                </span>
              </div>

              {/* Quick Prompt Presets */}
              <div className="flex flex-wrap gap-2">
                {AI_PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setAiPrompt(p.prompt);
                      handleAskAi(p.prompt);
                    }}
                    className="text-[0.7rem] px-2.5 py-1 rounded-md bg-white/5 hover:bg-purple-500/20 border border-white/5 hover:border-purple-500/30 text-text-dim hover:text-white transition-all text-left"
                  >
                    ⚡ {p.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Describe your workload..."
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAskAi())}
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-400 text-white placeholder-white/30"
                />
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={() => handleAskAi()}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-primary text-white text-xs font-bold rounded-xl hover:opacity-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Generate
                </button>
              </div>

              {aiResult && (
                <div className="bg-black/60 rounded-xl p-4 border border-purple-500/20 flex flex-col gap-3 text-xs">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-purple-300 flex items-center gap-1.5">
                        <Lightbulb size={14} /> AI Recommendation
                      </p>
                      <p className="text-[0.75rem] text-text-dim mt-0.5">{aiResult.explanation}</p>
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleApplyAiSuggestion}
                      disabled={aiApplied}
                      className="px-4 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-glow transition-all flex items-center gap-1.5"
                    >
                      {aiApplied ? <Check size={14} /> : <ArrowRight size={14} />}
                      {aiApplied ? 'Applied!' : 'Apply AI Suggestion'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {tabMode === 'script' ? (
            /* Script Upload Area */
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <label className="text-[0.75rem] font-bold uppercase text-text-dim flex items-center gap-2">
                  <FileCode size={14} /> Upload Python / Shell Script
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleLoadSample('mnist')}
                    className="text-[0.65rem] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-primary border border-primary/20 transition-all"
                  >
                    Load train_mnist.py
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSample('benchmark')}
                    className="text-[0.65rem] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-accent border border-accent/20 transition-all"
                  >
                    Load benchmark.py
                  </button>
                </div>
              </div>

              {/* Upload Dropzone */}
              {!scriptName ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/15 hover:border-primary/50 bg-white/[0.02] hover:bg-primary/[0.03] rounded-2xl p-6 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-all group"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".py,.sh"
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                    <UploadCloud size={24} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-white">Click to upload or drag & drop</p>
                    <p className="text-xs text-text-dim">Supports .py, .sh, or custom compute scripts</p>
                  </div>
                </div>
              ) : (
                <div className="bg-black/50 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-primary/20 text-primary">
                        <FileCode size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white font-mono">{scriptName}</p>
                        <p className="text-[0.65rem] text-text-dim">
                          {scriptContent.split('\n').length} lines • {new Blob([scriptContent]).size} bytes
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearScript}
                      className="p-1.5 text-text-dim hover:text-error hover:bg-error/10 rounded-lg transition-all"
                      title="Remove Script"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Code preview */}
                  <textarea
                    rows={6}
                    value={scriptContent}
                    onChange={(e) => setScriptContent(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-xs font-mono leading-relaxed text-[#c9d1d9] focus:outline-none focus:border-primary/50 resize-none"
                    placeholder="Script content..."
                  />
                </div>
              )}

              {/* Generated Entrypoint */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[0.7rem] font-bold uppercase text-text-dim">Execution Entrypoint</label>
                <input
                  type="text"
                  value={formData.command}
                  onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                  className="bg-white/5 border border-white/10 p-2.5 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          ) : (
            /* Raw Command Input */
            <div className="flex flex-col gap-2">
              <label className="text-[0.75rem] font-bold uppercase text-text-dim flex items-center gap-2">
                <Layers size={14} /> Command (Bash or Python)
              </label>
              <textarea 
                rows={5}
                className="bg-white/5 border border-white/10 p-3 rounded-xl text-xs font-mono focus:outline-none focus:border-primary transition-all resize-none leading-relaxed text-[#c9d1d9]"
                value={formData.command}
                onChange={(e) => setFormData({...formData, command: e.target.value})}
                required
              />
            </div>
          )}

          {/* Docker Image & VRAM */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[0.75rem] font-bold uppercase text-text-dim flex items-center gap-2">
                <Server size={14} /> Docker Environment
              </label>
              <input 
                type="text" 
                className="bg-white/5 border border-white/10 p-2.5 rounded-xl text-xs focus:outline-none focus:border-primary font-mono text-white"
                value={formData.dockerImage}
                onChange={(e) => setFormData({...formData, dockerImage: e.target.value})}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[0.75rem] font-bold uppercase text-text-dim flex items-center gap-2">
                <Cpu size={14} /> VRAM Requirement (GB)
              </label>
              <input 
                type="number" 
                step="0.5"
                className="bg-white/5 border border-white/10 p-2.5 rounded-xl text-xs focus:outline-none focus:border-primary font-mono text-white"
                value={formData.vramRequired}
                onChange={(e) => setFormData({...formData, vramRequired: e.target.value})}
                required
              />
            </div>
          </div>

          {error && (
             <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-[0.75rem] font-bold text-center flex items-center justify-center gap-2">
                <AlertTriangle size={14} />
                {error}
             </div>
          )}

          {/* Submit Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            {/* Module 4: Queue Script Button */}
            <button 
              type="button"
              disabled={loading || queuing}
              onClick={handleQueueJob}
              className="flex-1 py-3 px-5 rounded-xl font-bold text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {queuing ? <Loader2 className="animate-spin" size={16} /> : (
                <>
                  <ListOrdered size={16} />
                  Queue Script (Module 4)
                </>
              )}
            </button>

            {/* Direct Launch Buttons */}
            {gpu && (
              <button 
                type="button"
                disabled={loading || paying || queuing}
                onClick={handlePayAndLaunch}
                className="py-3 px-5 rounded-xl font-bold text-xs bg-primary text-white hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {paying ? <Loader2 className="animate-spin text-white" size={16} /> : (
                  <>
                    <CreditCard size={16} />
                    Pay & Run
                  </>
                )}
              </button>
            )}

            <button 
              type="submit"
              disabled={loading || paying || queuing}
              className="flex-1 py-3 px-5 rounded-xl font-bold text-xs bg-white/10 hover:bg-white/15 text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : (
                <>
                  Launch Now
                  <PlayCircle size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default JobLaunchModal;
