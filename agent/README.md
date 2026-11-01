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
Heartbeat thread started (interval: 30s)
Job claim and lease scheduler started
Uvicorn running on http://0.0.0.0:7000
Detected GPU: NVIDIA GeForce RTX 3050 6GB Laptop GPU (6.0 GB VRAM)
GPU registered with backend
```

Your GPU now appears on the **Take GPU** marketplace and the agent begins polling
for jobs. Leave it running; stop it with Ctrl+C.

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
Reclaim needs the backend to reach this agent on `AGENT_PORT` (default 7000).
Allow that port from the backend's address. Everything else works without it.
