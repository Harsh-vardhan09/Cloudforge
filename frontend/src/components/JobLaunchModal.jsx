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
  { label: 'Auto-Checkpointing (Resume)', prompt: 'Add cooperative checkpointing with CHECKPOINT_DIR so this workload survives host reclaims without progress loss' },
  { label: 'Run Jupyter Notebook (.ipynb)', prompt: 'Configure headless Jupyter Notebook runner with nbconvert and CUDA isolation' },
  { label: 'PyTorch CUDA Benchmark', prompt: 'Matrix multiplication benchmark with CUDA TFLOPs calculation' },
  { label: 'Train CNN (CIFAR-10 / MNIST)', prompt: 'Train a CNN model on GPU with synthetic batch tensors' },
  { label: 'Whisper Speech to Text', prompt: 'Setup OpenAI Whisper for GPU audio transcription' },
  { label: 'HuggingFace LLM Stack', prompt: 'Load HuggingFace transformer tokenizer and test GPU inference' },
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
  checkpoint: {
    name: 'train_with_checkpoint.py',
    content: `import os
import json
import time
import torch
import torch.nn as nn
import torch.optim as optim

checkpoint_dir = os.environ.get("CHECKPOINT_DIR", "/workspace/checkpoints")
os.makedirs(checkpoint_dir, exist_ok=True)
resume = os.environ.get("RESUME_FROM_CHECKPOINT", "false").lower() == "true"
start_step = int(os.environ.get("CHECKPOINT_STEP", "0"))

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"CUDA Available: {torch.cuda.is_available()} | Device: {device}")

class Net(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc = nn.Sequential(nn.Linear(128, 64), nn.ReLU(), nn.Linear(64, 10))
    def forward(self, x):
        return self.fc(x)

model = Net().to(device)
optimizer = optim.Adam(model.parameters(), lr=0.001)
checkpoint_file = os.path.join(checkpoint_dir, "model_state.pt")

if resume and os.path.exists(checkpoint_file):
    print(f"Resuming workload from checkpoint at step {start_step}...")
    ckpt = torch.load(checkpoint_file, map_location=device)
    model.load_state_dict(ckpt["model"])
    optimizer.load_state_dict(ckpt["optimizer"])
    print("Checkpoint restored successfully!")

total_steps = 25
print(f"Starting training steps {start_step + 1} to {total_steps}...")

for step in range(start_step + 1, total_steps + 1):
    x = torch.randn(32, 128, device=device)
    y = torch.randint(0, 10, (32,), device=device)
    loss = nn.functional.cross_entropy(model(x), y)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    print(f"Step {step:02d}/{total_steps} | Loss: {loss.item():.4f}")
    time.sleep(0.4)

    # Cooperative checkpoint snapshot (every 5 steps)
    if step % 5 == 0 or step == total_steps:
        torch.save({"step": step, "model": model.state_dict(), "optimizer": optimizer.state_dict()}, checkpoint_file)
        with open(os.path.join(checkpoint_dir, "checkpoint.json"), "w") as f:
            json.dump({"step": step, "totalSteps": total_steps}, f)
        print(f"Saved snapshot {step}/{total_steps} to {checkpoint_dir}")

print("Workload finished successfully with full checkpoint support!")
`
  },
  notebook: {
    name: 'quickstart_tensor.ipynb',
    content: JSON.stringify({
      cells: [
        {
          cell_type: "markdown",
          metadata: {},
          source: [
            "# 🚀 IdleLab Quickstart Notebook\n",
            "This Jupyter Notebook runs directly on the decentralized GPU grid.\n",
            "Output cells, loss calculations, and CUDA execution metrics are automatically captured."
          ]
        },
        {
          cell_type: "code",
          execution_count: null,
          metadata: {},
          outputs: [],
          source: [
            "import torch\n",
            "import time\n",
            "print('CUDA Available:', torch.cuda.is_available())\n",
            "device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')\n",
            "print('Active Device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')\n",
            "\n",
            "# Perform matrix multiplication benchmark\n",
            "size = 4096\n",
            "x = torch.randn(size, size, device=device)\n",
            "y = torch.randn(size, size, device=device)\n",
            "t0 = time.time()\n",
            "z = torch.matmul(x, y)\n",
            "if device.type == 'cuda': torch.cuda.synchronize()\n",
            "print(f'Matrix multiplication ({size}x{size}) completed in {(time.time() - t0)*1000:.2f} ms')\n",
            "print('Notebook executed successfully!')"
          ]
        }
      ],
      metadata: {
        kernelspec: {
          display_name: "Python 3",
          language: "python",
          name: "python3"
        },
        language_info: {
          name: "python",
          version: "3.10"
        }
      },
      nbformat: 4,
      nbformat_minor: 5
    }, null, 2)
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
    if (!/\.(py|sh|ipynb)$/i.test(file.name)) {
      setError('Only Python (.py), shell (.sh), and Jupyter Notebook (.ipynb) files can be uploaded.');
      e.target.value = '';
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('Files must be 50 MB or smaller.');
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
      let cmd = '';
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.sh')) {
        cmd = `bash /workspace/${file.name}`;
      } else if (lower.endsWith('.ipynb')) {
        cmd = `(jupyter nbconvert --to notebook --execute /workspace/${file.name} --output /workspace/output_${file.name} || python -c "import subprocess, sys; subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'nbconvert', 'ipykernel']); import nbformat; from nbconvert.preprocessors import ExecutePreprocessor; ep = ExecutePreprocessor(timeout=1200); nb = nbformat.read('/workspace/${file.name}', as_version=4); ep.preprocess(nb); nbformat.write(nb, '/workspace/output_${file.name}'); print('=== Notebook executed successfully ===')")`;
      } else {
        cmd = `python /workspace/${file.name}`;
      }
      setFormData(prev => ({ ...prev, command: cmd }));
    };
    reader.readAsText(file);
  };

  const handleLoadSample = (key) => {
    const sample = SAMPLE_SCRIPTS[key];
    if (!sample) return;
    setScriptName(sample.name);
    setScriptContent(sample.content);
    if (sample.name.endsWith('.ipynb')) {
      setFormData(prev => ({
        ...prev,
        command: `(jupyter nbconvert --to notebook --execute /workspace/${sample.name} --output /workspace/output_${sample.name} || python -c "import subprocess, sys; subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'nbconvert', 'ipykernel']); import nbformat; from nbconvert.preprocessors import ExecutePreprocessor; ep = ExecutePreprocessor(timeout=1200); nb = nbformat.read('/workspace/${sample.name}', as_version=4); ep.preprocess(nb); nbformat.write(nb, '/workspace/output_${sample.name}'); print('=== Notebook executed successfully ===')")`
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        command: `python /workspace/${sample.name}`
      }));
    }
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
        scriptName: scriptName,
        scriptContent: scriptContent,
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
    if (aiResult.suggestedScript) {
      setScriptContent(aiResult.suggestedScript);
      if (aiResult.suggestedScriptName) {
        setScriptName(aiResult.suggestedScriptName);
      }
    }
    setAiApplied(true);
    setTimeout(() => {
      setShowAiAssistant(false);
      setAiApplied(false);
    }, 1200);
  };

  const submitJob = async () => {
    let inputObjectKey = '';
    if (scriptName) {
      try {
        const lower = scriptName.toLowerCase();
        const contentType = lower.endsWith('.sh')
          ? 'text/x-shellscript'
          : lower.endsWith('.ipynb')
          ? 'application/x-ipynb+json'
          : 'text/x-python';
        const scriptBlob = new Blob([scriptContent], { type: contentType });
        const { data: upload } = await api.post('/jobs/uploads/presign', {
          fileName: scriptName,
          size: scriptBlob.size,
        });
        if (upload && upload.storageAvailable !== false && upload.url && upload.fields) {
          const uploadFormData = new FormData();
          Object.entries(upload.fields).forEach(([key, value]) => uploadFormData.append(key, value));
          uploadFormData.append('file', scriptBlob, scriptName);
          const uploadResponse = await fetch(upload.url, { method: 'POST', body: uploadFormData });
          if (uploadResponse.ok) {
            inputObjectKey = upload.objectKey;
          }
        }
      } catch (storageErr) {
        console.warn('Object storage presign/upload not available, falling back to direct script payload:', storageErr);
      }
    }

    const payload = {
      ...formData,
      vramRequired: parseFloat(formData.vramRequired),
      gpuId: gpu?._id,
      scriptName: scriptName || "",
      scriptContent: scriptContent || "",
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
            Upload Script / Notebook (.py, .sh, .ipynb)
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
                  placeholder="Describe your workload, ask for auto-checkpointing, or paste requirements..."
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
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-purple-300 flex items-center gap-1.5">
                          <Lightbulb size={14} /> AI Recommendation
                        </p>
                        {aiResult.checkpointSupported && (
                          <span className="px-2 py-0.5 rounded text-[0.65rem] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            🛡️ Cooperative Checkpointing Active
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded text-[0.6rem] bg-white/10 text-text-dim">
                          {aiResult.source === 'llm' ? '🤖 Cloud LLM' : '⚡ Local AI Engine'}
                        </span>
                      </div>
                      <p className="text-[0.75rem] text-text-dim mt-1">{aiResult.explanation}</p>
                    </div>
                  </div>

                  {aiResult.optimizations && aiResult.optimizations.length > 0 && (
                    <div className="flex flex-col gap-1 bg-white/[0.03] p-2.5 rounded-lg border border-white/5">
                      <span className="text-[0.65rem] font-bold uppercase text-purple-300 tracking-wider">Hardware & Runtime Optimizations:</span>
                      <ul className="list-disc list-inside text-[0.7rem] text-text-dim space-y-0.5">
                        {aiResult.optimizations.map((opt, i) => (
                          <li key={i}>{opt}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5">
                    <div className="flex items-center gap-3 text-[0.7rem] text-text-dim">
                      <span>VRAM: <strong className="text-white">{aiResult.vramRequired || formData.vramRequired} GB</strong></span>
                      <span>Image: <strong className="text-white font-mono text-[0.65rem]">{aiResult.dockerImage?.split(':')[0] || 'pytorch'}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      {aiResult.suggestedScript && (
                        <button
                          type="button"
                          onClick={() => {
                            setScriptContent(aiResult.suggestedScript);
                            if (aiResult.suggestedScriptName) setScriptName(aiResult.suggestedScriptName);
                            setTabMode('script');
                            setAiApplied(true);
                            setTimeout(() => setAiApplied(false), 1200);
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 transition-all flex items-center gap-1.5"
                        >
                          <FileCode size={13} />
                          Apply Code to Script Editor
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleApplyAiSuggestion}
                        disabled={aiApplied}
                        className="px-4 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-glow transition-all flex items-center gap-1.5"
                      >
                        {aiApplied ? <Check size={14} /> : <ArrowRight size={14} />}
                        {aiApplied ? 'Applied!' : 'Apply Configuration'}
                      </button>
                    </div>
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
              <div className="flex flex-wrap justify-between items-center gap-2">
                <label className="text-[0.75rem] font-bold uppercase text-text-dim flex items-center gap-2">
                  <FileCode size={14} /> Upload Python / Shell / Notebook Script
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleLoadSample('mnist')}
                    className="text-[0.65rem] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-primary border border-primary/20 transition-all"
                  >
                    train_mnist.py
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSample('checkpoint')}
                    className="text-[0.65rem] px-2 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 transition-all font-semibold"
                  >
                    🛡️ Checkpoint Script
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSample('notebook')}
                    className="text-[0.65rem] px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all font-semibold"
                  >
                    📓 Jupyter Notebook (.ipynb)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSample('benchmark')}
                    className="text-[0.65rem] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-accent border border-accent/20 transition-all"
                  >
                    benchmark.py
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
                    accept=".py,.sh,.ipynb"
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                    <UploadCloud size={24} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-white">Click to upload or drag & drop</p>
                    <p className="text-xs text-text-dim">Supports .py, .sh, or .ipynb (Jupyter Notebooks)</p>
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
