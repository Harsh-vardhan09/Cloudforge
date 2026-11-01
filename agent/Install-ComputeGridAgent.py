import re
import shutil
import subprocess
import sys
import venv
from pathlib import Path
from urllib.parse import urlparse


AGENT_DIR = Path(__file__).resolve().parent / "agent"


def fail(message: str) -> None:
    raise RuntimeError(message)


def run(command: list[str], *, cwd: Path | None = None) -> None:
    subprocess.run(command, cwd=cwd, check=True)


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

    env_values = {
        "BACKEND_URL": backend_url,
        "AGENT_JWT_TOKEN": token,
        "AGENT_PORT": "7000",
        "PRICE_PER_HOUR": "0.5",
        "HEARTBEAT_INTERVAL": "30",
        "MAX_CONCURRENT_JOBS": "2",
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
