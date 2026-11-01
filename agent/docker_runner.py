"""
Docker container runner for GPU job execution.
Pulls the requested image, runs it with --gpus all (NVIDIA CTK),
streams stdout logs to the backend, then reports completion.
"""
import docker
import requests
import logging
import json
import os
import shutil
import stat
import tempfile
import threading
import time
import zipfile
from typing import Optional

from gpu_info import get_gpu_info

logger = logging.getLogger(__name__)

_client: Optional[docker.DockerClient] = None
_probe_client: Optional[docker.DockerClient] = None

# The health probe runs in the same loop that renews job leases, so it must fail
# fast. The default 60s client timeout would stall that loop long enough for a
# 30s lease to expire, killing a perfectly healthy running job.
DOCKER_PROBE_TIMEOUT_SECONDS = 5


def get_docker_client() -> docker.DockerClient:
    global _client
    if _client is None:
        _client = docker.from_env()
    return _client


def docker_available() -> tuple[bool, str]:
    """Is the host's Docker daemon reachable right now?

    Used to gate job claiming: an agent that cannot run containers must not take
    work off the queue, or it will burn a renter's attempts and fail their job.
    """
    global _client, _probe_client
    try:
        if _probe_client is None:
            _probe_client = docker.from_env(timeout=DOCKER_PROBE_TIMEOUT_SECONDS)
        _probe_client.ping()
        return True, ""
    except Exception as error:
        # Drop both clients so the next probe reconnects to a restarted daemon.
        _probe_client = None
        _client = None
        return False, str(error)


def push_log(
    backend_url: str,
    job_id: str,
    line: str,
    token: str = "",
    attempt: Optional[int] = None,
) -> None:
    """Push a single log line to the backend (best-effort)."""
    try:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        payload = {"line": line}
        if attempt is not None:
            payload["attempt"] = attempt
        requests.post(
            f"{backend_url}/api/jobs/{job_id}/logs",
            json=payload,
            headers=headers,
            timeout=5,
        )
    except Exception:
        pass  # Log push failure is non-critical


def complete_job(
    backend_url: str,
    job_id: str,
    status: str,
    output_uploaded: bool = False,
    token: str = "",
    attempt: Optional[int] = None,
) -> None:
    """Notify the backend that the job has finished."""
    try:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        payload = {"status": status, "outputUploaded": output_uploaded}
        if attempt is not None:
            payload["attempt"] = attempt
        resp = requests.post(
            f"{backend_url}/api/jobs/{job_id}/complete",
            json=payload,
            headers=headers,
            timeout=15,
        )
        logger.info(f"Job {job_id} completion notified: {resp.status_code}")
    except Exception as e:
        logger.error(f"Failed to notify backend of job completion: {e}")


def _checkpoint_files(checkpoint_dir: str) -> list[str]:
    files = []
    for root, directories, filenames in os.walk(checkpoint_dir, followlinks=False):
        directories[:] = [
            name for name in directories
            if not os.path.islink(os.path.join(root, name))
        ]
        files.extend(
            os.path.join(root, name)
            for name in filenames
            if os.path.isfile(os.path.join(root, name))
            and not os.path.islink(os.path.join(root, name))
        )
    return files


def _checkpoint_progress(checkpoint_dir: str) -> tuple[int, int]:
    try:
        with open(os.path.join(checkpoint_dir, "checkpoint.json"), "r", encoding="utf-8") as metadata_file:
            metadata = json.load(metadata_file)
        step = metadata.get("step", 0)
        total_steps = metadata.get("totalSteps", 0)
        if isinstance(step, int) and step >= 0 and isinstance(total_steps, int) and total_steps >= 0:
            return step, total_steps
    except (OSError, ValueError, TypeError):
        pass
    return 0, 0


def _upload_checkpoint(
    job_id: str,
    attempt: int,
    sequence: int,
    checkpoint_dir: str,
    job_dir: str,
    backend_url: str,
    token: str,
    report_log,
) -> bool:
    files = _checkpoint_files(checkpoint_dir)
    if not files:
        return False

    archive_path = os.path.join(job_dir, f"checkpoint-{sequence}.zip")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in files:
                archive.write(path, os.path.relpath(path, checkpoint_dir))

        archive_size = os.path.getsize(archive_path)
        if archive_size > 2 * 1024 * 1024 * 1024:
            raise ValueError("Checkpoint archive exceeds the 2 GB storage limit")

        step, total_steps = _checkpoint_progress(checkpoint_dir)
        presign = requests.post(
            f"{backend_url}/api/jobs/{job_id}/checkpoint-upload-url",
            json={"attempt": attempt, "sequence": sequence, "size": archive_size},
            headers=headers,
            timeout=15,
        )
        presign.raise_for_status()
        upload = presign.json()
        with open(archive_path, "rb") as archive_file:
            response = requests.put(
                upload["uploadUrl"],
                data=archive_file,
                headers={
                    "Content-Type": upload["contentType"],
                    "Content-Length": str(archive_size),
                },
                timeout=(10, 600),
            )
        response.raise_for_status()

        saved = requests.post(
            f"{backend_url}/api/jobs/{job_id}/checkpoint",
            json={
                "attempt": attempt,
                "sequence": sequence,
                "step": step,
                "totalSteps": total_steps,
            },
            headers=headers,
            timeout=15,
        )
        saved.raise_for_status()
        report_log(f"[agent] 💾 Checkpoint {sequence} uploaded (step {step}{f'/{total_steps}' if total_steps else ''})")
        return True
    finally:
        if os.path.exists(archive_path):
            os.remove(archive_path)


def _restore_checkpoint(download_url: str, checkpoint_dir: str) -> None:
    with requests.get(download_url, stream=True, timeout=(10, 120)) as response:
        response.raise_for_status()
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as archive_file:
            archive_path = archive_file.name
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    archive_file.write(chunk)

    try:
        destination = os.path.realpath(checkpoint_dir)
        with zipfile.ZipFile(archive_path) as archive:
            for member in archive.infolist():
                name = member.filename.replace("\\", "/")
                if name.startswith("/") or any(part == ".." for part in name.split("/")):
                    raise ValueError("Checkpoint archive contains an unsafe path")
                if stat.S_ISLNK(member.external_attr >> 16):
                    raise ValueError("Checkpoint archive contains a symbolic link")
                target = os.path.realpath(os.path.join(destination, *name.split("/")))
                if os.path.commonpath([destination, target]) != destination:
                    raise ValueError("Checkpoint archive contains an unsafe path")
                if member.is_dir():
                    os.makedirs(target, exist_ok=True)
                    continue
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with archive.open(member) as source, open(target, "wb") as output:
                    shutil.copyfileobj(source, output)
    finally:
        os.remove(archive_path)


def run_docker_job(
    job_id: str,
    docker_image: str,
    command: str,
    backend_url: str,
    env: dict = {},
    active_jobs: dict = {},
    token: str = "",
    script_name: str = "",
    input_download_url: str = "",
    script_content: str = "",
    attempt: Optional[int] = None,
    checkpoint_download_url: str = "",
    checkpoint_sequence: int = 0,
    checkpoint_step: int = 0,
    checkpoint_total_steps: int = 0,
    active_attempts: Optional[dict] = None,
    abandoned_attempts: Optional[set] = None,
    reclaiming_jobs: Optional[set] = None,
    job_finished_event: Optional[threading.Event] = None,
) -> None:
    """
    Main job runner (runs in a background thread/task):
    1. Pull Docker image
    2. Mount uploaded script into /workspace if provided (Module 4)
    3. Run container with GPU access via NVIDIA Container Toolkit
    4. Stream logs to backend via POST /api/jobs/:id/logs
    5. Report completion via POST /api/jobs/:id/complete
    6. Remove container
    """
    container = None
    job_dir = None
    checkpoint_stop_event = threading.Event()
    checkpoint_thread = None
    report_log = lambda line: push_log(backend_url, job_id, line, token, attempt)
    def report_complete(status, output_uploaded=False):
        if (
            (abandoned_attempts is None or job_id not in abandoned_attempts)
            and (reclaiming_jobs is None or job_id not in reclaiming_jobs)
        ):
            complete_job(
                backend_url,
                job_id,
                status,
                output_uploaded=output_uploaded,
                token=token,
                attempt=attempt,
            )

    try:
        client = get_docker_client()
        if job_id not in active_jobs:
            return
        if attempt is None:
            job_dir = os.path.join(tempfile.gettempdir(), "gpushare_jobs", job_id)
        else:
            job_dir = os.path.join(
                tempfile.gettempdir(), "gpushare_jobs", job_id, f"attempt-{attempt}"
            )
        output_dir = os.path.join(job_dir, "output")
        checkpoint_dir = os.path.join(job_dir, "checkpoints")
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(checkpoint_dir, exist_ok=True)

        if input_download_url:
            if not script_name or os.path.basename(script_name) != script_name:
                raise ValueError("Invalid uploaded script filename")
            script_path = os.path.join(job_dir, script_name)
            with requests.get(input_download_url, stream=True, timeout=(10, 120)) as response:
                response.raise_for_status()
                with open(script_path, "wb") as script_file:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            script_file.write(chunk)
            report_log(f"[agent] 📥 Downloaded script into /workspace/{script_name}")
        elif script_name and script_content:
            script_path = os.path.join(job_dir, script_name)
            if os.path.basename(script_name) != script_name:
                raise ValueError("Invalid uploaded script filename")
            with open(script_path, "w", encoding="utf-8") as script_file:
                script_file.write(script_content)

        if checkpoint_download_url:
            _restore_checkpoint(checkpoint_download_url, checkpoint_dir)
            report_log(f"[agent] 📥 Restored checkpoint snapshot {checkpoint_sequence}")

        report_log(f"[agent] 📦 Pulling image: {docker_image}")

        # Pull image (may take a while for large images)
        try:
            client.images.pull(docker_image)
            report_log(f"[agent] ✅ Image pulled: {docker_image}")
        except docker.errors.APIError as e:
            report_log(f"[agent] ❌ Failed to pull image: {e}")
            report_complete("failed")
            return

        if job_id not in active_jobs:
            return
        report_log("[agent] 🚀 Starting container...")

        # Request GPU access via NVIDIA Container Toolkit, but only when this host
        # actually has a GPU. Asking for one on a CPU-only machine makes
        # containers.run() fail outright, which would fail every job.
        device_requests = []
        if get_gpu_info():
            device_requests = [
                docker.types.DeviceRequest(count=-1, capabilities=[["gpu"]])
            ]
        else:
            report_log("[agent] ℹ️  No NVIDIA GPU detected — running on CPU")

        # Prepare environment variables
        container_env = {k: str(v) for k, v in env.items()}
        container_env["JOB_ID"] = job_id
        container_env["OUTPUT_DIR"] = "/workspace/output"
        container_env["CHECKPOINT_DIR"] = "/workspace/checkpoints"
        if checkpoint_download_url:
            container_env["RESUME_FROM_CHECKPOINT"] = "true"
            container_env["CHECKPOINT_STEP"] = str(checkpoint_step)
            container_env["CHECKPOINT_TOTAL_STEPS"] = str(checkpoint_total_steps)

        # Run container
        run_kwargs = dict(
            command=command,
            detach=True,
            environment=container_env,
            volumes={job_dir: {"bind": "/workspace", "mode": "rw"}},
            working_dir="/workspace",
            mem_limit="4g",           # Lowered for compatibility
            memswap_limit="4g",       # Lowered for compatibility
            nano_cpus=4_000_000_000,  # 4 CPU cores
            shm_size="1g",
            network_mode="bridge",
            labels={"gpushare.job_id": job_id},
            auto_remove=False,
        )

        try:
            container = client.containers.run(
                docker_image, device_requests=device_requests, **run_kwargs
            )
        except docker.errors.APIError as error:
            if not device_requests:
                raise
            # The host has a GPU but Docker cannot pass it through (NVIDIA Container
            # Toolkit missing or misconfigured). Run on CPU instead of failing the job.
            report_log(f"[agent] ⚠️ GPU passthrough unavailable ({error}); running on CPU")
            container = client.containers.run(
                docker_image, device_requests=[], **run_kwargs
            )

        active_jobs[job_id] = container.id
        report_log(f"[agent] 🐳 Container started: {container.short_id}")
        if attempt is not None:
            checkpoint_interval = max(10, int(os.getenv("CHECKPOINT_INTERVAL_SECONDS", "60")))

            def checkpoint_loop():
                sequence = checkpoint_sequence
                while not checkpoint_stop_event.wait(checkpoint_interval):
                    if job_id not in active_jobs or job_id in (reclaiming_jobs or set()):
                        break
                    sequence += 1
                    try:
                        _upload_checkpoint(
                            job_id, attempt, sequence, checkpoint_dir, job_dir,
                            backend_url, token, report_log,
                        )
                    except Exception as error:
                        logger.warning(f"Checkpoint upload failed for job {job_id}: {error}")
                        report_log(f"[agent] ⚠️ Checkpoint upload failed: {error}")

            checkpoint_thread = threading.Thread(target=checkpoint_loop, daemon=True)
            checkpoint_thread.start()

        # Stream logs line by line
        for log_bytes in container.logs(stream=True, follow=True, timestamps=False):
            line = log_bytes.decode("utf-8", errors="replace").rstrip()
            if line:
                report_log(line)

            # Check if job was cancelled externally
            if job_id not in active_jobs:
                try:
                    container.kill()
                except Exception:
                    pass
                break

        # Wait and get exit code
        result = container.wait(timeout=10)
        exit_code = result.get("StatusCode", -1)

        status = "completed" if exit_code == 0 else "failed"
        
        output_uploaded = False
        if status == "completed" and attempt is not None:
            output_files = []
            for root, directories, filenames in os.walk(output_dir, followlinks=False):
                directories[:] = [
                    directory
                    for directory in directories
                    if not os.path.islink(os.path.join(root, directory))
                ]
                output_files.extend(
                    os.path.join(root, filename)
                    for filename in filenames
                    if os.path.isfile(os.path.join(root, filename))
                    and not os.path.islink(os.path.join(root, filename))
                )

            if output_files:
                try:
                    output_size = sum(os.path.getsize(path) for path in output_files)
                    if output_size > 2 * 1024 * 1024 * 1024:
                        raise ValueError("Job output exceeds the 2 GB storage limit")
                    archive_path = os.path.join(job_dir, "output.zip")
                    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
                        for output_file in output_files:
                            archive.write(output_file, os.path.relpath(output_file, output_dir))

                    archive_size = os.path.getsize(archive_path)
                    if archive_size > 2 * 1024 * 1024 * 1024:
                        raise ValueError("Job output archive exceeds the 2 GB storage limit")

                    presign_response = requests.post(
                        f"{backend_url}/api/jobs/{job_id}/output-upload-url",
                        json={"attempt": attempt, "size": archive_size},
                        headers={"Authorization": f"Bearer {token}"} if token else {},
                        timeout=15,
                    )
                    presign_response.raise_for_status()
                    upload = presign_response.json()
                    with open(archive_path, "rb") as archive_file:
                        upload_response = requests.put(
                            upload["uploadUrl"],
                            data=archive_file,
                            headers={
                                "Content-Type": upload["contentType"],
                                "Content-Length": str(archive_size),
                            },
                            timeout=(10, 600),
                        )
                    upload_response.raise_for_status()
                    output_uploaded = True
                    report_log("[agent] ✅ Job output uploaded to object storage")
                except Exception as error:
                    # Object storage being unreachable or unconfigured must not turn a
                    # successful run into a failed job. Report it and complete normally.
                    logger.warning(f"Output upload failed for job {job_id}: {error}")
                    report_log(
                        f"[agent] ⚠️ Could not upload job output ({error}); the job itself completed"
                    )
            else:
                report_log("[agent] No files found in /workspace/output; completing without an output archive")
        elif status == "completed":
            report_log("[agent] Output upload requires a scheduler job lease; no archive was uploaded")

        report_log(f"[agent] {'✅' if status == 'completed' else '❌'} Container exited with code {exit_code}")
        report_complete(status, output_uploaded)

    except docker.errors.DockerException as error:
        # Docker being unreachable is this agent's problem, not the job's. Report
        # nothing: stop renewing the lease and let the backend's sweeper requeue the
        # job on a healthy host instead of spending one of its attempts here.
        logger.error(f"Docker unavailable; releasing job {job_id} to the scheduler: {error}")
        report_log("[agent] ⚠️ Host Docker is unavailable; returning this job to the queue")
        if abandoned_attempts is not None:
            abandoned_attempts.add(job_id)

    except Exception as e:
        logger.exception(f"Unexpected error running job {job_id}: {e}")
        report_log(f"[agent] ❌ Unexpected error: {str(e)}")
        report_complete("failed")

    finally:
        checkpoint_stop_event.set()
        if checkpoint_thread:
            checkpoint_thread.join(timeout=30)
        if container:
            try:
                container.remove(force=True)
                logger.info(f"Container for job {job_id} removed")
            except Exception:
                pass
        if job_dir and os.path.isdir(job_dir):
            shutil.rmtree(job_dir, ignore_errors=True)
        active_jobs.pop(job_id, None)
        if active_attempts is not None:
            active_attempts.pop(job_id, None)
        if abandoned_attempts is not None:
            abandoned_attempts.discard(job_id)
        if reclaiming_jobs is not None:
            reclaiming_jobs.discard(job_id)
        if job_finished_event is not None:
            job_finished_event.set()


def stop_job(job_id: str, active_jobs: dict) -> bool:
    """Force-stop a running Docker container."""
    container_id = active_jobs.pop(job_id, None)
    if not container_id:
        return False
    if container_id == "claiming":
        return True
    try:
        client = get_docker_client()
        container = client.containers.get(container_id)
        container.kill()
        container.remove(force=True)
        logger.info(f"Job {job_id} container killed")
        return True
    except Exception as e:
        logger.error(f"Error stopping container for job {job_id}: {e}")
        return False


def checkpoint_and_stop_job(
    job_id: str,
    active_jobs: dict,
    attempt: int,
    active_attempts: dict,
    reclaiming_jobs: set,
    job_finished_events: dict,
) -> dict:
    container_id = active_jobs.get(job_id)
    if not container_id or active_attempts.get(job_id) != attempt:
        raise ValueError("The requested job attempt is not running on this agent")

    finished = job_finished_events.get(job_id)
    if finished is None:
        raise ValueError("The job runner is not available to stop safely")

    reclaiming_jobs.add(job_id)
    try:
        container = get_docker_client().containers.get(container_id)
        container.stop(timeout=30)
        if not finished.wait(timeout=35):
            raise TimeoutError("The job did not stop within the graceful shutdown window")
    except Exception:
        reclaiming_jobs.discard(job_id)
        raise

    logger.info(f"Job {job_id} attempt {attempt} stopped for host GPU reclaim")
    return {"stopped": True, "attempt": attempt}
