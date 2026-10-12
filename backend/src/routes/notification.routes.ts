import { Router } from "express";
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearAllNotifications,
} from "../controllers/notification.controller.js";

const router = Router();

router.get("/", getNotifications);
router.put("/read-all", markAllNotificationsAsRead);
router.put("/:id/read", markNotificationAsRead);
router.delete("/clear-all", clearAllNotifications);

export default router;
