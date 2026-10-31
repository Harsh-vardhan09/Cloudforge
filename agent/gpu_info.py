"""
GPU detection via nvidia-smi.
Falls back to CPU-only mode if no NVIDIA GPU is found.
"""
import subprocess
import json
from typing import Optional


def get_gpu_info() -> Optional[dict]:
    """
    Query nvidia-smi for GPU name, VRAM, utilization, and temperature.
    Returns a dict or None if no GPU found.
    """
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,utilization.gpu,temperature.gpu,driver_version",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode != 0:
            return None

        line = result.stdout.strip().split("\n")[0]
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 2:
            return None

        vram_mb = int(parts[1])
        return {
            "model": parts[0],
            "vram": round(vram_mb / 1024, 1),          # GB
            "vram_mb": vram_mb,
            "utilization": int(parts[2]) if len(parts) > 2 else 0,
            "temperature": int(parts[3]) if len(parts) > 3 else 0,
            "driver_version": parts[4] if len(parts) > 4 else "unknown",
        }

    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError, IndexError):
        return None


def get_gpu_metrics() -> dict:
    """
    Real-time GPU utilization metrics for heartbeat payloads.
    Returns empty dict if nvidia-smi is unavailable.
    """
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return {}

        parts = [p.strip() for p in result.stdout.strip().split(",")]
        return {
            "gpu_util": int(parts[0]),
            "mem_util": int(parts[1]),
            "mem_used_mb": int(parts[2]),
            "mem_total_mb": int(parts[3]),
            "temperature": int(parts[4]),
            "power_watts": float(parts[5]) if len(parts) > 5 and parts[5] != "[N/A]" else 0.0,
        }
    except Exception:
        return {}
