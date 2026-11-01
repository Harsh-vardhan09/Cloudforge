import { Queue, Worker } from "bullmq";
import { logger } from "./logger.js";

let connection = null;
let jobQueue = null;

/**
 * Initialize BullMQ with Redis.
 * Gracefully degrades if Redis is unavailable.
 */
export const initQueue = async () => {
  try {
    const { default: Redis } = await import("ioredis");

    connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    await connection.connect();
    await connection.ping();

    jobQueue = new Queue("gpu-jobs", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    logger.info("BullMQ job queue initialized (Redis connected)");
    return true;
  } catch (err) {
    logger.warn(`Redis unavailable — job queue disabled: ${err.message}`);
    return false;
  }
};

/**
 * Add a job to the BullMQ queue (fallback: no-op if queue is disabled).
 */
export const enqueueJob = async (jobData) => {
  if (!jobQueue) {
    logger.warn("Queue not initialized — job not enqueued");
    return null;
  }
  return jobQueue.add("dispatch", jobData);
};

export const getQueue = () => jobQueue;
export const getConnection = () => connection;
