import "./loadEnv.js"; // must stay first: populates process.env for every import below
import express from "express";

process.on('uncaughtException', (err) => { console.error('CRITICAL UNCAUGHT EXCEPTION:', err); process.exit(1); });
process.on('unhandledRejection', (reason, promise) => { console.error('CRITICAL UNHANDLED REJECTION:', reason); });

import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import Dbconnect from "./Dbconnect.js";
import Errorhandler from "./utils/Errorhandler.js";
import { logger } from "./utils/logger.js";
import { initSocket } from "./utils/socket.js";
import { initQueue } from "./utils/queue.js";
import Authrouter from "./routers/auth.router.js";
import gpurouter from "./routers/gpu.router.js";
import jobsRouter from "./routers/jobs.router.js";
import BillingRouter from "./routers/billing.router.js";
import ApiResourceRouter from "./routers/apiResource.router.js";
import aiRouter from "./routers/ai.router.js";
import notificationsRouter from "./routers/notifications.router.js";
import { startLeaseMonitor } from "./controllers/jobs.controller.js";

const app = express();
const httpServer = createServer(app);

// --- Security & Parsing Middleware ---
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP for dev; enable in prod
    crossOriginEmbedderPolicy: false,
  })
);
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// --- Request Logger ---
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.url}`);
  next();
});

// --- Routes ---
app.use("/api/auth", Authrouter);
app.use("/api/gpu", gpurouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/billing", BillingRouter);
app.use("/api/resource", ApiResourceRouter);
app.use("/api/ai", aiRouter);
app.use("/api/notifications", notificationsRouter);

app.get("/health", (_req, res) =>
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date() })
);

// --- Error Handler ---
app.use(Errorhandler);

// --- Initialize and Start ---
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, async () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);
  await Dbconnect();
  startLeaseMonitor();

  // Initialize Socket.IO
  initSocket(httpServer);
  logger.info("Socket.IO attached");

  // Initialize BullMQ (optional — degrades gracefully without Redis)
  await initQueue();
});

export default app;