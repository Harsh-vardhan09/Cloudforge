import GPU from "../models/gpu.model.js";
import {
  describeDisallowedAgentIp,
  isAllowedAgentPort,
  normalizeIp,
} from "../utils/network.js";
import { emitGpuTelemetry } from "../utils/socket.js";

// The marketplace listings are unauthenticated, so they expose only what the
// storefront renders. Notably excludes ipAddress, agentPort and the host's email.
const PUBLIC_GPU_FIELDS = "model vram status pricePerHour host";
const METRIC_RANGES = {
  gpu_util: [0, 100],
  mem_util: [0, 100],
  mem_used_mb: [0, Number.MAX_SAFE_INTEGER],
  mem_total_mb: [0, Number.MAX_SAFE_INTEGER],
  temperature: [0, 150],
  gpu_temp: [0, 150],
  gpu_mem_used_mb: [0, Number.MAX_SAFE_INTEGER],
  gpu_mem_total_mb: [0, Number.MAX_SAFE_INTEGER],
  power_watts: [0, 5000],
  gpu_power_w: [0, 5000],
  gpu_fan_pct: [0, 100],
  cpu_pct: [0, 100],
  cpu_temp: [0, 150],
  ram_pct: [0, 100],
  ram_used_mb: [0, Number.MAX_SAFE_INTEGER],
  ram_total_mb: [0, Number.MAX_SAFE_INTEGER],
  uptime_seconds: [0, Number.MAX_SAFE_INTEGER],
  disk_used_pct: [0, 100],
  disk_used_gb: [0, Number.MAX_SAFE_INTEGER],
  disk_total_gb: [0, Number.MAX_SAFE_INTEGER],
  net_sent_mb: [0, Number.MAX_SAFE_INTEGER],
  net_recv_mb: [0, Number.MAX_SAFE_INTEGER],
};
const previousSafetyByGpu = new Map();

const normalizeMetrics = (metrics) =>
  Object.fromEntries(
    Object.entries(METRIC_RANGES).flatMap(([key, [min, max]]) => {
      const value = metrics[key];
      return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
        ? [[key, value]]
        : [];
    })
  );

const assessSafety = (metrics) => {
  const alerts = [];
  let level = "ok";
  const warn = (message, critical = false) => {
    alerts.push(message);
    if (critical) level = "critical";
    else if (level === "ok") level = "warning";
  };

  const gpuTemp = metrics.gpu_temp ?? metrics.temperature;
  if (gpuTemp >= 92) warn(`GPU temperature is critical (${gpuTemp}°C).`, true);
  else if (gpuTemp >= 80) warn(`GPU temperature is high (${gpuTemp}°C).`);
  if (metrics.cpu_temp >= 95) warn(`CPU temperature is critical (${metrics.cpu_temp}°C).`, true);
  else if (metrics.cpu_temp >= 85) warn(`CPU temperature is high (${metrics.cpu_temp}°C).`);
  const gpuPower = metrics.gpu_power_w ?? metrics.power_watts;
  if (gpuPower >= 350) warn(`GPU power draw is high (${Math.round(gpuPower)} W).`);
  if (metrics.ram_pct >= 90) warn(`System memory usage is high (${Math.round(metrics.ram_pct)}%).`);

  return { level, alerts };
};

// POST /api/gpu/register — host agent calls this on startup
export const Gpuregister = async (req, res, next) => {
  const { vram, model, ipAddress, agentPort, pricePerHour, maxConcurrentJobs } = req.body;
  if (vram === undefined || model === undefined) {
    return res.status(400).json({ message: "GPU model and VRAM are required" });
  }
  try {
    const sanitizedIp = normalizeIp(ipAddress || req.ip);
    const ipProblem = describeDisallowedAgentIp(sanitizedIp);
    if (ipProblem) {
      return res.status(400).json({ message: `GPU agent address ${ipProblem}` });
    }
    if (agentPort !== undefined && !isAllowedAgentPort(agentPort)) {
      return res.status(400).json({ message: "GPU agent port must be between 1024 and 65535" });
    }

    const gpu = await GPU.findOneAndUpdate(
      { host: req.user.id },
      {
        vram: parseFloat(vram),
        model,
        ipAddress: sanitizedIp,
        agentPort: agentPort || 7000,
        maxConcurrentJobs: Math.max(1, parseInt(maxConcurrentJobs, 10) || 1),
        pricePerHour: pricePerHour ? parseFloat(pricePerHour) : 0.5,
        acceptingJobs: true,
        status: "available",
        lastSeen: new Date(),
      },
      { new: true, upsert: true }
    );
    return res.status(200).json({ message: "GPU registered successfully", gpu });
  } catch (error) {
    next(error);
  }
};
// GET /api/gpu/gpus — list all GPUs (with optional filters)
export const getALLGpu = async (req, res, next) => {
  try {
    const { status, minVram } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (minVram) filter.vram = { $gte: parseFloat(minVram) };
    const gpus = await GPU.find(filter)
      .select(PUBLIC_GPU_FIELDS)
      .populate("host", "name")
      .sort({ status: 1, createdAt: -1 });
    res.json(gpus);
  } catch (error) {
    next(error);
  }
};
// GET /api/gpu/available — available GPUs for job scheduling
export const getAvailableGpus = async (req, res, next) => {
  try {
    const { vram } = req.query;
    const filter = { status: "available" };
    if (vram) filter.vram = { $gte: parseFloat(vram) };
    const gpus = await GPU.find(filter)
      .select(PUBLIC_GPU_FIELDS)
      .populate("host", "name")
      .sort({ vram: -1 });
    res.json(gpus);
  } catch (error) {
    next(error);
  }
};
// GET /api/gpu/my — host sees their own registered GPU
export const getMyGpu = async (req, res, next) => {
  try {
    const gpu = await GPU.findOne({ host: req.user.id });
    if (!gpu) return res.status(404).json({ message: "No GPU registered for this account" });
    res.json(gpu);
  } catch (error) {
    next(error);
  }
};
// PATCH /api/gpu/heartbeat — agent sends health snapshots every 15s
export const heartbeat = async (req, res, next) => {
  try {
    const { metrics, ipAddress, paused } = req.body;
    if (
      metrics !== undefined &&
      (metrics === null || typeof metrics !== "object" || Array.isArray(metrics))
    ) {
      return res.status(400).json({ message: "Metrics must be an object" });
    }

    const now = new Date();
    const fields = {
      lastSeen: { $literal: now },
      acceptingJobs: paused === true ? false : true,
      status: {
        $cond: [
          { $gt: [{ $ifNull: ["$activeJobs", 0] }, 0] },
          "busy",
          paused === true ? "offline" : "available",
        ],
      },
    };
    const normalizedMetrics = metrics ? normalizeMetrics(metrics) : {};
    if (Object.keys(normalizedMetrics).length > 0) {
      fields.metrics = { $literal: { ...normalizedMetrics, updatedAt: now } };
    }
    if (ipAddress !== undefined) {
      const sanitizedIp = normalizeIp(ipAddress);
      const ipProblem = describeDisallowedAgentIp(sanitizedIp);
      if (ipProblem) {
        return res.status(400).json({ message: `GPU agent address ${ipProblem}` });
      }
      fields.ipAddress = { $literal: sanitizedIp };
    }

    const gpu = await GPU.findOneAndUpdate(
      { host: req.user.id },
      [{ $set: fields }],
      { new: true }
    );
    if (!gpu) return res.status(404).json({ message: "GPU not found for this host" });

    if (Object.keys(normalizedMetrics).length > 0) {
      const safety = assessSafety(normalizedMetrics);
      const gpuId = gpu._id.toString();
      const safetySignature = safety.level === "ok"
        ? "ok"
        : `${safety.level}:${safety.alerts.map((message) => message.replace(/\s*\(.*\)$/, "")).join("|")}`;
      const previousSignature = previousSafetyByGpu.get(gpuId);
      previousSafetyByGpu.set(gpuId, safetySignature);

      emitGpuTelemetry(
        req.user.id,
        {
          gpuId,
          ...normalizedMetrics,
          gpu_temp: normalizedMetrics.gpu_temp ?? normalizedMetrics.temperature,
          gpu_mem_used_mb: normalizedMetrics.gpu_mem_used_mb ?? normalizedMetrics.mem_used_mb,
          gpu_mem_total_mb: normalizedMetrics.gpu_mem_total_mb ?? normalizedMetrics.mem_total_mb,
          gpu_power_w: normalizedMetrics.gpu_power_w ?? normalizedMetrics.power_watts,
          safety,
          timestamp: now,
        },
        safety.level !== "ok" && safetySignature !== previousSignature
          ? { gpuId, ...safety, timestamp: now }
          : null
      );
    }

    res.json({ message: "Heartbeat received", lastSeen: gpu.lastSeen });
  } catch (error) {
    next(error);
  }
};
// PATCH /api/gpu/update-settings — host updates their GPU settings (like price)
export const updateSettings = async (req, res, next) => {
  try {
    const { pricePerHour, maxVram } = req.body;
    
    const update = {};
    if (pricePerHour !== undefined) update.pricePerHour = parseFloat(pricePerHour);
    if (maxVram !== undefined) update.maxVram = parseFloat(maxVram);

    const gpu = await GPU.findOneAndUpdate(
      { host: req.user.id },
      { $set: update },
      { new: true }
    );
    
    if (!gpu) return res.status(404).json({ message: "No GPU registered for this account" });
    
    res.json({ message: "Pricing updated successfully", gpu });
  } catch (error) {
    next(error);
  }
};

export const setOffline = async (req, res, next) => {
  try {
    await GPU.findOneAndUpdate({ host: req.user.id }, { status: "offline" });
    res.json({ message: "GPU marked offline" });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/gpu/:id/offline — mark GPU as offline
