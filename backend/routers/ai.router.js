import express from "express";
import authentication from "../middlewares/auth.js";
import { aiJobAssistant, aiExplainFailure } from "../controllers/ai.controller.js";

const aiRouter = express.Router();

// AI Job Assistant before submit (requires user authentication)
aiRouter.post("/assistant", authentication, aiJobAssistant);

// AI Failure Explainer after crash/failure (requires user authentication)
aiRouter.post("/explain-failure", authentication, aiExplainFailure);

export default aiRouter;
