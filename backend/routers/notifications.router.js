import express from "express";
import authentication from "../middlewares/auth.js";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notifications.controller.js";

const notificationsRouter = express.Router();

notificationsRouter.get("/", authentication, getNotifications);
notificationsRouter.patch("/read-all", authentication, markAllNotificationsRead);
notificationsRouter.patch("/:id/read", authentication, markNotificationRead);

export default notificationsRouter;
