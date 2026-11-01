"""
Heartbeat loop — runs in a background thread.
Registers the GPU with the backend on startup, then sends
a heartbeat every N seconds to stay "online" in the registry.
"""
import time
import logging
import os
import socket
import threading
import requests
from typing import Optional
from gpu_info import get_gpu_info, get_gpu_metrics

from config import settings
from gpu_info import get_gpu_info, get_gpu_metrics

logger = logging.getLogger(__name__)


def _headers() -> dict:
    if settings.agent_jwt_token:
        return {"Authorization": f"Bearer {settings.agent_jwt_token}"}
    return {}


def get_local_ip():
    """Returns the primary local IP address of this machine."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "127.0.0.1"


def register_gpu() -> bool:
    """Register GPU with the backend. Returns True on success."""
    gpu = get_gpu_info()

    if gpu:
        logger.info(f"Detected GPU: {gpu['model']} ({gpu['vram']} GB VRAM)")
    else:
        logger.warning("No GPU detected — registering as CPU-only node")
        gpu = {"model": "CPU-Only", "vram": 0}

    payload = {
        "model": gpu["model"],
        "vram": gpu["vram"],
        "ipAddress": get_local_ip(),
        "agentPort": settings.agent_port,
        "pricePerHour": settings.price_per_hour,
        "maxConcurrentJobs": settings.max_concurrent_jobs,
        "acceptingJobs": True,
    }

    for attempt in range(5):
        try:
            resp = requests.post(
                f"{settings.backend_url}/api/gpu/register",
                json=payload,
                headers=_headers(),
                timeout=10,
            )
            if resp.status_code == 200:
                logger.info("✅ GPU registered with backend")
                return True
            if resp.status_code == 401:
                logger.error(
                    "Backend rejected this agent's token (401). Copy a fresh token from the "
                    "Add GPU page into AGENT_JWT_TOKEN (or --token) and restart the agent."
                )
                return False
            if 400 <= resp.status_code < 500:
                # A client error will not resolve by retrying the same payload.
                logger.error(f"Registration rejected ({resp.status_code}): {resp.text}")
                return False
            logger.warning(f"Registration failed ({resp.status_code}): {resp.text}")
        except requests.exceptions.ConnectionError:
            wait = 2 ** attempt
            logger.warning(f"Backend not reachable (attempt {attempt + 1}/5). Retrying in {wait}s...")
            time.sleep(wait)
        except Exception as e:
            logger.error(f"Unexpected registration error: {e}")
            break

    logger.error("❌ Failed to register GPU after 5 attempts")
    return False


_last_heartbeat_problem = None


def send_heartbeat(paused: bool = False) -> None:
    """Send heartbeat with real-time GPU metrics."""
    global _last_heartbeat_problem
    try:
        metrics = get_gpu_metrics()
        resp = requests.patch(
            f"{settings.backend_url}/api/gpu/heartbeat",
            json={
                "metrics": metrics,
                "ipAddress": get_local_ip(),
                "paused": paused,
            },
            headers=_headers(),
            timeout=5,
        )
        if resp.status_code == 200:
            if _last_heartbeat_problem is not None:
                logger.info("Heartbeat recovered; this GPU is online again")
                _last_heartbeat_problem = None
            return
        problem = f"status {resp.status_code}"
        if resp.status_code == 401:
            problem = "token rejected (401) - set a fresh AGENT_JWT_TOKEN and restart"
        # Log each distinct problem once rather than every interval.
        if problem != _last_heartbeat_problem:
            logger.error(f"Heartbeat failing, so this GPU will drop offline: {problem}")
            _last_heartbeat_problem = problem
    except Exception as error:
        problem = f"{type(error).__name__}: {error}"
        if problem != _last_heartbeat_problem:
            logger.warning(f"Heartbeat could not reach the backend: {problem}")
            _last_heartbeat_problem = problem


def go_offline() -> None:
    """Notify backend that this GPU is going offline."""
    try:
        requests.patch(
            f"{settings.backend_url}/api/gpu/offline",
            headers=_headers(),
            timeout=5,
        )
        logger.info("GPU set to offline")
    except Exception:
        pass


def start_heartbeat_thread(
    stop_event: Optional[threading.Event] = None,
    paused_event: Optional[threading.Event] = None,
) -> None:
    """
    Main loop for the heartbeat background thread.
    1. Register GPU on startup
    2. Send heartbeat every HEARTBEAT_INTERVAL seconds
    """
    register_gpu()

    while stop_event is None or not stop_event.wait(settings.heartbeat_interval):
        send_heartbeat(paused=paused_event.is_set() if paused_event else False)
