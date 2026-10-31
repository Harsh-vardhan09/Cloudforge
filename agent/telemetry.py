"""
Hardware Telemetry Collector — GPU Agent.

Gathers host PC health metrics (CPU, RAM, GPU, temperature, power,
uptime, fan speed) and classifies them against safety thresholds.
Used to stream live telemetry to the backend while a job is running,
so that GPU owners can monitor their hardware's health in real time.
"""
import os
import time
import logging
import threading
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Safety Thresholds
# ---------------------------------------------------------------------------
THRESHOLDS = {
    "gpu_temp_warning":  80,   # °C
    "gpu_temp_critical": 92,   # °C
    "cpu_temp_warning":  85,   # °C
    "cpu_temp_critical": 95,   # °C
    "gpu_util_warning":  95,   # %
    "ram_pct_warning":   90,   # %
    "power_warning":     350,  # W  (most consumer GPUs are ≤ 350W TGP)
}

# ---------------------------------------------------------------------------
# Helpers — try importing optional deps at import time
# ---------------------------------------------------------------------------
try:
    import psutil
    _psutil_ok = True
except ImportError:
    _psutil_ok = False
    logger.warning("psutil not installed — CPU/RAM/uptime metrics will be unavailable. "
                   "Run: pip install psutil")

try:
    import pynvml
    pynvml.nvmlInit()
    _nvml_ok = True
except Exception:
    _nvml_ok = False   # graceful fallback on non-NVIDIA hosts

# ---------------------------------------------------------------------------
# Low-level collectors
# ---------------------------------------------------------------------------

def _collect_cpu_metrics() -> dict:
    if not _psutil_ok:
        return {}
    try:
        cpu_pct  = psutil.cpu_percent(interval=0.5)
        ram      = psutil.virtual_memory()
        disk_io  = psutil.disk_io_counters()
        net_io   = psutil.net_io_counters()
        uptime_s = int(time.time() - psutil.boot_time())

        # CPU temperature (Linux: sensors; Windows: may be unavailable)
        cpu_temp = None
        try:
            temps = psutil.sensors_temperatures()
            for key in ("coretemp", "k10temp", "cpu_thermal"):
                if key in temps and temps[key]:
                    cpu_temp = max(t.current for t in temps[key])
                    break
        except (AttributeError, Exception):
            pass  # Windows or missing sensor support

        return {
            "cpu_pct":         round(cpu_pct, 1),
            "ram_pct":         round(ram.percent, 1),
            "ram_used_mb":     ram.used // (1024 * 1024),
            "ram_total_mb":    ram.total // (1024 * 1024),
            "cpu_temp":        round(cpu_temp, 1) if cpu_temp is not None else None,
            "uptime_seconds":  uptime_s,
            "disk_read_mb":    round((disk_io.read_bytes  if disk_io else 0) / 1e6, 1),
            "disk_write_mb":   round((disk_io.write_bytes if disk_io else 0) / 1e6, 1),
            "net_sent_mb":     round((net_io.bytes_sent   if net_io  else 0) / 1e6, 1),
            "net_recv_mb":     round((net_io.bytes_recv   if net_io  else 0) / 1e6, 1),
        }
    except Exception as exc:
        logger.debug(f"CPU metric collection error: {exc}")
        return {}


def _collect_gpu_metrics_nvml() -> dict:
    """Precise GPU metrics via pynvml (preferred)."""
    try:
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)

        util       = pynvml.nvmlDeviceGetUtilizationRates(handle)
        mem        = pynvml.nvmlDeviceGetMemoryInfo(handle)
        temp       = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)

        # Power (may raise on some GPUs)
        try:
            power_mw   = pynvml.nvmlDeviceGetPowerUsage(handle)
            power_w    = power_mw / 1000.0
        except Exception:
            power_w = None

        # Fan speed (may raise if no fan sensor)
        try:
            fan_pct = pynvml.nvmlDeviceGetFanSpeed(handle)
        except Exception:
            fan_pct = None

        # Clock speeds
        try:
            clock_sm   = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_SM)
            clock_mem  = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_MEM)
        except Exception:
            clock_sm = clock_mem = None

        return {
            "gpu_util":      util.gpu,
            "gpu_mem_util":  util.memory,
            "gpu_mem_used_mb":  mem.used  // (1024 * 1024),
            "gpu_mem_total_mb": mem.total // (1024 * 1024),
            "gpu_temp":      temp,
            "gpu_power_w":   round(power_w, 1) if power_w is not None else None,
            "gpu_fan_pct":   fan_pct,
            "gpu_clock_sm":  clock_sm,
            "gpu_clock_mem": clock_mem,
        }
    except Exception as exc:
        logger.debug(f"pynvml collection error: {exc}")
        return {}


def _collect_gpu_metrics_smi() -> dict:
    """Fallback GPU metrics via nvidia-smi subprocess."""
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=utilization.gpu,utilization.memory,"
                "memory.used,memory.total,temperature.gpu,"
                "power.draw,fan.speed",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True, text=True, timeout=8,
        )
        if result.returncode != 0:
            return {}
        parts = [p.strip() for p in result.stdout.strip().split(",")]
        def _int(v):
            try: return int(v)
            except: return None
        def _float(v):
            try: return float(v)
            except: return None
        return {
            "gpu_util":          _int(parts[0]),
            "gpu_mem_util":      _int(parts[1]),
            "gpu_mem_used_mb":   _int(parts[2]),
            "gpu_mem_total_mb":  _int(parts[3]),
            "gpu_temp":          _int(parts[4]),
            "gpu_power_w":       _float(parts[5]) if len(parts) > 5 and parts[5] != "[N/A]" else None,
            "gpu_fan_pct":       _int(parts[6]) if len(parts) > 6 and parts[6] != "[N/A]" else None,
        }
    except Exception:
        return {}


def _collect_gpu_metrics() -> dict:
    if _nvml_ok:
        return _collect_gpu_metrics_nvml()
    return _collect_gpu_metrics_smi()


# ---------------------------------------------------------------------------
# Safety evaluation
# ---------------------------------------------------------------------------

def _evaluate_safety(snapshot: dict) -> dict:
    """
    Returns a safety dict:
      level: "ok" | "warning" | "critical"
      alerts: [str, ...]  — human-readable descriptions
    """
    alerts = []
    level  = "ok"

    def _flag(condition: bool, message: str, severity: str):
        nonlocal level
        if condition:
            alerts.append(message)
            if severity == "critical":
                level = "critical"
            elif severity == "warning" and level != "critical":
                level = "warning"

    gpu_temp  = snapshot.get("gpu_temp")
    cpu_temp  = snapshot.get("cpu_temp")
    gpu_util  = snapshot.get("gpu_util")
    ram_pct   = snapshot.get("ram_pct")
    gpu_power = snapshot.get("gpu_power_w")

    if gpu_temp is not None:
        _flag(gpu_temp >= THRESHOLDS["gpu_temp_critical"],
              f"GPU temperature CRITICAL: {gpu_temp}°C", "critical")
        _flag(THRESHOLDS["gpu_temp_warning"] <= gpu_temp < THRESHOLDS["gpu_temp_critical"],
              f"GPU temperature warning: {gpu_temp}°C", "warning")

    if cpu_temp is not None:
        _flag(cpu_temp >= THRESHOLDS["cpu_temp_critical"],
              f"CPU temperature CRITICAL: {cpu_temp}°C", "critical")
        _flag(THRESHOLDS["cpu_temp_warning"] <= cpu_temp < THRESHOLDS["cpu_temp_critical"],
              f"CPU temperature warning: {cpu_temp}°C", "warning")

    if gpu_util is not None:
        _flag(gpu_util >= THRESHOLDS["gpu_util_warning"],
              f"GPU utilization at maximum: {gpu_util}%", "warning")

    if ram_pct is not None:
        _flag(ram_pct >= THRESHOLDS["ram_pct_warning"],
              f"RAM usage high: {ram_pct}%", "warning")

    if gpu_power is not None:
        _flag(gpu_power >= THRESHOLDS["power_warning"],
              f"GPU power draw high: {gpu_power}W", "warning")

    return {"level": level, "alerts": alerts}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def collect_telemetry_snapshot(job_id: Optional[str] = None) -> dict:
    """
    Collect a full telemetry snapshot.
    Returns a dict ready to POST to /api/gpu/telemetry.
    """
    cpu = _collect_cpu_metrics()
    gpu = _collect_gpu_metrics()
    snapshot = {**cpu, **gpu, "timestamp": time.time()}
    safety   = _evaluate_safety(snapshot)
    snapshot["safety"] = safety
    if job_id:
        snapshot["jobId"] = job_id
    return snapshot


# ---------------------------------------------------------------------------
# Background Telemetry Loop
# ---------------------------------------------------------------------------

class TelemetryStreamer:
    """
    Streams hardware telemetry to the backend while a job is running.

    Usage:
        streamer = TelemetryStreamer(job_id, backend_url, token, interval=15)
        streamer.start()
        # ... job runs ...
        streamer.stop()
    """

    def __init__(
        self,
        job_id: str,
        backend_url: str,
        token: str,
        interval: int = 15,
    ):
        self.job_id      = job_id
        self.backend_url = backend_url.rstrip("/")
        self.token       = token
        self.interval    = interval
        self._stop       = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self):
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._loop, daemon=True, name=f"telemetry-{self.job_id[:8]}"
        )
        self._thread.start()
        logger.info(f"[Telemetry] Streaming started for job {self.job_id} (interval={self.interval}s)")

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
        logger.info(f"[Telemetry] Streaming stopped for job {self.job_id}")

    def _loop(self):
        import requests
        headers = {"Authorization": f"Bearer {self.token}"}
        while not self._stop.wait(self.interval):
            try:
                snapshot = collect_telemetry_snapshot(self.job_id)
                resp = requests.post(
                    f"{self.backend_url}/api/gpu/telemetry",
                    json=snapshot,
                    headers=headers,
                    timeout=8,
                )
                if not resp.ok:
                    logger.debug(f"[Telemetry] Backend returned {resp.status_code}")

                # Emit a local warning if safety threshold crossed
                safety = snapshot.get("safety", {})
                if safety.get("level") in ("warning", "critical"):
                    for alert in safety.get("alerts", []):
                        logger.warning(f"[Telemetry] ⚠️  {alert}")

            except Exception as exc:
                logger.debug(f"[Telemetry] Publish failed: {exc}")
