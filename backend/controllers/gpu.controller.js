import GPU from "../models/gpu.model.js";
import {
  describeDisallowedAgentIp,
  isAllowedAgentPort,
  normalizeIp,
} from "../utils/network.js";

// The marketplace listings are unauthenticated, so they expose only what the
// storefront renders. Notably excludes ipAddress, agentPort and the host's email.
const PUBLIC_GPU_FIELDS = "model vram status pricePerHour host";

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
// PATCH /api/gpu/heartbeat — agent calls every 30s to stay "online"
export const heartbeat = async (req, res, next) => {
  try {
    const { metrics, ipAddress, paused } = req.body;
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
    if (metrics) fields.metrics = { $literal: metrics };
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
