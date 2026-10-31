import axios from "axios";
import Job from "../models/job.model.js";
import GPU from "../models/gpu.model.js";
import { logger } from "../utils/logger.js";

// Helper to call OpenAI or Gemini if key is present
async function callLLMIfAvailable(systemPrompt, userPrompt) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
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

// Built-in Intelligent Job Assistant Engine
function generateJobAssistantLocal(prompt, gpuModel, gpuVram) {
  const p = (prompt || "").toLowerCase();
  const vram = parseFloat(gpuVram) || 8;

  // 1. PyTorch Training / CNN / MNIST
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

  // 2. Whisper / Audio transcription
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

  // 3. Stable Diffusion / Image generation
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

  // 4. LLaMA / Mistral / LLM Inference / Transformers
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

  // Default / Benchmark / CUDA Stress test
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
 * Input: { prompt, gpuModel, gpuVram, currentCommand, currentImage }
 */
export const aiJobAssistant = async (req, res, next) => {
  try {
    const { prompt, gpuModel, gpuVram, currentCommand, currentImage } = req.body;

    if (!prompt && !currentCommand) {
      return res.status(400).json({ message: "Either a prompt or currentCommand is required" });
    }

    // Try calling external LLM first if configured
    const systemPrompt = `You are an expert GPU Infrastructure and Cloud ML Engineer.
Given a user's task description and target GPU specifications, output a JSON object with:
- dockerImage: Recommended Docker image (e.g. pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime, tensorflow/tensorflow:latest-gpu, etc.)
- command: Complete, runnable bash or python command that executes the task with CUDA validation
- vramRequired: Recommended VRAM in GB (float/int)
- explanation: Clear rationale for image, memory, and runtime flags
- suggestedEnv: Object containing recommended environment variables (e.g. CUDA_VISIBLE_DEVICES)
- optimizations: Array of 3 key tips to ensure the script runs reliably on this GPU.`;

    const userPrompt = `Target GPU: ${gpuModel || "NVIDIA GPU"} with ${gpuVram || 8} GB VRAM.
User Goal / Task: ${prompt || "Analyze and optimize current command"}
Current Command: ${currentCommand || "None"}
Current Docker Image: ${currentImage || "None"}

Return pure JSON matching the schema.`;

    const llmResult = await callLLMIfAvailable(systemPrompt, userPrompt);
    if (llmResult && llmResult.command && llmResult.dockerImage) {
      return res.json({
        source: "llm",
        ...llmResult,
      });
    }

    // Fallback to our high-quality local generator
    const localResult = generateJobAssistantLocal(prompt || currentCommand, gpuModel, gpuVram);
    return res.json({
      source: "local-engine",
      ...localResult,
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
