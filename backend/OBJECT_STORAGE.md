# Job file storage

Job scripts and outputs are stored in an S3-compatible bucket. The backend signs short-lived upload and download requests; the browser and GPU agents transfer files directly to the bucket. GPU agents do not need bucket credentials.

Add these backend environment variables:

```text
OBJECT_STORAGE_BUCKET=your-bucket
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_ACCESS_KEY_ID=...
OBJECT_STORAGE_SECRET_ACCESS_KEY=...
```

For AWS, omit `OBJECT_STORAGE_ENDPOINT`; the backend can use its normal AWS credential provider chain instead of access-key variables. For MinIO or another S3-compatible service, set `OBJECT_STORAGE_ENDPOINT` to its URL and provide credentials.

The bucket must already exist. Configure bucket CORS to allow the frontend origin to make `POST` uploads with the `Content-Type` header. The backend limits script uploads to 50 MB and job output archives to 2 GB. Presigned requests expire after 15 minutes.

Scripts are mounted in the container at `/workspace`. Jobs that produce files should write them under `/workspace/output` (also available as the `OUTPUT_DIR` environment variable); the agent packages that directory as a ZIP for download from the Jobs page. If that directory is empty, the job can still succeed but has no downloadable output.

## Checkpoint and resume

Checkpointing is cooperative: the platform cannot automatically serialize arbitrary Python processes, GPU memory, or model state. A workload that supports resume must periodically write all state it needs to continue under the `CHECKPOINT_DIR` environment variable (`/workspace/checkpoints`). The agent snapshots that directory every 60 seconds by default; configure `CHECKPOINT_INTERVAL_SECONDS` on the agent to change the interval (minimum 10 seconds). Write checkpoint files atomically (write a temporary file, then rename it) so an upload does not capture a partially written file.

Optionally include `checkpoint.json` in that directory with numeric `step` and `totalSteps` fields for progress display. On restart, the agent restores the latest checkpoint files into `CHECKPOINT_DIR` and sets `RESUME_FROM_CHECKPOINT=true`, `CHECKPOINT_STEP`, and `CHECKPOINT_TOTAL_STEPS`. The workload's startup command must read those files and restore its own state. Without a valid checkpoint, a host reclaim is rejected and the running job is left alone; ordinary retry after agent loss starts from the latest checkpoint that was already uploaded.

Checkpoint snapshots use the same 2 GB per-archive limit as job outputs and are stored separately for each upload sequence. Reclaim stops the job and returns it to the normal scheduler queue; it does not reserve or fabricate a destination GPU. A compatible online agent must be available for the resumed attempt.

## Job progress and notifications

The Jobs page receives live updates and also refreshes from the API periodically. To display percentage progress, have the job print one JSON progress line to stdout:

```text
GPUSHARE_PROGRESS:{"step":25,"total":100,"message":"Training"}
```

`step` and `total` must be non-negative/positive integers, and `step` cannot exceed `total`. The message is optional. The backend stores the latest progress on the job and sends it to that user's authenticated session. Terminal completion/failure, lease retries, and checkpoint resumes are also recorded in the user's notification inbox.
