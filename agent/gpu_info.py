"""
GPU detection via nvidia-smi.
Falls back to CPU-only mode if no NVIDIA GPU is found.
"""
import subprocess
import os
import time
from typing import Optional

import psutil


def _number(value: str, cast=int) -> Optional[float]:
    if value.strip().upper() in {"N/A", "[N/A]", "NOT SUPPORTED"}:
        return None
    try:
        return cast(value.strip())
    except ValueError:
        return None


def _cpu_temperature() -> Optional[float]:
    sensors = getattr(psutil, "sensors_temperatures", None)
    if sensors is None:
        return None
    try:
        readings = sensors(fahrenheit=False)
    except (OSError, RuntimeError):
        return None
    cpu_sensor_names = ("cpu", "core", "package", "tctl", "tdie", "acpitz")
    temperatures = []
    for sensor_name, entries in readings.items():
        for entry in entries:
            label = f"{sensor_name} {entry.label}".lower()
            if entry.current is not None and any(name in label for name in cpu_sensor_names):
                temperatures.append(entry.current)
    return round(max(temperatures), 1) if temperatures else None


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
    Collect GPU and system health metrics for heartbeat payloads.
    NVIDIA-specific values are omitted when nvidia-smi is unavailable.
    """
    metrics = {}
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw,fan.speed",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            parts = [part.strip() for part in result.stdout.strip().split(",")]
            if len(parts) >= 5:
                gpu_util = _number(parts[0])
                mem_util = _number(parts[1])
                mem_used = _number(parts[2])
                mem_total = _number(parts[3])
                gpu_temp = _number(parts[4])
                gpu_power = _number(parts[5], float) if len(parts) > 5 else None
                gpu_fan = _number(parts[6]) if len(parts) > 6 else None
                metrics.update({
                    "gpu_util": gpu_util,
                    "mem_util": mem_util,
                    "mem_used_mb": mem_used,
                    "mem_total_mb": mem_total,
                    "gpu_mem_used_mb": mem_used,
                    "gpu_mem_total_mb": mem_total,
                    "temperature": gpu_temp,
                    "gpu_temp": gpu_temp,
                    "power_watts": gpu_power,
                    "gpu_power_w": gpu_power,
                    "gpu_fan_pct": gpu_fan,
                })
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        pass

    memory = psutil.virtual_memory()
    disk = psutil.disk_usage(os.path.abspath(os.sep))
    network = psutil.net_io_counters()
    metrics.update({
        "cpu_pct": psutil.cpu_percent(interval=0.1),
        "ram_pct": memory.percent,
        "ram_used_mb": round(memory.used / (1024 * 1024)),
        "ram_total_mb": round(memory.total / (1024 * 1024)),
        "cpu_temp": _cpu_temperature(),
        "uptime_seconds": max(0, int(time.time() - psutil.boot_time())),
        "disk_used_pct": disk.percent,
        "disk_used_gb": round(disk.used / (1024 ** 3), 2),
        "disk_total_gb": round(disk.total / (1024 ** 3), 2),
        "net_sent_mb": round(network.bytes_sent / (1024 * 1024), 2),
        "net_recv_mb": round(network.bytes_recv / (1024 * 1024), 2),
    })
    return {key: value for key, value in metrics.items() if value is not None}
