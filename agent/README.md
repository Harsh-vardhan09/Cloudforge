# GPU Host Agent

Runs on your machine, offers your GPU to the network, and executes rented jobs in
Docker containers. It polls the backend for work — nothing needs to reach your
machine from the internet except the optional reclaim port.

## Requirements

| | |
|---|---|
| Python | 3.11 – 3.13 (3.14 is not supported by all dependencies yet) |
| Docker | Docker Desktop (Windows/macOS) or Docker Engine (Linux), **running** |
| GPU | NVIDIA driver + [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) |

The GPU parts are optional: without an NVIDIA GPU the agent registers as a
CPU-only node and runs containers without GPU passthrough. It will only ever be
offered jobs whose VRAM requirement fits what it advertises.

## Install

### Windows quick install

On the website, open **Add GPU** and download the Windows agent package. Extract
the ZIP, then double-click `Install.bat`. It checks for Python and Docker,
installs the agent dependencies, and prompts for your backend URL and host token.
The host token is visible in the installer window while you paste it, then saved
in `agent/.env` on your PC; keep that file private. The installer uses Python
directly and does not require PowerShell.

The installer requires Python 3.11–3.13 and Docker Desktop to be installed and
running. GPU acceleration additionally requires an NVIDIA driver and working
GPU support in Docker.

### Manual install

```bash
cd agent
python -m venv .venv
```

Activate it — Windows (PowerShell):

```powershell
.\.venv\Scripts\Activate.ps1
```

macOS / Linux:

```bash
source .venv/bin/activate
```

Then install the dependencies:

```bash
pip install -r requirements.txt
```

## Configure

Copy the template and fill it in:

```bash
cp .env.example .env
```

The one value you must set is `AGENT_JWT_TOKEN`. Sign in to the dashboard, open
**Add GPU**, and copy the token shown there. Set `BACKEND_URL` to wherever your
backend runs (`http://localhost:5000` for a local stack).

`PRICE_PER_HOUR` is what you charge renters. You can also change it later from
the Add GPU page without restarting.

The Windows installer detects installed system RAM and offers per-job RAM caps
that keep about 40% available for Windows, Docker, the agent, and other apps. It
also limits concurrent jobs based on that budget. If you configure the agent
manually, `JOB_MEMORY_LIMIT` defaults to 1 GB per container; increase it only
when the host has spare RAM, and ensure the limit multiplied by
`MAX_CONCURRENT_JOBS` leaves enough memory for the host. Docker enforces this
system-RAM cap for each job container; it does not reserve or cap GPU VRAM.
Increase `JOB_CPU_CORES` too when CPU-heavy preprocessing or data loading needs
more capacity. The default
`DOCKER_IMAGE_PULL_POLICY=if-not-present` reuses a locally cached image to reduce
cold-start time; use `always` to refresh the image from its registry for each
job.

> Tokens expire after 7 days. When that happens the agent logs a `401` and stops
> taking jobs — copy a fresh token into `.env` and restart.

## Run

```bash
python main.py
```

Or pass the token directly instead of putting it in `.env`:

```bash
python main.py --token <your-token>
```

A healthy start looks like this:

```
GPU Host Agent starting...
Heartbeat thread started (interval: 15s)
Job claim and lease scheduler started
Uvicorn running on http://0.0.0.0:7000
Detected GPU: NVIDIA GeForce RTX 3050 6GB Laptop GPU (6.0 GB VRAM)
GPU registered with backend
```

Your GPU now appears on the **Take GPU** marketplace and the agent begins polling
for jobs. Leave it running; stop it with Ctrl+C.

While the agent is online, it sends GPU and system-health snapshots every 15
seconds. The Host page shows GPU temperature, utilization, VRAM, power and fan
speed, plus CPU and RAM usage, uptime, disk use, and network totals. GPU readings
require NVIDIA drivers and `nvidia-smi`; CPU temperature is shown when the
operating system exposes a sensor. Safety alerts notify the host but do not
automatically stop or throttle a running job.
Alerts are raised at GPU 80°C (critical at 92°C), CPU 85°C (critical at 95°C),
GPU power 350 W, or RAM usage 90%.

If the default port `7000` is already in use, the agent automatically tries
ports `7001` through `7100` and registers the selected port with the backend.

## How a job runs

1. The agent claims a queued job it has enough VRAM for, taking a 30-second lease
   that it renews while the job runs.
2. The job's script is downloaded into a temp directory mounted at `/workspace`.
3. The container runs with the GPU attached, if one is available.
4. stdout is streamed back to the renter's log view line by line.
5. Anything written to `/workspace/output` (`$OUTPUT_DIR`) is zipped and uploaded
   for the renter to download.

If the agent stops renewing its lease — crash, network loss, shutdown — the
backend requeues the job on another host automatically.

## Troubleshooting

**`Docker is not reachable, so this GPU will not accept jobs`**
Docker isn't running. Start Docker Desktop and the agent resumes on its own. The
agent deliberately refuses to claim jobs it cannot run, so nobody's work is lost.

**`Backend rejected this agent's token (401)`**
`AGENT_JWT_TOKEN` is missing, wrong, or expired. Get a fresh one from the Add GPU
page and restart.

**`No NVIDIA GPU detected — running on CPU`**
`nvidia-smi` isn't on PATH or there's no NVIDIA GPU. The agent still works, but
only for jobs that fit a CPU-only node.

**`GPU passthrough unavailable ... running on CPU`**
The GPU was detected but Docker can't pass it through — install the NVIDIA
Container Toolkit. The job still runs, just without the GPU.

**My GPU shows as offline**
The backend marks a GPU offline after 60 seconds without a heartbeat. Check the
agent is running and can reach `BACKEND_URL`.

**Host reclaim doesn't work**
Reclaim needs the backend to reach this agent on `AGENT_PORT` (default 7000; the
agent selects another available port from `7001`–`7100` if needed). Allow the
selected port from the backend's address. Everything else works without it.

## Packaging the Windows download

From the repository root, run `python agent/package_windows.py` to regenerate
`frontend/public/downloads/computegrid-gpu-agent-windows-v5.zip` after changing
the agent or installer.
