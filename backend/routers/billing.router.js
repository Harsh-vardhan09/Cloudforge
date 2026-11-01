import express from "express";
import authentication from "../middlewares/auth.js";
import { createOrder, verifyPayment, createDemoTopUp, getBillingHistory } from "../controllers/billing.controller.js";

const BillingRouter = express.Router();

// All routes require authentication
BillingRouter.use(authentication);

BillingRouter.post("/order", createOrder);
BillingRouter.post("/verify", verifyPayment);
BillingRouter.post("/demo-topup", createDemoTopUp);
BillingRouter.get("/history", getBillingHistory);

export default BillingRouter;
