import mongoose from "mongoose";

const JobSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    gpu: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GPU",
    },
    preferredGpu: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GPU",
    },
    dockerImage: {
      type: String,
      required: true,
    },
    command: {
      type: String,
      required: true,
    },
    vramRequired: {
      type: Number, // GB
      required: true,
    },
    status: {
      type: String,
      enum: [
        "queued",
        "running",
        "saving_checkpoint",
        "migrating",
        "resumed",
        "completed",
        "failed",
      ],
      default: "queued",
    },
    priority: {
      type: Number,
      default: 0,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    leaseExpiresAt: {
      type: Date,
    },
    claimedByAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GPU",
    },
    logs: {
      type: [String],
      default: [],
    },
    progress: {
      step: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      message: { type: String, default: "" },
      updatedAt: { type: Date },
    },
    startedAt: {
      type: Date,
    },
    finishedAt: {
      type: Date,
    },
    resultUrl: {
      type: String,
    },
    billingCost: {
      type: Number,
      default: 0,
    },
    env: {
      type: Map,
      of: String,
      default: {},
    },
    // --- Module 4: Script Upload Fields ---
    scriptName: {
      type: String,
      default: "",
    },
    scriptContent: {
      type: String,
      select: false,
    },
    inputObjectKey: {
      type: String,
      default: "",
    },
    outputObjectKey: {
      type: String,
      default: "",
    },
    outputReady: {
      type: Boolean,
      default: false,
    },
    // --- Module 8: Checkpoint & Reclaim Fields ---
    reclaimed: {
      type: Boolean,
      default: false,
    },
    checkpointData: {
      objectKey: { type: String, default: "" },
      sequence: { type: Number, default: 0 },
      step: { type: Number, default: 0 },
      totalSteps: { type: Number, default: 0 },
      stateUrl: { type: String, default: "" },
      savedAt: { type: Date },
    },
    migrationHistory: [
      {
        fromGpu: { type: mongoose.Schema.Types.ObjectId, ref: "GPU" },
        toGpu: { type: mongoose.Schema.Types.ObjectId, ref: "GPU" },
        reclaimedAt: { type: Date, default: Date.now },
        step: { type: Number, default: 0 },
        reason: { type: String, default: "Host Reclaim" },
      },
    ],
  },
  { timestamps: true }
);

JobSchema.index({ status: 1, priority: -1, createdAt: 1 });
JobSchema.index({ status: 1, leaseExpiresAt: 1 });
const Job = mongoose.model("Job", JobSchema);
export default Job;