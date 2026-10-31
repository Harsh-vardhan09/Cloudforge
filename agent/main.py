"""
GPU Host Agent — FastAPI server.

Endpoints:
  GET  /health       — liveness check
  GET  /gpu-info     — GPU hardware info
  POST /run          — dispatch a Docker job (called by backend scheduler)
  POST /stop         — stop a running job
  GET  /jobs         — list active jobs
"""
import asyncio
import hmac
import logging
import os
import signal
import threading
import time
import requests
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, BackgroundTasks, Header
from pydantic import BaseModel

from config import settings
from gpu_info import get_gpu_info, get_gpu_metrics
from docker_runner import run_docker_job, stop_job, checkpoint_and_stop_job, docker_available
from heartbeat import start_heartbeat_thread, go_offline

import argparse
# Setup CLI Argument Parser for easy UI integration
_parser = argparse.ArgumentParser(add_help=False)
_parser.add_argument("--token", dest="cli_token")
_args, _unknown = _parser.parse_known_args()
if _args.cli_token:
    settings.agent_jwt_token = _args.cli_token

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.DEBUG if os.getenv("DEBUG") else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------
active_jobs: dict[str, str] = {}  # job_id → container_id
active_job_attempts: dict[str, int] = {}
active_job_deadlines: dict[str, float] = {}
abandoned_attempts: set[str] = set()
reclaiming_jobs: set[str] = set()
job_finished_events: dict[str, threading.Event] = {}
scheduler_paused = threading.Event()
stop_scheduler = threading.Event()
_last_docker_problem: Optional[str] = None


def start_scheduler_thread() -> None:
    if not settings.agent_jwt_token:
        logger.error(
            "AGENT_JWT_TOKEN is not set, so this agent cannot accept jobs. Copy your token "
            "from the Add GPU page and either set it in agent/.env or pass --token <token>."
        )
        return

    headers = {"Authorization": f"Bearer {settings.agent_jwt_token}"}
    backend_url = settings.backend_url.rstrip("/")

    while not stop_scheduler.is_set():
        for job_id, attempt in list(active_job_attempts.items()):
            if time.monotonic() >= active_job_deadlines.get(job_id, 0):
                logger.warning(f"Lease expired locally for job {job_id}; stopping stale work")
                abandoned_attempts.add(job_id)
                stop_job(job_id, active_jobs)
                active_job_attempts.pop(job_id, None)
                active_job_deadlines.pop(job_id, None)
                continue
            try:
                response = requests.patch(
                    f"{backend_url}/api/jobs/{job_id}/lease",
                    json={"attempt": attempt},
                    headers=headers,
                    timeout=5,
                )
                if response.status_code == 409:
                    logger.warning(f"Lease lost for job {job_id} attempt {attempt}; stopping stale work")
                    abandoned_attempts.add(job_id)
                    stop_job(job_id, active_jobs)
                    active_job_attempts.pop(job_id, None)
                    active_job_deadlines.pop(job_id, None)
                elif response.ok:
                    lease_seconds = response.json().get("leaseSeconds", 30)
                    active_job_deadlines[job_id] = time.monotonic() + lease_seconds
                elif response.status_code >= 400:
                    logger.warning(f"Lease renewal failed for job {job_id}: {response.status_code}")
                    if response.status_code < 500:
                        abandoned_attempts.add(job_id)
                        stop_job(job_id, active_jobs)
                        active_job_attempts.pop(job_id, None)
                        active_job_deadlines.pop(job_id, None)
            except requests.RequestException as error:
                logger.warning(f"Could not renew lease for job {job_id}: {error}")

        for job_id in list(active_job_deadlines):
            if job_id not in active_job_attempts:
                active_job_deadlines.pop(job_id, None)
        for job_id, finished in list(job_finished_events.items()):
            if finished.is_set():
                job_finished_events.pop(job_id, None)

        if scheduler_paused.is_set():
            stop_scheduler.wait(10)
            continue

        # Never take work this machine cannot run. A host whose Docker is down would
        # otherwise claim jobs and instantly fail them, using up the renter's attempts.
        docker_ok, docker_problem = docker_available()
        if not docker_ok:
            global _last_docker_problem
            if docker_problem != _last_docker_problem:
                logger.error(
                    f"Docker is not reachable, so this GPU will not accept jobs: {docker_problem}. "
                    "Start Docker Desktop (or the docker service) and the agent will resume automatically."
                )
                _last_docker_problem = docker_problem
            stop_scheduler.wait(15)
            continue
        if _last_docker_problem is not None:
            logger.info("Docker is reachable again; resuming job claims")
            _last_docker_problem = None

        while len(active_jobs) < settings.max_concurrent_jobs and not stop_scheduler.is_set():
            try:
                response = requests.post(
                    f"{backend_url}/api/jobs/claim",
                    json={},
                    headers=headers,
                    timeout=10,
                )
                if response.status_code == 401:
                    # Silent failure here used to look exactly like "no work available".
                    logger.error(
                        "Backend rejected this agent's token (401). AGENT_JWT_TOKEN is missing, "
                        "invalid, or expired. Sign in to the dashboard, copy a fresh token from "
                        "the Add GPU page, and restart the agent."
                    )
                    stop_scheduler.wait(30)
                    break
                if response.status_code == 409:
                    break
                response.raise_for_status()
                claim = response.json()
                job = claim.get("job")
                if not job:
                    break

                job_id = str(job["_id"])
                attempt = claim["attempt"]
                active_jobs[job_id] = "claiming"
                active_job_attempts[job_id] = attempt
                active_job_deadlines[job_id] = time.monotonic() + claim.get("leaseSeconds", 30)
                finished_event = threading.Event()
                job_finished_events[job_id] = finished_event
                threading.Thread(
                    target=run_docker_job,
                    kwargs={
                        "job_id": job_id,
                        "docker_image": job["dockerImage"],
                        "command": job["command"],
                        "backend_url": backend_url,
                        "env": job.get("env") or {},
                        "active_jobs": active_jobs,
                        "token": settings.agent_jwt_token,
                        "script_name": job.get("scriptName") or "",
                        "input_download_url": claim.get("inputDownloadUrl") or "",
                        "script_content": job.get("legacyScriptContent") or "",
                        "attempt": attempt,
                        "checkpoint_download_url": claim.get("checkpointDownloadUrl") or "",
                        "checkpoint_sequence": claim.get("checkpointSequence", 0),
                        "checkpoint_step": claim.get("checkpointStep", 0),
                        "checkpoint_total_steps": claim.get("checkpointTotalSteps", 0),
                        "active_attempts": active_job_attempts,
                        "abandoned_attempts": abandoned_attempts,
                        "reclaiming_jobs": reclaiming_jobs,
                        "job_finished_event": finished_event,
                    },
                    daemon=True,
                ).start()
            except requests.RequestException as error:
                logger.warning(f"Scheduler claim request failed: {error}")
                break
            except (KeyError, ValueError) as error:
                logger.error(f"Invalid job claim response: {error}")
                break

        stop_scheduler.wait(10)

# ---------------------------------------------------------------------------
# Lifespan (replaces on_event startup/shutdown)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 GPU Host Agent starting...")
    stop_scheduler.clear()
    abandoned_attempts.clear()
    reclaiming_jobs.clear()
    scheduler_paused.clear()

    # Start heartbeat thread in background
    hb_thread = threading.Thread(
        target=start_heartbeat_thread,
        args=(stop_scheduler, scheduler_paused),
        daemon=True,
    )
    hb_thread.start()
    logger.info(f"Heartbeat thread started (interval: {settings.heartbeat_interval}s)")

    scheduler_thread = threading.Thread(target=start_scheduler_thread, daemon=True)
    scheduler_thread.start()
    logger.info("Job claim and lease scheduler started")

    yield  # App is running

    # Cleanup on shutdown
    logger.info("GPU Host Agent shutting down...")
    stop_scheduler.set()
    for job_id in list(active_job_attempts):
        abandoned_attempts.add(job_id)
        stop_job(job_id, active_jobs)
    active_job_attempts.clear()
    active_job_deadlines.clear()
    go_offline()


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="GPU Host Agent",
    version="1.0.0",
    description="Receives job dispatches from the backend and runs them in Docker containers",
    lifespan=lifespan,
)

# No CORS middleware: this agent is machine-to-machine only. The backend calls it
# server-side and no browser code talks to it, so there is no origin to allow.


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
def require_agent_token(authorization: Optional[str] = Header(None)) -> None:
    """Reject any caller that does not present this agent's own platform token.

    Every endpoint here either runs containers on the host or reports on them, so
    all of them are gated. Compared in constant time, on bytes so that a non-ASCII
    header is a 401 rather than a 500.
    """
    expected = f"Bearer {settings.agent_jwt_token}" if settings.agent_jwt_token else ""
    if (
        not expected
        or not authorization
        or not hmac.compare_digest(authorization.encode("utf-8"), expected.encode("utf-8"))
    ):
        raise HTTPException(status_code=401, detail="Invalid GPU agent credentials")


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------
class RunRequest(BaseModel):
    jobId: str
    dockerImage: str
    command: str
    backendUrl: str
    env: Optional[dict] = {}
    scriptName: Optional[str] = ""
    scriptContent: Optional[str] = ""


class StopRequest(BaseModel):
    jobId: str


class ReclaimRequest(BaseModel):
    jobId: str
    attempt: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    """Unauthenticated liveness probe. Deliberately reports nothing about the host."""
    return {"status": "ok"}


@app.get("/gpu-info", dependencies=[Depends(require_agent_token)])
async def gpu_info():
    info = get_gpu_info()
    if not info:
        raise HTTPException(status_code=503, detail="No GPU detected")
    metrics = get_gpu_metrics()
    return {**info, **metrics}


@app.post("/run", dependencies=[Depends(require_agent_token)])
async def run(req: RunRequest, background_tasks: BackgroundTasks):
    if req.jobId in active_jobs:
        raise HTTPException(status_code=409, detail=f"Job {req.jobId} is already running")

    if len(active_jobs) >= settings.max_concurrent_jobs:
        raise HTTPException(
            status_code=429,
            detail=f"Agent busy: max {settings.max_concurrent_jobs} concurrent jobs",
        )

    active_jobs[req.jobId] = "claiming"
    logger.info(f"Job {req.jobId}: dispatch received — image={req.dockerImage}")

    # Run Docker job in a background thread (non-blocking)
    background_tasks.add_task(
        asyncio.get_event_loop().run_in_executor,
        None,
        lambda: run_docker_job(
            job_id=req.jobId,
            docker_image=req.dockerImage,
            command=req.command,
            backend_url=req.backendUrl,
            env=req.env or {},
            active_jobs=active_jobs,
            token=settings.agent_jwt_token,
            script_name=req.scriptName or "",
            script_content=req.scriptContent or "",
        ),
    )

    return {"message": "Job dispatched", "jobId": req.jobId}


@app.post("/stop", dependencies=[Depends(require_agent_token)])
async def stop(req: StopRequest):
    if req.jobId not in active_jobs:
        raise HTTPException(status_code=404, detail=f"Job {req.jobId} not found")

    success = stop_job(req.jobId, active_jobs)
    return {"message": f"Job {req.jobId} {'stopped' if success else 'stop attempted'}", "success": success}


@app.post("/reclaim", dependencies=[Depends(require_agent_token)])
async def reclaim(req: ReclaimRequest):
    """Stop a leased job after its latest checkpoint has been durably uploaded."""
    logger.info(f"Reclaim signal received for job {req.jobId}")
    try:
        result = checkpoint_and_stop_job(
            job_id=req.jobId,
            active_jobs=active_jobs,
            attempt=req.attempt,
            active_attempts=active_job_attempts,
            reclaiming_jobs=reclaiming_jobs,
            job_finished_events=job_finished_events,
        )
        scheduler_paused.set()
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except TimeoutError as error:
        raise HTTPException(status_code=504, detail=str(error)) from error
    except Exception as error:
        logger.exception(f"Failed to stop job {req.jobId} for reclaim")
        raise HTTPException(status_code=500, detail="Could not stop the job safely") from error

    return {
        "message": "Job stopped after checkpoint",
        "jobId": req.jobId,
        **result,
    }



@app.get("/jobs", dependencies=[Depends(require_agent_token)])
async def list_jobs():
    return {
        "active": list(active_jobs.keys()),
        "count": len(active_jobs),
    }


@app.get("/metrics", dependencies=[Depends(require_agent_token)])
async def metrics():
    """Real-time GPU metrics for monitoring."""
    return get_gpu_metrics() or {"error": "No GPU available"}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.agent_port,
        reload=False,
        log_level="info",
    )
