import Notification from "../models/notification.model.js";
import { emitUserNotification } from "./socket.js";
import { logger } from "./logger.js";

export const createNotification = async ({ user, job, type, title, message }) => {
  try {
    const notification = await Notification.create({
      user,
      job,
      type,
      title,
      message,
    });
    emitUserNotification(user.toString(), notification);
    return notification;
  } catch (error) {
    logger.error(`Could not persist ${type} notification for user ${user}: ${error.message}`);
    return null;
  }
};
