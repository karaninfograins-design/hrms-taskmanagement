import { Router } from "express";
import {
  getConversations,
  createDirectConversation,
  createGroupConversation,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  searchMessages,
  uploadAttachment,
  updateGroupConversation,
  leaveGroupConversation,
  deleteConversation,
  reactToMessage,
} from "./messenger.controller.js";
import {
  getGroupDailySummaries,
  upsertGroupDailySummary,
  deleteGroupDailySummary,
} from "./group-summary.controller.js";

const router = Router();

router.get("/conversations", getConversations);
router.post("/conversations/direct", createDirectConversation);
router.post("/conversations/group", createGroupConversation);
router.put("/conversations/group/:id", updateGroupConversation);
router.post("/conversations/group/:id/leave", leaveGroupConversation);
router.delete("/conversations/:id", deleteConversation);
router.get("/conversations/:conversationId/messages", getMessages);
router.get("/conversations/:conversationId/daily-summaries", getGroupDailySummaries);
router.post("/conversations/:conversationId/daily-summaries", upsertGroupDailySummary);
router.delete("/conversations/:conversationId/daily-summaries/:id", deleteGroupDailySummary);
router.post("/messages", sendMessage);
router.post("/messages/:id/react", reactToMessage);
router.post("/upload", uploadAttachment);
router.put("/messages/:id", editMessage);
router.delete("/messages/:id", deleteMessage);
router.get("/search", searchMessages);

export default router;

