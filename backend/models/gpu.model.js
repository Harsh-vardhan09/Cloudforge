import mongoose from "mongoose";

const GPUSchema = new mongoose.Schema(
  {
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    model: {
      type: String,
      required: true,
    },
    vram: {
      type: Number, // GB
      required: true,
    },
    status: {
      type: String,
      enum: ["available", "busy", "offline"],
      default: "available",
    },
    ipAddress: {
      type: String,
    },
    agentPort: {
      type: Number,
      default: 7000,
    },
    maxConcurrentJobs: {
      type: Number,
      default: 1,
      min: 1,
    },
    acceptingJobs: {
      type: Boolean,
      default: true,
    },
    activeJobs: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    metrics: {
      gpu_util: { type: Number, default: 0 },
      mem_util: { type: Number, default: 0 },
      mem_used_mb: { type: Number, default: 0 },
      temperature: { type: Number, default: 0 },
    },
    pricePerHour: {
      type: Number,
      default: 0.5, // USD per hour
    },
    maxVram: {
      type: Number, // Host set limit
    },
  },
  { timestamps: true }
);

const GPU = mongoose.model("GPU", GPUSchema);
export default GPU;