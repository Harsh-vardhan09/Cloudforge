# Job file storage

Job scripts and outputs are stored in a private S3-compatible bucket. The backend signs short-lived upload and download requests; the browser uploads scripts directly to S3, and GPU agents download them directly from S3. GPU agents do not need bucket credentials. Script submissions fail with a clear error if S3 is unavailable; script contents are not stored in MongoDB as a fallback.

## AWS S3 setup

1. Create a private S3 bucket and note its exact AWS region.
2. Give the backend AWS identity (preferably an IAM role) this least-privilege policy, replacing the bucket name:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::your-bucket/jobs/*"
    }
  ]
}
```

3. Configure the backend environment in the repository-root `.env`:

```dotenv
OBJECT_STORAGE_BUCKET=your-bucket
OBJECT_STORAGE_REGION=your-bucket-region
OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_ACCESS_KEY_ID=
OBJECT_STORAGE_SECRET_ACCESS_KEY=
```

For AWS, leave `OBJECT_STORAGE_ENDPOINT` empty and use the normal AWS credential provider chain (an IAM role is recommended). If using IAM access keys instead, set both access-key variables and keep them out of source control. For MinIO or another S3-compatible service, set its endpoint URL and credentials. Restart the backend after changing environment variables.

The app does not need `s3:ListBucket`: it issues presigned requests for known object keys and verifies uploaded scripts with `HeadObject` (authorized by `s3:GetObject`).

4. Configure the bucket's **CORS** to allow the exact origin(s) where the frontend runs. For local Vite development, allow `http://localhost:5173` and/or `http://127.0.0.1:5173`; for production, allow your deployed frontend origin. Example:

```json
[
  {
    "AllowedHeaders": ["Content-Type"],
    "AllowedMethods": ["POST", "GET", "PUT", "HEAD"],
    "AllowedOrigins": ["http://localhost:5173", "http://127.0.0.1:5173"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Setting CORS is a one-time bucket administration step and requires `s3:PutBucketCORS` on the bucket. Checking the current CORS configuration requires `s3:GetBucketCORS`. These are **not** needed by the running app; an administrator can configure the CORS JSON in the S3 console. The bucket must exist before uploads. Keep S3 Block Public Access enabled; the application uses presigned URLs and does not require public bucket access. The backend limits script uploads to 50 MB and job output archives to 2 GB. Presigned requests expire after 15 minutes.

With the backend dependencies installed and credentials available, `cd backend && npm run create-bucket` can create a private AWS bucket, configure local CORS origins, and write its name to the local `.env`. Review the generated bucket name and region before deploying.

The upload flow requests a presigned POST, sends the script from the browser to S3, and submits only the S3 object key to the backend. The backend verifies the uploaded object's size and content type before queueing. The GPU agent receives a presigned download URL. If storage is missing or the upload/download fails, the job is rejected or returned to the queue instead of silently storing or using a database copy.

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
