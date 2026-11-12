import path from "path";
import fs from "fs";

// Persistent reactions store
// Format: { [messageId: string]: { [emoji: string]: Array<{ userId: number; userName: string }> } }
function getReactionsFilePath(): string {
  const backendUploads = path.join(process.cwd(), "backend", "uploads");
  if (fs.existsSync(backendUploads)) {
    return path.join(backendUploads, "reactions.json");
  }
  const rootUploads = path.join(process.cwd(), "uploads");
  return path.join(rootUploads, "reactions.json");
}

export function loadReactionsStore(): Record<string, Record<string, Array<{ userId: number; userName: string }>>> {
  try {
    const filePath = getReactionsFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error reading reactions file:", err);
  }
  return {};
}

export function saveReactionsStore(store: Record<string, Record<string, Array<{ userId: number; userName: string }>>>) {
  try {
    const filePath = getReactionsFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.error("Error saving reactions file:", err);
  }
}

export function getMessageReactions(messageId: number): Record<string, Array<{ userId: number; userName: string }>> {
  const store = loadReactionsStore();
  return store[String(messageId)] || {};
}

export function toggleMessageReaction(
  messageId: number,
  userId: number,
  userName: string,
  emoji: string
): Record<string, Array<{ userId: number; userName: string }>> {
  const store = loadReactionsStore();
  const msgKey = String(messageId);
  if (!store[msgKey]) {
    store[msgKey] = {};
  }
  if (!store[msgKey][emoji]) {
    store[msgKey][emoji] = [];
  }

  const existingIdx = store[msgKey][emoji].findIndex((u) => u.userId === userId);
  if (existingIdx >= 0) {
    // Remove reaction (toggle off)
    store[msgKey][emoji].splice(existingIdx, 1);
    if (store[msgKey][emoji].length === 0) {
      delete store[msgKey][emoji];
    }
  } else {
    // Add reaction (toggle on)
    store[msgKey][emoji].push({ userId, userName });
  }

  saveReactionsStore(store);
  return store[msgKey] || {};
}

