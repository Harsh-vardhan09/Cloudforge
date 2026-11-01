import express from "express";
import authentication from "../middlewares/auth.js";
import { register, login, getMe } from "../controllers/auth.controller.js";

const Authrouter = express.Router();

// POST /api/auth/register
Authrouter.post("/register", register);

// POST /api/auth/login
Authrouter.post("/login", login);

// GET /api/auth/me  — requires auth
Authrouter.get("/me", authentication, getMe);

export default Authrouter;
