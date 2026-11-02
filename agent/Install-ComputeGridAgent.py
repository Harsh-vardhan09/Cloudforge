import ctypes
import math
import re
import shutil
import subprocess
import sys
import venv
from pathlib import Path
from urllib.parse import urlparse


AGENT_DIR = Path(__file__).resolve().parent / "agent"
GIB = 1024 ** 3
RAM_LIMIT_OPTIONS = [
    (0.25, "256m"),
    (0.5, "512m"),
    (1, "1g"),
    (2, "2g"),
    (4, "4g"),
    (8, "8g"),
    (16, "16g"),
    (32, "32g"),
]


def fail(message: str) -> None:
    raise RuntimeError(message)


def run(command: list[str], *, cwd: Path | None = None) -> None:
    subprocess.run(command, cwd=cwd, check=True)


def get_total_physical_memory_gib() -> float:
    class MemoryStatus(ctypes.Structure):
        _fields_ = [
            ("dwLength", ctypes.c_ulong),
            ("dwMemoryLoad", ctypes.c_ulong),
            ("ullTotalPhys", ctypes.c_ulonglong),
            ("ullAvailPhys", ctypes.c_ulonglong),
            ("ullTotalPageFile", ctypes.c_ulonglong),
            ("ullAvailPageFile", ctypes.c_ulonglong),
            ("ullTotalVirtual", ctypes.c_ulonglong),
            ("ullAvailVirtual", ctypes.c_ulonglong),
            ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
        ]

    memory_status = MemoryStatus()
    memory_status.dwLength = ctypes.sizeof(MemoryStatus)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory_status)):
        fail("Could not detect installed system RAM. Check Windows system information and rerun the installer.")
    return memory_status.ullTotalPhys / GIB


def choose_job_memory_limit(total_ram_gib: float) -> tuple[str, int]:
    # Reserve 40% for Windows, Docker, the agent, and other host applications.
    # Account for the agent's default of two simultaneous jobs when generating options.
    job_memory_budget_gib = total_ram_gib * 0.6
    max_concurrent_jobs = min(2, max(1, math.floor(job_memory_budget_gib / 0.5)))
    per_job_budget_gib = job_memory_budget_gib / max_concurrent_jobs
    choices = [
        (size_gib, docker_limit)
        for size_gib, docker_limit in RAM_LIMIT_OPTIONS
        if size_gib <= per_job_budget_gib
    ]
    if not choices:
        choices = [RAM_LIMIT_OPTIONS[0]]

    print(
        f"\nDetected {total_ram_gib:.1f} GB system RAM. "
        f"The agent will reserve about 40% for Windows and other apps, "
        f"and allow up to {max_concurrent_jobs} simultaneous job(s)."
    )
    print("Choose the maximum system RAM available to each job:")
    for index, (size_gib, docker_limit) in enumerate(choices, start=1):
        recommended = " (recommended)" if index == len(choices) else ""
        print(
            f"  {index}. {docker_limit} per job"
            f" (up to {size_gib * max_concurrent_jobs:g} GB across concurrent jobs)"
            f"{recommended}"
        )

    default_choice = str(len(choices))
    selected = input(f"RAM limit [{default_choice}]: ").strip() or default_choice
    if not selected.isdigit() or not 1 <= int(selected) <= len(choices):
        fail("Choose one of the listed RAM limit numbers and rerun the installer.")
    return choices[int(selected) - 1][1], max_concurrent_jobs


def main() -> None:
    if sys.version_info[:2] not in {(3, 11), (3, 12), (3, 13)}:
        fail("Python 3.11, 3.12, or 3.13 is required. Install a supported version and rerun Install.bat.")
    if not (AGENT_DIR / "main.py").is_file():
        fail("Agent files are missing. Extract the complete ZIP before running Install.bat.")
    if not shutil.which("docker"):
        fail("Docker is not installed. Install Docker Desktop, then rerun Install.bat.")

    try:
        docker_status = subprocess.run(
            ["docker", "info"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        fail("Docker did not respond. Start Docker Desktop, wait until it is ready, then rerun Install.bat.")
    if docker_status.returncode:
        fail("Docker is installed but not running. Start Docker Desktop, then rerun Install.bat.")

    default_backend_url = "http://localhost:5000"
    backend_url = input(f"Backend URL [{default_backend_url}]: ").strip() or default_backend_url
    parsed_url = urlparse(backend_url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        fail("Enter a valid backend URL beginning with http:// or https://.")

    token = input(
        "Paste the host token from the Add GPU page "
        "(input will be visible in this window): "
    ).strip()
    if not token:
        fail("A host token is required. Get one from the Add GPU page and rerun Install.bat.")
    if re.search(r"[\r\n]", token):
        fail("The host token must be a single line.")

    venv_dir = AGENT_DIR / ".venv"
    print("\nCreating the agent's isolated Python environment...")
    venv.EnvBuilder(with_pip=True).create(venv_dir)
    venv_python = venv_dir / "Scripts" / "python.exe"

    print("\nInstalling GPU agent dependencies. This may take a few minutes...")
    run([str(venv_python), "-m", "pip", "install", "-r", str(AGENT_DIR / "requirements.txt")])

    try:
        total_ram_gib = get_total_physical_memory_gib()
    except AttributeError:
        fail("RAM detection is supported on Windows only. Configure JOB_MEMORY_LIMIT manually when installing on another operating system.")
    job_memory_limit, max_concurrent_jobs = choose_job_memory_limit(total_ram_gib)

    env_values = {
        "BACKEND_URL": backend_url,
        "AGENT_JWT_TOKEN": token,
        "AGENT_PORT": "7000",
        "PRICE_PER_HOUR": "0.5",
        "HEARTBEAT_INTERVAL": "15",
        "MAX_CONCURRENT_JOBS": str(max_concurrent_jobs),
        "JOB_CPU_CORES": "4",
        "JOB_MEMORY_LIMIT": job_memory_limit,
        "DOCKER_IMAGE_PULL_POLICY": "if-not-present",
        "CHECKPOINT_INTERVAL_SECONDS": "60",
        "DEBUG": "false",
    }
    env_file = AGENT_DIR / ".env"
    env_file.write_text(
        "".join(f"{key}={value}\n" for key, value in env_values.items()),
        encoding="utf-8",
    )
    token = ""

    print("\nInstallation complete. Starting the ComputeGrid GPU agent...")
    run([str(venv_python), "main.py"], cwd=AGENT_DIR)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"\nInstallation failed: {error}", file=sys.stderr)
