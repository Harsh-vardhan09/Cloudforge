import express from "express";
import authentication from "../middlewares/auth.js";
import {
  postJob,
  getHostActiveJob,
  getJobs,
  getJobById,
  streamLogs,
  pushLog,
  completeJob,
  cancelJob,
  getStats,
  reclaimJob,
  saveCheckpoint,
  claimJob,
  renewJobLease,
  createInputUploadUrl,
  createOutputUploadUrl,
  createCheckpointUploadUrl,
  getJobResultUrl,
  simulateMigration,
  getJobMigration,
} from "../controllers/jobs.controller.js";

const jobsRouter = express.Router();

// User routes (require auth)
jobsRouter.get("/host/active", authentication, getHostActiveJob); // Host sees active job
jobsRouter.post("/reclaim", authentication, reclaimJob);         // Host reclaims active GPU
jobsRouter.post("/:id/reclaim", authentication, reclaimJob);     // Reclaim specific job
jobsRouter.post("/simulate-migration", authentication, simulateMigration); // Demo migration simulation
jobsRouter.post("/:id/simulate-migration", authentication, simulateMigration);
jobsRouter.get("/:id/migration", authentication, getJobMigration); // Get migration details & topology
jobsRouter.post("/claim", authentication, claimJob);             // GPU agent claims queued work
jobsRouter.patch("/:id/lease", authentication, renewJobLease);  // GPU agent renews its job lease
jobsRouter.post("/uploads/presign", authentication, createInputUploadUrl);
jobsRouter.post("/:id/output-upload-url", authentication, createOutputUploadUrl);
jobsRouter.post("/:id/checkpoint-upload-url", authentication, createCheckpointUploadUrl);
jobsRouter.get("/:id/result", authentication, getJobResultUrl);
jobsRouter.post("/", authentication, postJob);              // Submit job
jobsRouter.get("/stats", authentication, getStats);         // Usage stats
jobsRouter.get("/", authentication, getJobs);               // List user's jobs
jobsRouter.get("/:id", authentication, getJobById);         // Job detail
jobsRouter.get("/:id/stream", streamLogs);                  // SSE live logs (no auth — token in query)
jobsRouter.delete("/:id", authentication, cancelJob);       // Cancel queued job

// Agent callbacks require the host agent's authenticated account token
jobsRouter.post("/:id/logs", authentication, pushLog);       // Agent pushes log lines
jobsRouter.post("/:id/checkpoint", authentication, saveCheckpoint); // Agent confirms a checkpoint upload
jobsRouter.post("/:id/complete", authentication, completeJob); // Agent marks job done

export default jobsRouter;
