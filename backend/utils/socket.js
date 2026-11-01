import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import Job from "../models/job.model.js";
import { logger } from "./logger.js";

let _io = null;

/**
 * Initialize Socket.IO on the HTTP server.
 * Call this once from server.js.
 */
export const initSocket = (httpServer) => {
  _io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  _io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    try {
      socket.data.userId = jwt.verify(token, process.env.JWT_SECRET).id;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  _io.on("connection", (socket) => {
    logger.debug(`Socket connected: ${socket.id}`);
    socket.join(`user:${socket.data.userId}`);

    // Allow clients to subscribe to a specific job room
    socket.on("subscribe:job", async (jobId) => {
      if (typeof jobId !== "string") return;
      try {
        const job = await Job.exists({ _id: jobId, user: socket.data.userId });
        if (job) {
          socket.join(`job:${jobId}`);
          logger.debug(`Socket ${socket.id} subscribed to job:${jobId}`);
        }
      } catch (error) {
        logger.error(`Socket job subscription failed: ${error.message}`);
      }
    });

    socket.on("unsubscribe:job", (jobId) => {
      socket.leave(`job:${jobId}`);
    });

    socket.on("disconnect", () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  logger.info("Socket.IO initialized");
  return _io;
};

/** Get the Socket.IO server instance */
export const getIo = () => _io;

/** Emit a log line for a specific job */
export const emitJobLog = (jobId, line) => {
  _io?.to(`job:${jobId}`).emit("job:log", { jobId, line });
};

/** Emit job completion event */
export const emitJobDone = (jobId, status, userId) => {
  _io?.to(`job:${jobId}`).emit("job:done", { jobId, status });
  if (userId) _io?.to(`user:${userId}`).emit("job:status", { jobId, status });
};

/** Emit GPU status change */
export const emitGpuStatus = (gpuId, status) => {
  _io?.emit("gpu:status", { gpuId, status });
};

export const emitUserNotification = (userId, notification) => {
  _io?.to(`user:${userId}`).emit("notification:new", notification);
};

export const emitUserJobProgress = (userId, progress) => {
  _io?.to(`user:${userId}`).emit("job:progress", progress);
};

export const emitUserJobStatus = (userId, jobId, status) => {
  _io?.to(`user:${userId}`).emit("job:status", { jobId, status });
};

/** Emit job migration lifecycle event (Node A -> Object Storage -> Node B) */
export const emitJobMigration = (jobId, migrationData) => {
  _io?.emit("job:migration", { jobId, ...migrationData, timestamp: new Date() });
  if (jobId) {
    _io?.to(`job:${jobId}`).emit("job:migration", { jobId, ...migrationData, timestamp: new Date() });
  }
};

