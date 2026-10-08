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
} from "./messenger.controller.js";

const router = Router();

router.get("/conversations", getConversations);
router.post("/conversations/direct", createDirectConversation);
router.post("/conversations/group", createGroupConversation);
router.put("/conversations/group/:id", updateGroupConversation);
router.get("/conversations/:conversationId/messages", getMessages);
router.post("/messages", sendMessage);
router.post("/upload", uploadAttachment);
router.put("/messages/:id", editMessage);
router.delete("/messages/:id", deleteMessage);
router.get("/search", searchMessages);

export default router;
