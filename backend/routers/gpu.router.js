import express from "express";
import authentication from "../middlewares/auth.js";
import {
  Gpuregister,
  getALLGpu,
  getAvailableGpus,
  getMyGpu,
  heartbeat,
  setOffline,
  updateSettings,
  receiveTelemetry,
} from "../controllers/gpu.controller.js";

const gpurouter = express.Router();

// POST /api/gpu/register — agent registers the GPU on startup
gpurouter.post("/register", authentication, Gpuregister);

// GET /api/gpu/gpus — all GPUs (marketplace)
gpurouter.get("/gpus", getALLGpu);

// GET /api/gpu/available — available GPUs with optional ?vram= filter
gpurouter.get("/available", getAvailableGpus);

// GET /api/gpu/my — host's own GPU info
gpurouter.get("/my", authentication, getMyGpu);

// PATCH /api/gpu/settings — host updates their settings
gpurouter.patch("/settings", authentication, updateSettings);

// PATCH /api/gpu/heartbeat — agent heartbeat every 30s
gpurouter.patch("/heartbeat", authentication, heartbeat);

// PATCH /api/gpu/offline — host marks GPU offline manually
gpurouter.patch("/offline", authentication, setOffline);

// POST /api/gpu/telemetry — agent streams live hardware telemetry while a job runs
gpurouter.post("/telemetry", authentication, receiveTelemetry);

export default gpurouter;