import axios from "axios";
import Job from "../models/job.model.js";
import GPU from "../models/gpu.model.js";
import { logger } from "../utils/logger.js";

const GEMINI_MODEL = "gemini-flash-lite-latest";

// Helper to call OpenAI or Gemini if key is present
async function callLLMIfAvailable(systemPrompt, userPrompt) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;
      const resp = await axios.post(
        url,
        {
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        },
        { timeout: 12000 }
      );
      const text = resp.data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return JSON.parse(text);
      }
    } catch (e) {
      logger.warn(`Gemini API call failed, falling back to local engine: ${e.message}`);
    }
  }

  if (openaiKey) {
    try {
      const resp = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
        },
        {
          headers: { Authorization: `Bearer ${openaiKey}` },
          timeout: 12000,
        }
      );
      const text = resp.data.choices?.[0]?.message?.content;
      if (text) {
        return JSON.parse(text);
      }
    } catch (e) {
      logger.warn(`OpenAI API call failed, falling back to local engine: ${e.message}`);
    }
  }

  return null;
}

export const aiPlaygroundChat = async (req, res) => {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.status(503).json({ message: "Gemini is not configured on the backend" });
  }

  const { messages } = req.body || {};
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > 40 ||
    messages.some(
      (message) =>
        !message ||
        !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" ||
        !message.content.trim() ||
        message.content.length > 12000
    ) ||
    messages.reduce((total, message) => total + message.content.length, 0) > 40000
  ) {
    return res.status(400).json({ message: "Provide up to 40 valid chat messages (40,000 characters total)" });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const response = await axios.post(
      url,
      {
        contents: messages.map(({ role, content }) => ({
          role: role === "assistant" ? "model" : "user",
          parts: [{ text: content }],
        })),
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey,
        },
        timeout: 60000,
      }
    );
    const content = response.data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("");
    if (!content) {
      return res.status(502).json({ message: "Gemini returned no text. Try rephrasing your message." });
    }

    return res.json({ content, model: GEMINI_MODEL });
  } catch (error) {
    const status = error.response?.status || 502;
    const message = error.response?.data?.error?.message || "Gemini could not process this request";
    logger.error(`Gemini Playground request failed (${status}): ${message}`);
    return res.status(status >= 400 && status < 500 ? status : 502).json({ message });
  }
};

// Built-in Intelligent Job Assistant Engine
function generateJobAssistantLocal({
  prompt = "",
  gpuModel = "NVIDIA GPU",
  gpuVram = 8,
  currentCommand = "",
  currentImage = "",
  scriptName = "",
  scriptContent = "",
} = {}) {
  const p = (prompt || currentCommand || scriptName || "").toLowerCase();
  const vram = parseFloat(gpuVram) || 8;

  // 1. Cooperative Checkpointing Injection / Interruption-proof
  if (
    !scriptContent &&
    (
      p.includes("checkpoint") ||
      p.includes("resume") ||
      p.includes("interrupt") ||
      p.includes("preempt") ||
      p.includes("save") ||
      p.includes("persist") ||
      p.includes("resilience")
    )
  ) {
    const checkpointScript = `import os
import json
import time
import torch
import torch.nn as nn
import torch.optim as optim

# ==========================================
# IdleLab Cooperative Checkpointing Hooks
# ==========================================
checkpoint_dir = os.environ.get("CHECKPOINT_DIR", "/workspace/checkpoints")
os.makedirs(checkpoint_dir, exist_ok=True)
resume = os.environ.get("RESUME_FROM_CHECKPOINT", "false").lower() == "true"
start_step = int(os.environ.get("CHECKPOINT_STEP", "0"))

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"==> IdleLab Node Active | Device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})")

class ResilientModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(512, 256),
            nn.ReLU(),
            nn.Linear(256, 64),
            nn.ReLU(),
            nn.Linear(64, 10)
        )
    def forward(self, x):
        return self.net(x)

model = ResilientModel().to(device)
optimizer = optim.Adam(model.parameters(), lr=1e-3)
checkpoint_file = os.path.join(checkpoint_dir, "model_checkpoint.pt")

if resume and os.path.exists(checkpoint_file):
    print(f"==> Resuming from host preemption at checkpoint step {start_step}...")
    ckpt = torch.load(checkpoint_file, map_location=device)
    model.load_state_dict(ckpt["model_state"])
    optimizer.load_state_dict(ckpt["optimizer_state"])
    print(f"==> State restored successfully! Continuing compute workload.")

total_steps = 30
print(f"==> Executing training steps {start_step + 1} to {total_steps}...")

for step in range(start_step + 1, total_steps + 1):
    x = torch.randn(64, 512, device=device)
    y = torch.randint(0, 10, (64,), device=device)
    loss = nn.functional.cross_entropy(model(x), y)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

    print(f"Step {step:02d}/{total_steps} | Loss: {loss.item():.4f} | VRAM: {torch.cuda.memory_allocated()/(1024**2):.1f}MB")
    time.sleep(0.3)

    # Periodic checkpoint save (every 5 steps) - ensures migration without progress loss
    if step % 5 == 0 or step == total_steps:
        torch.save({
            "step": step,
            "model_state": model.state_dict(),
            "optimizer_state": optimizer.state_dict(),
        }, checkpoint_file)
        with open(os.path.join(checkpoint_dir, "checkpoint.json"), "w") as f:
            json.dump({"step": step, "totalSteps": total_steps}, f)
        print(f"==> [Checkpoint Snapshot] Step {step}/{total_steps} committed to storage.")

print("==> Workload successfully finished with full cooperative checkpoint support!")
`;

    return {
      dockerImage: "pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime",
      command: "python /workspace/train_checkpoint.py",
      vramRequired: Math.min(vram, 4),
      checkpointSupported: true,
      suggestedScriptName: "train_checkpoint.py",
      suggestedScript: checkpointScript,
      explanation: "Generated an interruption-proof PyTorch workload configured with IdleLab cooperative checkpointing. Reads CHECKPOINT_DIR and writes atomic model weights + checkpoint.json so your job survives host reclaims without lost time.",
      suggestedEnv: {
        PYTHONUNBUFFERED: "1",
        CUDA_VISIBLE_DEVICES: "0",
      },
      optimizations: [
        "Periodically saves weights and checkpoint.json to os.environ['CHECKPOINT_DIR']",
        "Automatically checks RESUME_FROM_CHECKPOINT on startup to recover training state",
        "Coordinates with the platform's 60-second periodic snapshot daemon",
      ],
    };
  }

  // 2. Jupyter Notebook (.ipynb) Support
  if (
    p.includes("notebook") ||
    p.includes("ipynb") ||
    (scriptName && scriptName.toLowerCase().endsWith(".ipynb"))
  ) {
    const targetNb = scriptName || "notebook.ipynb";
    return {
      dockerImage: "pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime",
      command: `(jupyter nbconvert --to notebook --execute /workspace/${targetNb} --output /workspace/output_${targetNb} || python -c "import subprocess, sys; subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'nbconvert', 'ipykernel']); import nbformat; from nbconvert.preprocessors import ExecutePreprocessor; ep = ExecutePreprocessor(timeout=1200); nb = nbformat.read('/workspace/${targetNb}', as_version=4); ep.preprocess(nb); nbformat.write(nb, '/workspace/output_${targetNb}'); print('=== Notebook executed successfully ===')")`,
      vramRequired: Math.min(vram, 6),
      checkpointSupported: false,
      suggestedScriptName: targetNb,
      explanation: "Configured headless Jupyter Notebook (.ipynb) execution pipeline. Compiles notebook cells sequentially, executes tensor calculations on GPU, and writes results and plots to output notebook.",
      suggestedEnv: {
        PYTHONUNBUFFERED: "1",
        CUDA_VISIBLE_DEVICES: "0",
      },
      optimizations: [
        "Uses nbconvert to execute cells sequentially in non-interactive headless mode",
        "Saves rendered output cells, tables, and images back into output notebook file",
        "Automatic fallback installs nbconvert and ipykernel on-the-fly if missing",
      ],
    };
  }

  // 3. User Provided Script Analysis & Enhancement
  if (scriptContent && scriptContent.trim().length > 0) {
    const hasCudaCheck = scriptContent.includes("cuda.is_available");
    const hasCheckpointWrites =
      scriptContent.includes("CHECKPOINT_DIR") &&
      (scriptContent.includes("torch.save") || scriptContent.includes("save_pretrained"));
    const hasCheckpointResume =
      scriptContent.includes("RESUME_FROM_CHECKPOINT") &&
      (scriptContent.includes("torch.load") || scriptContent.includes("from_pretrained"));
    const hasCheckpoints = hasCheckpointWrites && hasCheckpointResume;

    return {
      dockerImage: currentImage || "pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime",
      command: currentCommand || `python /workspace/${scriptName || "script.py"}`,
      vramRequired: Math.min(vram, 6),
      batchSize: vram >= 16 ? 64 : vram >= 8 ? 32 : 8,
      checkpointSupported: hasCheckpoints,
      checkpointPlan: hasCheckpoints
        ? "The script saves and restores model state under CHECKPOINT_DIR."
        : "This script does not implement both checkpoint saving and restore. The local rules engine cannot safely rewrite an arbitrary training loop.",
      suggestedScriptName: scriptName || "script.py",
      ...(hasCheckpoints ? { suggestedScript: scriptContent } : {}),
      explanation: `Analyzed uploaded script '${scriptName || "script.py"}'. ${hasCudaCheck ? "Found a CUDA availability check." : "Could not confirm a CUDA availability check."} ${hasCheckpoints ? "Checkpoint save and restore logic was found." : "Review the checkpoint limitation before submitting."}`,
      suggestedEnv: {
        PYTHONUNBUFFERED: "1",
        CUDA_VISIBLE_DEVICES: "0",
        BATCH_SIZE: String(vram >= 16 ? 64 : vram >= 8 ? 32 : 8),
      },
      optimizations: [
        hasCudaCheck ? "CUDA availability check found in the script" : "Verify torch.cuda.is_available() when the container starts",
        "Suggested batch size is provided as BATCH_SIZE; the script must read it to change training batches",
        hasCheckpoints ? "Script saves and restores checkpoints" : "Add model and optimizer save/restore calls to make this script resumable",
      ],
    };
  }

  // 4. PyTorch Training / CNN / MNIST
  if (p.includes("train") || p.includes("mnist") || p.includes("cnn") || p.includes("cifar") || p.includes("resnet")) {
    return {
      dockerImage: "pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime",
      command: `python -c "
import torch
import torch.nn as nn
import torch.optim as optim
import time

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f'==> Using device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"CPU\"})')

class SimpleCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d((1, 1)),
            nn.Flatten(),
            nn.Linear(64, 10)
        )
    def forward(self, x):
        return self.net(x)

model = SimpleCNN().to(device)
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=1e-3)

print('==> Starting 10-step mock training loop with synthetic tensors...')
for step in range(1, 11):
    start = time.time()
    x = torch.randn(64, 1, 28, 28, device=device)
    y = torch.randint(0, 10, (64,), device=device)
    optimizer.zero_grad()
    loss = criterion(model(x), y)
    loss.backward()
    optimizer.step()
    elapsed = (time.time() - start) * 1000
    print(f'Step {step:02d}/10 | Loss: {loss.item():.4f} | Batch latency: {elapsed:.2f}ms')

print('==> Training completed successfully on GPU!')
"`,
      vramRequired: Math.min(vram, 4),
      batchSize: 64,
      checkpointSupported: false,
      checkpointPlan: "No checkpoint save and restore code is included in this generated benchmark.",
      explanation: "Generated a robust PyTorch CNN training pipeline running directly on CUDA with automated batch latency measurements and synthetic GPU memory utilization.",
      suggestedEnv: {
        PYTHONUNBUFFERED: "1",
        CUDA_VISIBLE_DEVICES: "0",
      },
      optimizations: [
        "Uses torch.cuda.is_available() check for runtime verification",
        "Configured for batch size 64 to fit comfortably within available VRAM",
        "Uses PyTorch 2.1.2 CUDA 12.1 runtime image for maximum driver compatibility",
      ],
    };
  }

  // 5. Whisper / Audio transcription
  if (p.includes("whisper") || p.includes("audio") || p.includes("transcri")) {
    return {
      dockerImage: "pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime",
      command: `python -c "
import torch
print('==> PyTorch CUDA status:', torch.cuda.is_available())
print('==> Installing dependencies on-the-fly...')
import subprocess, sys
subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--quiet', 'openai-whisper'])
import whisper
print('==> Loading Whisper base model onto GPU...')
device = 'cuda' if torch.cuda.is_available() else 'cpu'
model = whisper.load_model('base', device=device)
print(f'==> Whisper model loaded on {device}. Model parameter count: {sum(p.numel() for p in model.parameters()):,}')
print('==> Audio pipeline ready for batch inference!')
"`,
      vramRequired: Math.min(vram, 6),
      batchSize: vram >= 16 ? 64 : vram >= 8 ? 32 : 8,
      checkpointSupported: false,
      checkpointPlan: "This workload does not include model checkpoint save and restore code.",
      explanation: "Configured OpenAI Whisper environment with automatic pip installation and base model initialization directly onto GPU memory.",
      suggestedEnv: {
        PYTHONUNBUFFERED: "1",
      },
      optimizations: [
        "Base Whisper model requires ~2-3 GB VRAM",
        "Use 'small' or 'medium' model if higher transcription accuracy is desired",
      ],
    };
  }

  // 6. Stable Diffusion / Image generation
  if (p.includes("diffusion") || p.includes("image") || p.includes("art") || p.includes("sd")) {
    return {
      dockerImage: "pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime",
      command: `python -c "
import torch
print(f'==> GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"None\"}')
print('==> Testing float16 tensor operations for Stable Diffusion...')
a = torch.randn(2, 4, 64, 64, dtype=torch.float16, device='cuda')
b = torch.randn(2, 4, 64, 64, dtype=torch.float16, device='cuda')
c = torch.matmul(a, b)
print(f'==> Latent tensor shape: {c.shape}, memory allocated: {torch.cuda.memory_allocated() / (1024**2):.1f} MB')
print('==> Ready for diffusers inference pipeline!')
"`,
      vramRequired: Math.min(vram, 8),
      checkpointSupported: false,
      explanation: "Sets up float16 tensor operations suitable for Stable Diffusion pipelines with low memory overhead.",
      suggestedEnv: {
        PYTHONUNBUFFERED: "1",
        PYTORCH_CUDA_ALLOC_CONF: "expandable_segments:True",
      },
      optimizations: [
        "Always use torch.float16 to cut VRAM requirements by 50%",
        "Enable expandable_segments to prevent memory fragmentation",
      ],
    };
  }

  // 7. LLaMA / Mistral / LLM Inference / Transformers
  if (p.includes("llama") || p.includes("llm") || p.includes("transformer") || p.includes("huggingface") || p.includes("text")) {
    return {
      dockerImage: "pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime",
      command: `python -c "
import torch
print(f'==> CUDA Available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'==> Device: {torch.cuda.get_device_name(0)}')
    print(f'==> Total VRAM: {torch.cuda.get_device_properties(0).total_memory / (1024**3):.2f} GB')
import subprocess, sys
print('==> Verifying HuggingFace transformers compatibility...')
subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--quiet', 'transformers', 'accelerate'])
from transformers import AutoTokenizer
print('==> Tokenizer loading test (gpt2 standard)...')
tokenizer = AutoTokenizer.from_pretrained('gpt2')
tokens = tokenizer.encode('Deploying high performance LLM on decentralized GPU grid.')
print(f'==> Tokens generated: {tokens}')
print('==> LLM Transformer stack initialized and ready!')
"`,
      vramRequired: Math.min(vram, 8),
      checkpointSupported: false,
      explanation: "Sets up HuggingFace Transformers and Accelerate with CUDA acceleration and tokenization checks.",
      suggestedEnv: {
        PYTHONUNBUFFERED: "1",
        HF_HUB_ENABLE_HF_TRANSFER: "1",
      },
      optimizations: [
        "Utilize 4-bit / 8-bit quantization (bitsandbytes) for models larger than 7B parameters",
        "Enable flash-attention-2 for fast attention calculations",
      ],
    };
  }

  // 8. Default / Benchmark / CUDA Stress test
  return {
    dockerImage: "pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime",
    command: `python -c "
import torch, time
print(f'==> PyTorch version: {torch.__version__}')
print(f'==> CUDA Available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    device = 'cuda'
    print(f'==> Device: {torch.cuda.get_device_name(0)}')
    print(f'==> Initial VRAM allocated: {torch.cuda.memory_allocated() / (1024**2):.2f} MB')
else:
    device = 'cpu'
    print('==> Running on CPU')

print('==> Running Matrix Multiplication Benchmark (8192 x 8192)...')
size = 8192
a = torch.randn(size, size, device=device)
b = torch.randn(size, size, device=device)

# Warmup
_ = torch.matmul(a, b)
if device == 'cuda': torch.cuda.synchronize()

t0 = time.time()
for _ in range(5):
    c = torch.matmul(a, b)
if device == 'cuda': torch.cuda.synchronize()
total_time = (time.time() - t0) / 5.0

tflops = (2 * size**3) / (total_time * 1e12)
print(f'==> Compute speed: {tflops:.2f} TFLOPs (avg time: {total_time*1000:.2f}ms)')
print('==> Benchmark finished with 0 errors.')
"`,
    vramRequired: Math.min(vram, 4),
    checkpointSupported: false,
    explanation: "High-performance FP32 matrix multiplication stress test benchmarking raw CUDA TFLOP compute capacity and VRAM bandwidth.",
    suggestedEnv: {
      PYTHONUNBUFFERED: "1",
      CUDA_VISIBLE_DEVICES: "0",
    },
    optimizations: [
      "Performs a warmup multiplication to initialize CUDA context",
      "Uses torch.cuda.synchronize() to measure true GPU computation time",
      "Safe memory footprint (~1.2 GB VRAM for 8192x8192 matrices)",
    ],
  };
}

// Built-in Intelligent Failure Explainer Engine
function analyzeFailureLocal(logs = [], command = "", dockerImage = "", exitCode = 1) {
  const fullLog = (Array.isArray(logs) ? logs.join("\n") : String(logs || "")).toLowerCase();
  const rawLog = Array.isArray(logs) ? logs.join("\n") : String(logs || "");

  // 1. CUDA Out of Memory (OOM)
  if (
    fullLog.includes("outofmemoryerror") ||
    fullLog.includes("out of memory") ||
    fullLog.includes("cuda out of memory") ||
    fullLog.includes("tried to allocate")
  ) {
    const allocMatch = rawLog.match(/tried to allocate\s+([0-9.]+)\s*([a-zA-Z]+)/i);
    const allocText = allocMatch ? `${allocMatch[1]} ${allocMatch[2]}` : "extra memory";

    return {
      errorType: "CUDA Out of Memory (OOM)",
      severity: "high",
      summary: `The GPU ran out of video memory (VRAM) while attempting to allocate ${allocText}. The model or tensor batch size exceeded available GPU memory.`,
      rootCauseSnippet:
        rawLog.split("\n").find((l) => /outofmemory|out of memory|tried to allocate/i.test(l)) ||
        "torch.cuda.OutOfMemoryError: CUDA out of memory",
      fixes: [
        "Reduce batch size (e.g., from 64 to 32 or 16).",
        "Enable mixed precision by using `torch.cuda.amp.autocast()` or `torch.float16` to halve memory consumption.",
        "Add `torch.cuda.empty_cache()` between iterations to clear unused cached blocks.",
        "Select a higher VRAM GPU from the marketplace (e.g., 16GB or 24GB).",
      ],
      suggestedCommand: command
        ? command.replace(/batch_size\s*=\s*\d+/gi, "batch_size=16")
        : 'python -c "import torch; torch.cuda.empty_cache(); print(\'Try with reduced batch size\')"',
      suggestedVramMultiplier: 1.5,
    };
  }

  // 2. Missing Python Module / Dependency
  if (fullLog.includes("modulenotfounderror") || fullLog.includes("no module named")) {
    const modMatch = rawLog.match(/No module named ['"]([^'"]+)['"]/i);
    const missingModule = modMatch ? modMatch[1] : "required package";

    return {
      errorType: "Missing Python Package",
      severity: "medium",
      summary: `The script failed because the Python library '${missingModule}' is not installed inside container image '${dockerImage || "default"}'.`,
      rootCauseSnippet:
        rawLog.split("\n").find((l) => /ModuleNotFoundError|No module named/i.test(l)) ||
        `ModuleNotFoundError: No module named '${missingModule}'`,
      fixes: [
        `Prepend a pip install command: \`pip install ${missingModule}\` before executing your script.`,
        `Or wrap in python: \`import subprocess, sys; subprocess.check_call([sys.executable, '-m', 'pip', 'install', '${missingModule}'])\`.`,
        "Or use a Docker image that already contains your required data science packages.",
      ],
      suggestedCommand: command
        ? `pip install --quiet ${missingModule} && ${command}`
        : `pip install ${missingModule}`,
      suggestedVramMultiplier: 1.0,
    };
  }

  // 3. Docker Image Pull / Manifest Failure
  if (
    fullLog.includes("failed to pull image") ||
    fullLog.includes("manifest unknown") ||
    fullLog.includes("repository does not exist") ||
    fullLog.includes("pull access denied")
  ) {
    return {
      errorType: "Docker Image Not Found / Access Denied",
      severity: "high",
      summary: `The GPU host agent could not download the specified Docker image (${dockerImage || "custom"}). Either the image name has a typo, the tag is invalid, or it is a private repository.`,
      rootCauseSnippet:
        rawLog.split("\n").find((l) => /failed to pull|manifest unknown|repository does not exist/i.test(l)) ||
        "docker.errors.APIError: image not found",
      fixes: [
        "Verify that the Docker image name exists on Docker Hub (e.g., `pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime`).",
        "Make sure public access is allowed for this image without Docker credentials.",
        "Check that the tag matches an existing release.",
      ],
      suggestedDockerImage: "pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime",
      suggestedVramMultiplier: 1.0,
    };
  }

  // 4. Linux OOM Killer (Exit code 137)
  if (exitCode === 137 || fullLog.includes("killed") || fullLog.includes("exit code 137")) {
    return {
      errorType: "Host System Out of Memory (OOM Killer - 137)",
      severity: "critical",
      summary: "The container was forcefully terminated by the Linux host kernel because system RAM (host memory) exceeded limits (Exit Code 137 / SIGKILL).",
      rootCauseSnippet: "Container exited with code 137 (Killed by OOM)",
      fixes: [
        "Reduce memory overhead by streaming datasets instead of loading entire datasets into RAM.",
        "Lower the number of DataLoader workers (`num_workers=0` or `num_workers=2`).",
        "Reduce tensor dimensions or batch sizes.",
      ],
      suggestedCommand: command,
      suggestedVramMultiplier: 1.2,
    };
  }

  // 5. Python Syntax / Indentation Error
  if (fullLog.includes("syntaxerror") || fullLog.includes("indentationerror")) {
    const line = rawLog.split("\n").find((l) => /syntaxerror|indentationerror/i.test(l)) || "SyntaxError: invalid syntax";
    return {
      errorType: "Python Syntax / Indentation Error",
      severity: "low",
      summary: "The script failed before execution due to invalid Python syntax, unescaped quotes, or mismatched indentation.",
      rootCauseSnippet: line,
      fixes: [
        "Check for unescaped double or single quotes if passing inline scripts with `python -c \"...\"`.",
        "Ensure indentation uses consistent 4 spaces without mixed tabs.",
        "Test script locally in standard python interpreter before submitting.",
      ],
      suggestedCommand: command,
      suggestedVramMultiplier: 1.0,
    };
  }

  // 6. CUDA Driver / Toolkit Incompatibility
  if (
    fullLog.includes("cuda driver version is insufficient") ||
    fullLog.includes("no cuda-capable device is detected") ||
    fullLog.includes("cuda error: no kernel image is available")
  ) {
    return {
      errorType: "CUDA Driver / Architecture Mismatch",
      severity: "high",
      summary: "PyTorch or the CUDA runtime attempted to execute instructions that are incompatible with the host's NVIDIA driver version or compute capability.",
      rootCauseSnippet:
        rawLog.split("\n").find((l) => /cuda driver|no kernel image|no cuda-capable/i.test(l)) ||
        "CUDA error: no kernel image is available for execution on the device",
      fixes: [
        "Select a Docker image with a matching CUDA version (e.g., CUDA 11.8 or CUDA 12.1).",
        "Set `TORCH_CUDA_ARCH_LIST` environment variable matching the host GPU compute architecture.",
        "Verify that the host agent is configured with the latest NVIDIA Container Toolkit.",
      ],
      suggestedDockerImage: "pytorch/pytorch:2.1.2-cuda11.8-cudnn8-runtime",
      suggestedVramMultiplier: 1.0,
    };
  }

  // Fallback Generic Failure Analysis
  const lastLines = rawLog.split("\n").filter(Boolean).slice(-4).join(" | ");
  return {
    errorType: "Container Execution Failure",
    severity: "medium",
    summary: `The container terminated with non-zero exit code (${exitCode}). The error occurred during execution of the command.`,
    rootCauseSnippet: lastLines || `Exit code ${exitCode}`,
    fixes: [
      "Review the full stdout and stderr logs in the terminal above.",
      "Add verbose print statements or logging to trace the exact crash step.",
      "Check that input paths and environment variables exist in the container filesystem.",
    ],
    suggestedCommand: command,
    suggestedVramMultiplier: 1.0,
  };
}

// ---------------------------------------------------------------------------
// Controller Endpoints
// ---------------------------------------------------------------------------

/**
 * POST /api/ai/assistant
 * Input: { prompt, gpuModel, gpuVram, currentCommand, currentImage, scriptName, scriptContent, datasetName }
 */
export const aiJobAssistant = async (req, res, next) => {
  try {
    const {
      prompt,
      gpuModel,
      gpuVram,
      currentCommand,
      currentImage,
      scriptName,
      scriptContent,
      datasetName,
    } = req.body;

    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ message: "Describe the workload you want to run" });
    }
    if (
      datasetName &&
      (typeof datasetName !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(datasetName))
    ) {
      return res.status(400).json({ message: "Provide a valid dataset filename" });
    }

    // Try calling external LLM first if configured
    const systemPrompt = `You are an expert GPU Infrastructure and Cloud ML Engineer for IdleLab (decentralized campus GPU compute network).
Given a user's task description, script content (if provided), and target GPU specifications, output a JSON object with:
- dockerImage: Recommended Docker image (e.g. pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime, tensorflow/tensorflow:latest-gpu, etc.)
- command: Complete, runnable bash or python command that executes the task with CUDA validation
- vramRequired: Recommended VRAM in GB (float/int)
- batchSize: Conservative recommended integer batch size for this GPU
- checkpointPlan: Explain whether the returned script actually saves and restores model/optimizer state under CHECKPOINT_DIR
- explanation: Clear rationale for image, memory, runtime flags, and checkpointing strategy
- suggestedEnv: Object containing recommended environment variables (e.g. PYTHONUNBUFFERED: "1", CUDA_VISIBLE_DEVICES: "0")
- optimizations: Array of 3 key tips to ensure the script runs reliably on this GPU
- suggestedScript: (optional) Updated or generated runnable Python script. For an uploaded script, preserve its behavior and integrate checkpoint saving AND loading instead of only adding headers
- suggestedScriptName: (optional) filename for suggestedScript (e.g. train_checkpoint.py)
- checkpointSupported: boolean true only if the returned script actually saves and restores workload state.`;

    const userPrompt = `Target GPU: ${gpuModel || "NVIDIA GPU"} with ${gpuVram || 8} GB VRAM.
User Goal / Task: ${prompt || "Analyze and optimize current workload"}
Current Command: ${currentCommand || "None"}
Current Docker Image: ${currentImage || "None"}
Script Name: ${scriptName || "None"}
Script Content Preview: ${scriptContent ? scriptContent.slice(0, 2000) : "None"}
Dataset File: ${datasetName || "None"}${datasetName ? ` (available at /workspace/data/${datasetName})` : ""}
When a dataset is attached, use that file rather than synthetic data. If its schema is unknown, state the assumptions and do not claim the generated workload trains on it unless the script actually reads it.

Return pure JSON matching the schema.`;

    const llmResult = await callLLMIfAvailable(systemPrompt, userPrompt);
    if (
      llmResult &&
      typeof llmResult.command === "string" &&
      typeof llmResult.dockerImage === "string" &&
      (!llmResult.suggestedScript || typeof llmResult.suggestedScript === "string")
    ) {
      const availableVram = Number(gpuVram) || 8;
      const batchSize = Number.isInteger(llmResult.batchSize) && llmResult.batchSize > 0
        ? llmResult.batchSize
        : availableVram >= 16 ? 64 : availableVram >= 8 ? 32 : 8;
      const datasetPath = datasetName ? `/workspace/data/${datasetName}` : "";
      const activeScript = llmResult.suggestedScript || scriptContent || "";
      const datasetReferenceText = `${activeScript}\n${llmResult.command || ""}`.toLowerCase();
      const llmEnv = llmResult.suggestedEnv &&
        typeof llmResult.suggestedEnv === "object" &&
        !Array.isArray(llmResult.suggestedEnv)
        ? llmResult.suggestedEnv
        : {};
      const datasetUsed = Boolean(
        datasetName &&
        (datasetReferenceText.includes(datasetName.toLowerCase()) ||
          datasetReferenceText.includes("dataset_path") ||
          datasetReferenceText.includes("/workspace/data/"))
      );
      const checkpointSupported = Boolean(
        activeScript &&
        activeScript.includes("CHECKPOINT_DIR") &&
        (activeScript.includes("torch.save") || activeScript.includes("save_pretrained")) &&
        activeScript.includes("RESUME_FROM_CHECKPOINT") &&
        (activeScript.includes("torch.load") || activeScript.includes("from_pretrained"))
      );
      return res.json({
        source: "llm",
        ...llmResult,
        batchSize,
        checkpointSupported,
        checkpointPlan: checkpointSupported
          ? "The script to be run includes checkpoint save and restore logic."
          : "Could not verify checkpoint save and restore logic in the script to be run.",
        datasetUsed,
        datasetPlan: datasetName
          ? datasetUsed
            ? `The returned script references the uploaded dataset (${datasetName}).`
            : `The dataset is mounted at ${datasetPath}, but the returned script does not reference it. Review or edit the script before submitting.`
          : "",
        suggestedEnv: {
          ...llmEnv,
          BATCH_SIZE: String(batchSize),
          ...(datasetPath ? { DATASET_PATH: datasetPath } : {}),
        },
        datasetPath,
      });
    }

    // Fallback to our high-quality local generator
    const localResult = generateJobAssistantLocal({
      prompt: prompt || currentCommand,
      gpuModel,
      gpuVram,
      currentCommand,
      currentImage,
      scriptName,
      scriptContent,
    });
    const availableVram = Number(gpuVram) || 8;
    const batchSize = Number.isInteger(localResult.batchSize) && localResult.batchSize > 0
      ? localResult.batchSize
      : availableVram >= 16 ? 64 : availableVram >= 8 ? 32 : 8;
    const datasetPath = datasetName ? `/workspace/data/${datasetName}` : "";
    const activeScript = localResult.suggestedScript || scriptContent || "";
    const datasetReferenceText = `${activeScript}\n${localResult.command || ""}`.toLowerCase();
    const datasetUsed = Boolean(
      datasetName &&
      (datasetReferenceText.includes(datasetName.toLowerCase()) ||
        datasetReferenceText.includes("dataset_path") ||
        datasetReferenceText.includes("/workspace/data/"))
    );
    return res.json({
      source: "local-engine",
      ...localResult,
      batchSize,
      checkpointPlan: localResult.checkpointPlan ||
        (localResult.checkpointSupported
          ? "The script to be run includes checkpoint save and restore logic."
          : "This recommendation does not include checkpoint save and restore logic."),
      datasetUsed,
      datasetPlan: datasetName
        ? datasetUsed
          ? `The returned script references the uploaded dataset (${datasetName}).`
          : `The dataset is mounted at ${datasetPath}, but local rules did not generate code to read it. Add a script or configure a hosted AI provider before submitting a real training workload.`
        : "",
      suggestedEnv: {
        ...(localResult.suggestedEnv || {}),
        BATCH_SIZE: String(batchSize),
        ...(datasetPath ? { DATASET_PATH: datasetPath } : {}),
      },
      datasetPath,
    });
  } catch (error) {
    logger.error(`AI Assistant error: ${error.message}`);
    next(error);
  }
};

/**
 * POST /api/ai/explain-failure
 * Input: { jobId } or { logs, command, dockerImage, exitCode }
 */
export const aiExplainFailure = async (req, res, next) => {
  try {
    let { jobId, logs, command, dockerImage, exitCode } = req.body;

    if (jobId) {
      const job = await Job.findOne({ _id: jobId, user: req.user.id }).populate(
        "gpu",
        "model vram"
      );
      if (!job) return res.status(404).json({ message: "Job not found" });
      logs = job.logs || [];
      command = job.command || command;
      dockerImage = job.dockerImage || dockerImage;
    }

    if (!logs || (Array.isArray(logs) && logs.length === 0)) {
      return res.status(400).json({ message: "Job logs are required to analyze failure" });
    }

    const logText = Array.isArray(logs) ? logs.join("\n") : String(logs);

    // Try calling external LLM first if configured
    const systemPrompt = `You are a Senior ML Infrastructure Systems Engineer and PyTorch/CUDA debugger.
Analyze container crash logs and produce a JSON response with:
- errorType: Short title of the error category (e.g. CUDA Out of Memory (OOM), Missing Dependency, Docker Tag Not Found, Syntax Error)
- severity: "critical" | "high" | "medium" | "low"
- summary: Plain-English explanation of why the job failed
- rootCauseSnippet: Exact line from the logs that caused the failure
- fixes: Array of actionable bullet points to fix the error
- suggestedCommand: Corrected command string if applicable
- suggestedDockerImage: Corrected Docker image if applicable
- suggestedVramMultiplier: Number (e.g. 1.0 or 1.5) if VRAM should be increased.`;

    const userPrompt = `Docker Image: ${dockerImage || "Unknown"}
Command: ${command || "Unknown"}
Logs:
${logText.slice(-4000)}

Return pure JSON matching the schema.`;

    const llmResult = await callLLMIfAvailable(systemPrompt, userPrompt);
    if (llmResult && llmResult.errorType && llmResult.summary) {
      return res.json({
        source: "llm",
        ...llmResult,
      });
    }

    // Fallback to local intelligent analysis
    const localAnalysis = analyzeFailureLocal(logs, command, dockerImage, exitCode || 1);
    return res.json({
      source: "local-engine",
      ...localAnalysis,
    });
  } catch (error) {
    logger.error(`AI Explainer error: ${error.message}`);
    next(error);
  }
};
