"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Settings2,
  Phone,
  Video,
  Trash2,
  X,
  Users,
  Search,
  UserPlus,
  Copy,
  Forward,
  CornerUpLeft,
  Pencil,
  MessageSquare,
  ArrowLeft,
  Paperclip,
  Link2,
  FileText,
  Image as ImageIcon,
  Download,
  Loader2,
  ExternalLink,
  Send,
  Smile,
  PhoneCall,
  PhoneOff,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Clock,
  Plus,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { EmojiClickData } from "emoji-picker-react";
import { downloadFileDirectly, getCleanFileName, getFileBadgeInfo } from "@/lib/download";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => (
    <div className="w-[320px] h-[390px] bg-white rounded-2xl flex items-center justify-center border border-slate-200 shadow-xl">
      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getAuthToken } from "@/lib/auth";
import { getApiUrl } from "@/lib/api-config";
import {
  showConfirmDialog,
  showSuccessToast,
  showErrorToast,
  showNotification,
  showPromptDialog,
} from "@/lib/swal";

type Employee = {
  id: number;
  name: string;
  email: string;
  role?: { name: string } | string;
};

type Message = {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  attachmentUrl?: string | null;
  attachmentType?: "IMAGE" | "DOCUMENT" | "LINK" | null;
  replyToId?: number | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  sender: {
    id: number;
    name: string;
    email: string;
  };
  replyTo?: {
    id: number;
    content: string;
    sender: { name: string };
  } | null;
  reactions?: Record<string, Array<{ userId: number; userName: string }>>;
};

type Conversation = {
  id: number;
  type: "DIRECT" | "GROUP";
  name?: string | null;
  unreadCount?: number;
  lastMessage?: Message | null;
  createdAt?: string;
  createdBy?: {
    id: number;
    name: string;
  } | null;
  participants: Array<{
    userId: number;
    role?: string;
    lastReadAt?: string | Date | null;
    user: Employee;
  }>;
};

type CallSession = {
  id: number;
  channelName: string;
  type: "AUDIO" | "VIDEO";
  status: "RINGING" | "ACTIVE" | "ENDED" | "MISSED" | "REJECTED";
  host: { id: number; name: string; email: string };
  participants: Array<{ user: { id: number; name: string; email?: string } }>;
  createdAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
};

function ChatsLoadingFallback() {
  const { session, logout } = useAuth();
  const router = useRouter();
  const handleSignOut = () => {
    logout();
    router.replace("/");
  };
  return (
    <main className="app-shell">
      <Navbar user={session?.user as any} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session?.user} onSignOut={handleSignOut} />
        <section className="dashboard-content" style={{ padding: 0, height: "calc(100vh - 64px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p className="text-slate-400 font-medium text-sm">Loading conversations...</p>
        </section>
      </div>
    </main>
  );
}

export default function DirectChatsPage() {
  return (
    <Suspense fallback={<ChatsLoadingFallback />}>
      <ChatsContent />
    </Suspense>
  );
}

function ChatsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, isLoading, logout } = useAuth();
  const { socket, onlineUserIds } = useSocket();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [msgInput, setMsgInput] = useState<string>("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [forwardingMsg, setForwardingMsg] = useState<Message | null>(null);
  const [forwardTargetId, setForwardTargetId] = useState<number | null>(null);
  const [forwardLoading, setForwardLoading] = useState<boolean>(false);
  const [copyFeedbackId, setCopyFeedbackId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [typingUsers, setTypingUsers] = useState<Set<number>>(new Set());

  // Messenger Tabs: Chats | Groups | Calls
  const tabQuery = searchParams.get("tab");
  const initialTab = tabQuery === "groups" ? "groups" : tabQuery === "calls" ? "calls" : "chats";
  const [activeTab, setActiveTab] = useState<"chats" | "groups" | "calls">(initialTab);
  const [callLogs, setCallLogs] = useState<CallSession[]>([]);
  const [loadingCalls, setLoadingCalls] = useState<boolean>(false);

  // Attachments State
  const [attachmentUrl, setAttachmentUrl] = useState<string>("");
  const [attachmentFileName, setAttachmentFileName] = useState<string>("");
  const [attachmentType, setAttachmentType] = useState<"IMAGE" | "DOCUMENT" | "LINK">("IMAGE");
  const [showAttachmentMenu, setShowAttachmentMenu] = useState<boolean>(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState<boolean>(false);
  const [downloadingFileUrl, setDownloadingFileUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTriggerDownload = async (url: string, suggestedName?: string) => {
    if (downloadingFileUrl) return;
    setDownloadingFileUrl(url);
    try {
      await downloadFileDirectly(url, suggestedName);
    } finally {
      setDownloadingFileUrl(null);
    }
  };

  // Group Modal State
  const [showGroupModal, setShowGroupModal] = useState<boolean>(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState<string>("");
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<number[]>([]);
  const [creatingGroup, setCreatingGroup] = useState<boolean>(false);
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [groupSubmitError, setGroupSubmitError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Emoji Picker & Popover Refs
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);

  // Message Reaction Picker & Drag-and-Drop Attachment States
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<number | null>(null);
  const [showFullReactionPicker, setShowFullReactionPicker] = useState<boolean>(false);
  const reactionPickerRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(e.target as Node)) {
        setShowAttachmentMenu(false);
      }
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setReactionPickerMsgId(null);
        setShowFullReactionPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  // Fetch employees directory
  const fetchEmployees = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/employees`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) {
        showErrorToast("Failed to load employees");
        return;
      }
      const data = await res.json();
      setEmployees(data.employees || []);
    } catch (err) {
      console.error("Error fetching employees:", err);
      showErrorToast("Could not load employees");
    }
  };

  // Fetch all user conversations (Direct + Group)
  const fetchConversations = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/messenger/conversations`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) {
        showErrorToast("Failed to load conversations");
        return;
      }
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (err) {
      console.error("Error fetching conversations:", err);
      showErrorToast("Could not load conversations");
    } finally {
      setLoading(false);
    }
  };

  // Fetch call logs
  const fetchCallLogs = async () => {
    setLoadingCalls(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/calls`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setCallLogs(data.calls || []);
    } catch (err) {
      console.warn("Could not fetch call logs:", err);
    } finally {
      setLoadingCalls(false);
    }
  };

  useEffect(() => {
    if (activeTab === "calls" && session?.token) {
      fetchCallLogs();
    }
  }, [activeTab, session?.token]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "groups" || tabParam === "calls" || tabParam === "chats") {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleDeleteCallLog = async (callId: number) => {
    const confirmed = await showConfirmDialog({
      title: "Delete Call Record?",
      text: "Remove this call from your history?",
      confirmButtonText: "Yes, delete",
      icon: "warning",
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/calls/${callId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        setCallLogs((prev) => prev.filter((c) => c.id !== callId));
        showSuccessToast("Call record deleted");
      }
    } catch (err) {
      showErrorToast("Failed to delete call record");
    }
  };

  const handleClearAllCalls = async () => {
    const confirmed = await showConfirmDialog({
      title: "Clear Call History?",
      text: "This will remove all call logs from your history.",
      confirmButtonText: "Yes, clear all",
      icon: "warning",
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/calls`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        setCallLogs([]);
        showSuccessToast("Call history cleared");
      }
    } catch (err) {
      showErrorToast("Failed to clear call history");
    }
  };

  const handleDirectCallEmployee = (targetUserId: number, targetName: string, callType: "AUDIO" | "VIDEO") => {
    if (!socket) {
      showErrorToast("Connection not ready. Please try again.");
      return;
    }
    const channelName = `call-${Date.now()}`;
    socket.emit(
      "call:initiate",
      {
        targetUserId,
        type: callType,
        channelName,
      },
      (result: { callSessionId?: number; error?: string }) => {
        if (!result?.callSessionId) {
          showNotification({
            title: "Call Failed",
            text: result?.error || "Could not start call",
            icon: "error",
          });
          return;
        }
        const params = new URLSearchParams({
          activeChannel: channelName,
          target: String(targetUserId),
          targetName,
          callSessionId: String(result.callSessionId),
          type: callType,
        });
        router.push(`/dashboard/messenger/calls?${params.toString()}`);
      }
    );
  };

  useEffect(() => {
    if (session?.token) {
      fetchEmployees();
      fetchConversations();
    }
  }, [session?.token]);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (!activeConv) return;
    const fetchMessages = async () => {
      try {
        const res = await fetch(
          `${getApiUrl()}/api/messenger/conversations/${activeConv.id}/messages`,
          { headers: { Authorization: `Bearer ${getAuthToken()}` } }
        );
        if (!res.ok) return;
        const data = await res.json();
        setMessages(data.messages || []);
        if (socket) {
          socket.emit("join:conversation", activeConv.id);
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
      }
    };
    fetchMessages();
  }, [activeConv?.id, socket]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const activeConvRef = useRef<Conversation | null>(null);
  useEffect(() => {
    activeConvRef.current = activeConv;
  }, [activeConv]);

  // Auto-adjust textarea height and reset cleanly when empty or message sent
  useEffect(() => {
    if (textareaRef.current) {
      if (msgInput) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
      } else {
        textareaRef.current.style.height = "44px";
      }
    }
  }, [msgInput]);

  // Socket event listeners for real-time messages & typing
  useEffect(() => {
    if (!socket) return;

    const onNewMessage = (newMsg: Message) => {
      if (activeConvRef.current && newMsg.conversationId === activeConvRef.current.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === newMsg.conversationId) {
            const isCurrentlyActive = activeConvRef.current?.id === c.id;
            return {
              ...c,
              lastMessage: newMsg,
              unreadCount: isCurrentlyActive ? 0 : (c.unreadCount || 0) + 1,
            };
          }
          return c;
        })
      );
    };

    const onConversationUpdated = (data: { conversationId: number; lastMessage: Message }) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === data.conversationId) {
            return {
              ...c,
              lastMessage: data.lastMessage,
            };
          }
          return c;
        })
      );
    };

    const onGroupMembersUpdated = (data: {
      conversationId?: number;
      conversation?: Conversation;
      removed?: boolean;
    }) => {
      if (data.removed && data.conversationId) {
        setConversations((prev) =>
          prev.filter((conversation) => conversation.id !== data.conversationId)
        );
        if (activeConvRef.current?.id === data.conversationId) {
          setActiveConv(null);
          setMessages([]);
        }
        return;
      }
      if (!data.conversation) return;
      const updatedConversation = data.conversation;

      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === updatedConversation.id ? updatedConversation : conversation
        )
      );
      if (activeConvRef.current?.id === updatedConversation.id) {
        setActiveConv(updatedConversation);
      }
    };

    const onUserTyping = (data: { conversationId: number; userId: number }) => {
      if (activeConvRef.current && data.conversationId === activeConvRef.current.id) {
        setTypingUsers((prev) => new Set(prev).add(data.userId));
      }
    };

    const onUserStopTyping = (data: { conversationId: number; userId: number }) => {
      if (activeConvRef.current && data.conversationId === activeConvRef.current.id) {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          next.delete(data.userId);
          return next;
        });
      }
    };

    const onConversationDeleted = (data: { conversationId: number }) => {
      setConversations((prev) => prev.filter((c) => c.id !== data.conversationId));
      if (activeConvRef.current?.id === data.conversationId) {
        setActiveConv(null);
        setMessages([]);
      }
    };

    const onMessageReaction = (data: { messageId: number; conversationId: number; reactions: Record<string, Array<{ userId: number; userName: string }>> }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId ? { ...m, reactions: data.reactions } : m
        )
      );
    };

    socket.on("message:new", onNewMessage);
    socket.on("conversation:updated", onConversationUpdated);
    socket.on("conversation:members-updated", onGroupMembersUpdated);
    socket.on("conversation:deleted", onConversationDeleted);
    socket.on("user:typing", onUserTyping);
    socket.on("user:stop_typing", onUserStopTyping);
    socket.on("message:reaction", onMessageReaction);

    return () => {
      socket.off("message:new", onNewMessage);
      socket.off("conversation:updated", onConversationUpdated);
      socket.off("conversation:members-updated", onGroupMembersUpdated);
      socket.off("conversation:deleted", onConversationDeleted);
      socket.off("user:typing", onUserTyping);
      socket.off("user:stop_typing", onUserStopTyping);
      socket.off("message:reaction", onMessageReaction);
    };
  }, [socket]);

  // Delete Conversation Handler (Direct or Group)
  const handleDeleteConversation = async (conversationId: number) => {
    const conv = conversations.find((c) => c.id === conversationId);
    const label = conv?.type === "GROUP" ? `group "${conv.name}"` : "this conversation";
    const confirmed = await showConfirmDialog({
      title: "Delete Conversation?",
      text: `Are you sure you want to delete ${label}? All messages and media will be permanently deleted.`,
      confirmButtonText: "Yes, delete",
      confirmButtonColor: "#dc2626",
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/messenger/conversations/${conversationId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) {
        showErrorToast("Failed to delete chat");
        return;
      }
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConv?.id === conversationId) {
        setActiveConv(null);
        setMessages([]);
      }
      showSuccessToast("Conversation deleted successfully");
    } catch (err) {
      console.error("Error deleting conversation:", err);
      showErrorToast("Error deleting conversation");
    }
  };

  // Handle typing input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMsgInput(e.target.value);
    if (!socket || !activeConv) return;

    socket.emit("typing:start", { conversationId: activeConv.id });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing:stop", { conversationId: activeConv.id });
    }, 2000);
  };

  // Start chat with employee
  const handleStartChatWithEmployee = async (empId: number) => {
    try {
      const res = await fetch(`${getApiUrl()}/api/messenger/conversations/direct`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ targetUserId: empId }),
      });
      if (!res.ok) {
        showErrorToast("Could not start direct chat");
        return;
      }
      const data = await res.json();
      await fetchConversations();
      setActiveConv(data.conversation);
      showSuccessToast("Chat opened");
    } catch (err) {
      console.error("Error starting direct chat:", err);
      showErrorToast("Network error starting chat");
    }
  };

  const handleOpenCreateGroupModal = () => {
    setEditingGroupId(null);
    setGroupName("");
    setSelectedParticipantIds([]);
    setGroupMemberSearch("");
    setGroupSubmitError(null);
    setShowGroupModal(true);
  };

  const handleOpenManageMembersModal = (conv: Conversation) => {
    setEditingGroupId(conv.id);
    setGroupName(conv.name || "");
    setSelectedParticipantIds(conv.participants.map((p) => p.userId));
    setGroupMemberSearch("");
    setGroupSubmitError(null);
    setShowGroupModal(true);
  };

  // Create or Update Group Modal Submission
  const handleSaveGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setGroupSubmitError("Enter a group name before continuing.");
      return;
    }

    setCreatingGroup(true);
    setGroupSubmitError(null);
    try {
      if (editingGroupId) {
        // Update existing group
        const res = await fetch(`${getApiUrl()}/api/messenger/conversations/group/${editingGroupId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({
            name: groupName.trim(),
            participantIds: selectedParticipantIds,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => null);
          throw new Error(errorData?.message || "Failed to update group. Please try again.");
        }
        const data = await res.json();
        setConversations((prev) =>
          prev.map((c) => (c.id === data.conversation.id ? data.conversation : c))
        );
        if (activeConv?.id === data.conversation.id) {
          setActiveConv(data.conversation);
        }
        showSuccessToast("Group updated successfully");
      } else {
        // Create new group
        const res = await fetch(`${getApiUrl()}/api/messenger/conversations/group`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({
            name: groupName.trim(),
            participantIds: selectedParticipantIds,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => null);
          throw new Error(errorData?.message || "Failed to create group. Please try again.");
        }
        const data = await res.json();
        setConversations((prev) => [data.conversation, ...prev]);
        setActiveConv(data.conversation);
        showSuccessToast("Group created successfully");
      }
      setShowGroupModal(false);
      setGroupName("");
      setSelectedParticipantIds([]);
      setEditingGroupId(null);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unable to save the group. Please try again.";
      setGroupSubmitError(errMsg);
      showErrorToast(errMsg);
    } finally {
      setCreatingGroup(false);
    }
  };

  // Drag & drop handlers for chat message attachments
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  };

  // Helper to render message content with clickable links
  const renderFormattedContent = (content: string, isMe: boolean) => {
    if (!content) return null;
    const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s])/gi;
    const parts = content.split(urlRegex);

    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        const href = part.startsWith("http://") || part.startsWith("https://") ? part : `https://${part}`;
        return (
          <a
            key={index}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline underline-offset-2 break-all font-semibold transition-all hover:opacity-85 inline-flex items-center gap-0.5 ${isMe ? "text-amber-200 hover:text-white" : "text-orange-600 hover:text-orange-700"
              }`}
            onClick={(e) => e.stopPropagation()}
          >
            <span>{part}</span>
            <ExternalLink size={11} className="inline-block shrink-0 opacity-80 ml-0.5" />
          </a>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  // Reusable File Upload helper (supports file picker, drag & drop, and direct clipboard image paste)
  const uploadFile = async (file: File) => {
    setIsUploadingAttachment(true);
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === "string") {
        try {
          const res = await fetch(`${getApiUrl()}/api/messenger/upload`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getAuthToken()}`,
            },
            body: JSON.stringify({
              fileData: reader.result,
              fileName: file.name,
              fileType: file.type.startsWith("image/") ? "IMAGE" : "DOCUMENT",
            }),
          });

          if (!res.ok) throw new Error("Upload failed");
          const data = await res.json();
          setAttachmentUrl(data.url);
          setAttachmentFileName(data.fileName);
          setAttachmentType(data.type);
          showSuccessToast(file.type.startsWith("image/") ? "Image pasted and attached!" : "Attachment uploaded successfully");
        } catch (err: any) {
          console.error("Upload error:", err);
          showErrorToast("Failed to upload attachment to server storage");
        } finally {
          setIsUploadingAttachment(false);
        }
      }
    };
    reader.onerror = () => {
      setIsUploadingAttachment(false);
      showErrorToast("Failed to read file");
    };
    reader.readAsDataURL(file);
  };

  // Handle Attachment Upload from File Picker
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFile(file);
    setShowAttachmentMenu(false);
    if (e.target) e.target.value = "";
  };

  // Handle Direct Clipboard Image Pasting (Ctrl+V)
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const ext = file.type.split("/")[1]?.replace(/[^a-zA-Z0-9]/g, "") || "png";
          const uniqueName = `pasted_image_${Date.now()}.${ext}`;
          const renamedFile = new File([file], uniqueName, { type: file.type });
          uploadFile(renamedFile);
        }
        return;
      }
    }
  };

  const handleAddLinkPrompt = async () => {
    const link = await showPromptDialog({
      title: "Add Document / Web Link",
      inputPlaceholder: "https://example.com/document...",
    });
    if (link && link.trim()) {
      setAttachmentUrl(link.trim());
      setAttachmentFileName(link.trim().replace(/^https?:\/\//, ""));
      setAttachmentType("LINK");
      setShowAttachmentMenu(false);
      showSuccessToast("Link attached");
    }
  };

  // Send or Edit Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!msgInput.trim() && !attachmentUrl) || !activeConv) return;

    if (editingMsg) {
      // Edit mode
      try {
        const res = await fetch(`${getApiUrl()}/api/messenger/messages/${editingMsg.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({ content: msgInput.trim() }),
        });
        if (res.ok) {
          const data = await res.json();
          setMessages((prev) =>
            prev.map((m) => (m.id === data.message.id ? data.message : m))
          );
          setEditingMsg(null);
          setMsgInput("");
          if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
          }
          showSuccessToast("Message updated");
        } else {
          showErrorToast("Failed to edit message");
        }
      } catch (err) {
        console.error("Error editing message:", err);
        showErrorToast("Network error editing message");
      }
      return;
    }

    // New message
    try {
      const res = await fetch(`${getApiUrl()}/api/messenger/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          conversationId: activeConv.id,
          content: msgInput.trim(),
          attachmentUrl: attachmentUrl || null,
          attachmentType: attachmentUrl ? attachmentType : null,
          replyToId: replyingTo?.id || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
        setMsgInput("");
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
        setAttachmentUrl("");
        setReplyingTo(null);
        fetchConversations();
      } else {
        showErrorToast("Failed to send message");
      }
    } catch (err) {
      console.error("Error sending message:", err);
      showErrorToast("Network error sending message");
    }
  };

  // Copy Message to clipboard
  const handleCopyMessage = (msg: Message) => {
    if (!msg.content) return;
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopyFeedbackId(msg.id);
      setTimeout(() => setCopyFeedbackId(null), 1500);
    }).catch(() => {
      // Fallback for non-secure context
      const ta = document.createElement("textarea");
      ta.value = msg.content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopyFeedbackId(msg.id);
      setTimeout(() => setCopyFeedbackId(null), 1500);
    });
  };

  // Forward Message to another conversation
  const handleForwardMessage = async () => {
    if (!forwardingMsg || !forwardTargetId) return;
    setForwardLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/messenger/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          conversationId: forwardTargetId,
          content: forwardingMsg.content,
          attachmentUrl: forwardingMsg.attachmentUrl || null,
          attachmentType: forwardingMsg.attachmentType || null,
        }),
      });
      if (res.ok) {
        showSuccessToast("Message forwarded successfully");
        setForwardingMsg(null);
        setForwardTargetId(null);
        fetchConversations();
      } else {
        showErrorToast("Failed to forward message");
      }
    } catch (err) {
      console.error("Error forwarding message:", err);
      showErrorToast("Network error forwarding message");
    } finally {
      setForwardLoading(false);
    }
  };

  // Soft Delete Message
  const handleDeleteMessage = async (msgId: number) => {
    const confirmed = await showConfirmDialog({
      title: "Delete Message?",
      text: "Are you sure you want to delete this message? This action cannot be undone.",
      confirmButtonText: "Yes, delete",
      confirmButtonColor: "#dc2626",
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/messenger/messages/${msgId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, content: "This message was deleted", deletedAt: new Date().toISOString() }
              : m
          )
        );
        showSuccessToast("Message deleted");
      } else {
        showErrorToast("Failed to delete message");
      }
    } catch (err) {
      console.error("Error deleting message:", err);
      showErrorToast("Error deleting message");
    }
  };

  // Insert emoji from emoji-picker into message input
  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const emoji = emojiData.emoji;
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart || msgInput.length;
      const end = textareaRef.current.selectionEnd || msgInput.length;
      const updated = msgInput.substring(0, start) + emoji + msgInput.substring(end);
      setMsgInput(updated);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + emoji.length;
          textareaRef.current.style.height = "auto";
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
      }, 10);
    } else {
      setMsgInput((prev) => prev + emoji);
    }
  };

  // Toggle reaction on message
  const handleReact = async (messageId: number, emoji: string) => {
    if (!activeConv || !session?.user?.id) return;
    const currentUserId = Number(session.user.id);
    const currentUserName = session.user.name || "You";

    // Optimistic UI update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const currentReactions = { ...(m.reactions || {}) };
        const userList = [...(currentReactions[emoji] || [])];
        const existingIdx = userList.findIndex((u) => u.userId === currentUserId);
        if (existingIdx >= 0) {
          userList.splice(existingIdx, 1);
          if (userList.length === 0) {
            delete currentReactions[emoji];
          } else {
            currentReactions[emoji] = userList;
          }
        } else {
          userList.push({ userId: currentUserId, userName: currentUserName });
          currentReactions[emoji] = userList;
        }
        return { ...m, reactions: currentReactions };
      })
    );

    // Persist via REST API (which updates database/file storage and broadcasts to all conversation members)
    try {
      const token = getAuthToken();
      const res = await fetch(`${getApiUrl()}/api/messenger/messages/${messageId}/react`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reactions) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId ? { ...m, reactions: data.reactions } : m
            )
          );
        }
      }
    } catch (err) {
      console.error("Failed to persist reaction:", err);
    }
  };

  // Trigger call session
  const handleInitiateCall = (type: "AUDIO" | "VIDEO") => {
    if (!activeConv || !socket) return;
    if (activeConv.type === "GROUP") {
      const channelName = `call-${Date.now()}`;
      socket.emit(
        "call:initiate",
        {
          targetUserIds: activeConv.participants
            .map((participant) => participant.userId)
            .filter((participantId) => participantId !== session?.user.id),
          conversationId: activeConv.id,
          type,
          channelName,
        },
        (result: { callSessionId?: number; error?: string }) => {
          if (!result?.callSessionId) {
            showNotification({
              title: "Call Initiation Failed",
              text: result?.error || "Unable to start the group call",
              icon: "error",
            });
            return;
          }
          const params = new URLSearchParams({
            activeChannel: channelName,
            groupCall: "true",
            callSessionId: String(result.callSessionId),
            groupName: activeConv.name || "Group",
            type,
          });
          router.push(`/dashboard/messenger/calls?${params.toString()}`);
        }
      );
      return;
    }

    const partner = activeConv.participants.find((p) => p.userId !== session?.user.id);
    if (!partner && activeConv.type === "DIRECT") return;

    const targetUserId = partner ? partner.userId : activeConv.participants[0]?.userId;
    const channelName = `call-${Date.now()}`;
    socket.emit(
      "call:initiate",
      {
        targetUserId,
        conversationId: activeConv.id,
        type,
        channelName,
      },
      (result: { callSessionId?: number; error?: string }) => {
        if (!result?.callSessionId) {
          showNotification({
            title: "Call Initiation Failed",
            text: result?.error || "Unable to start the call",
            icon: "error",
          });
          return;
        }
        const params = new URLSearchParams({
          activeChannel: channelName,
          target: String(targetUserId),
          targetName: partner?.user?.name || "",
          callSessionId: String(result.callSessionId),
          type,
        });
        router.push(`/dashboard/messenger/calls?${params.toString()}`);
      }
    );
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading Messenger...</main>;
  }

  const currentUserId = session.user.id;
  const isDirect = activeConv?.type === "DIRECT";
  const partnerUser = isDirect
    ? activeConv?.participants.find((p) => p.userId !== currentUserId)?.user
    : null;
  const isPartnerOnline = partnerUser ? onlineUserIds.includes(partnerUser.id) : false;

  // Search filtering for chats and contacts
  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (conv.type === "GROUP") {
      return conv.name?.toLowerCase().includes(q);
    } else {
      const partner = conv.participants.find((p) => p.userId !== currentUserId)?.user;
      return partner?.name.toLowerCase().includes(q) || partner?.email.toLowerCase().includes(q);
    }
  });

  const existingConvPartnerIds = conversations
    .filter((c) => c.type === "DIRECT")
    .map((c) => c.participants.find((p) => p.userId !== currentUserId)?.userId);

  const availableEmployees = employees.filter((emp) => {
    if (emp.id === currentUserId) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return emp.name.toLowerCase().includes(q) || emp.email.toLowerCase().includes(q);
  });

  const directConversations = filteredConversations.filter((c) => c.type === "DIRECT");
  const groupConversations = filteredConversations.filter((c) => c.type === "GROUP");
  const filteredCallLogs = callLogs.filter((call) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const hostMatch = call.host?.name?.toLowerCase().includes(q) || call.host?.email?.toLowerCase().includes(q);
    const participantMatch = call.participants?.some((p) => p.user?.name?.toLowerCase().includes(q));
    const typeMatch = call.type?.toLowerCase().includes(q);
    return hostMatch || participantMatch || typeMatch;
  });

  return (
    <main className="app-shell bg-slate-50 min-h-screen">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} onSignOut={handleSignOut} />
        <section
          className="dashboard-content"
          style={{ padding: "0", display: "flex", height: "calc(100vh - 64px)", overflow: "hidden" }}
        >
          {/* Left Messenger Sidebar (Contacts & Chats) */}
          <div
            className={`w-full lg:w-80 xl:w-96 border-r border-slate-200/80 bg-white flex flex-col h-full shadow-xs transition-all ${activeConv ? "hidden lg:flex" : "flex"
              }`}
          >
            {/* Sidebar Top Controls: Header + Tabs + Search */}
            <div className="space-y-3 border-b border-slate-200/80 bg-white p-3.5 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Workspace</span>
                  <h2 className="mt-0.5 text-base font-bold leading-tight text-slate-900">
                    {activeTab === "chats" ? "Direct Messages" : activeTab === "groups" ? "Team Groups" : "Call History"}
                  </h2>
                </div>

                {/* Context Action Button */}
                {activeTab === "groups" && (
                  <button
                    onClick={handleOpenCreateGroupModal}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition cursor-pointer"
                  >
                    + New Group
                  </button>
                )}
                {activeTab === "calls" && callLogs.length > 0 && (
                  <button
                    onClick={handleClearAllCalls}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-700 active:scale-95 px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer shadow-2xs"
                    title="Clear Call History"
                  >
                    <Trash2 size={12} />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              {/* Segmented Tab Navigation: Chats | Groups | Calls */}
              <div className="grid grid-cols-3 gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/70 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("chats")}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer select-none active:scale-[0.98] ${activeTab === "chats"
                    ? "bg-[#ea580c] hover:bg-[#c2410c] text-white shadow-xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/80 hover:shadow-2xs"
                    }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 stroke-[2.2]" />
                  <span>Chats</span>
                  {directConversations.length > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none transition-colors ${activeTab === "chats" ? "bg-white/20 text-white" : "bg-slate-200/90 text-slate-700"
                        }`}
                    >
                      {directConversations.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("groups")}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer select-none active:scale-[0.98] ${activeTab === "groups"
                    ? "bg-[#ea580c] hover:bg-[#c2410c] text-white shadow-xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/80 hover:shadow-2xs"
                    }`}
                >
                  <Users className="w-3.5 h-3.5 shrink-0 stroke-[2.2]" />
                  <span>Groups</span>
                  {groupConversations.length > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none transition-colors ${activeTab === "groups" ? "bg-white/20 text-white" : "bg-slate-200/90 text-slate-700"
                        }`}
                    >
                      {groupConversations.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("calls")}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer select-none active:scale-[0.98] ${activeTab === "calls"
                    ? "bg-[#ea580c] hover:bg-[#c2410c] text-white shadow-xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/80 hover:shadow-2xs"
                    }`}
                >
                  <Phone className="w-3.5 h-3.5 shrink-0 stroke-[2.2]" />
                  <span>Calls</span>
                  {callLogs.length > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none transition-colors ${activeTab === "calls" ? "bg-white/20 text-white" : "bg-slate-200/90 text-slate-700"
                        }`}
                    >
                      {callLogs.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Working Search Bar */}
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                <input
                  type="text"
                  placeholder={
                    activeTab === "chats"
                      ? "Search direct chats & contacts..."
                      : activeTab === "groups"
                        ? "Search group channels..."
                        : "Search call records..."
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: "40px" }}
                  className="w-full h-9.5 !pl-10 pr-8 text-xs bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200/90 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 text-slate-900 font-medium placeholder-slate-400 transition-all shadow-2xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Conversation, Group & Call Logs List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {loading ? (
                <div className="p-6 text-center text-xs text-slate-400 animate-pulse font-medium">
                  Loading workspace messaging...
                </div>
              ) : activeTab === "chats" ? (
                <>
                  {/* Active Direct Chats */}
                  {directConversations.length > 0 && (
                    <div className="p-2 space-y-1">
                      <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Direct Chats ({directConversations.length})
                      </p>
                      {directConversations.map((conv) => {
                        const partner = conv.participants.find((p) => p.userId !== currentUserId)?.user;
                        const isOnline = partner ? onlineUserIds.includes(partner.id) : false;
                        const isSelected = activeConv?.id === conv.id;

                        return (
                          <div
                            key={conv.id}
                            onClick={() => setActiveConv(conv)}
                            className={`p-2.5 sm:p-3 rounded-2xl cursor-pointer transition-all flex items-center justify-between group ${isSelected
                              ? "bg-orange-50 border border-orange-200/80 shadow-xs"
                              : "hover:bg-slate-50"
                              }`}
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="relative flex-shrink-0">
                                <div className="w-10 h-10 rounded-2xl font-black text-xs flex items-center justify-center shadow-xs bg-slate-800 text-white">
                                  {partner?.name.charAt(0).toUpperCase() || "E"}
                                </div>
                                <span
                                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${isOnline ? "bg-emerald-500" : "bg-slate-300"
                                    }`}
                                />
                              </div>
                              <div className="truncate">
                                <p className="text-xs font-black text-slate-900 truncate">
                                  {partner?.name || "Employee"}
                                </p>
                                <p className="text-[11px] text-slate-500 truncate mt-0.5 font-medium">
                                  {conv.lastMessage
                                    ? conv.lastMessage.content || "Attachment sent"
                                    : "No messages yet"}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {conv.unreadCount ? (
                                <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 shadow-xs">
                                  {conv.unreadCount}
                                </span>
                              ) : null}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteConversation(conv.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-100 text-rose-600 rounded-lg transition-all cursor-pointer"
                                title="Delete chat"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Contact Directory */}
                  <div className="p-2 space-y-1">
                    <p className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      Contact Directory ({availableEmployees.length})
                    </p>
                    {availableEmployees.map((emp) => {
                      const isOnline = onlineUserIds.includes(emp.id);
                      return (
                        <div
                          key={emp.id}
                          onClick={() => handleStartChatWithEmployee(emp.id)}
                          className="p-2.5 rounded-2xl cursor-pointer hover:bg-orange-50/60 transition-all flex items-center justify-between group border border-transparent hover:border-orange-100"
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-xs group-hover:bg-orange-500 group-hover:text-white transition-colors">
                                {emp.name.charAt(0).toUpperCase()}
                              </div>
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${isOnline ? "bg-emerald-500" : "bg-slate-300"
                                  }`}
                              />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-900 group-hover:text-orange-900">
                                {emp.name}
                              </p>
                              <p className="text-[10px] text-slate-400 font-medium">
                                {emp.email}
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] text-orange-600 font-extrabold opacity-0 group-hover:opacity-100 transition-opacity">
                            + Chat
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : activeTab === "groups" ? (
                /* Group Channels Tab */
                <div className="p-2 space-y-1">
                  <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Team Groups ({groupConversations.length})
                  </p>
                  {groupConversations.length > 0 ? (
                    groupConversations.map((conv) => {
                      const isSelected = activeConv?.id === conv.id;
                      return (
                        <div
                          key={conv.id}
                          onClick={() => setActiveConv(conv)}
                          className={`p-2.5 sm:p-3 rounded-2xl cursor-pointer transition-all flex items-center justify-between group ${isSelected
                            ? "bg-orange-50 border border-orange-200/80 shadow-xs"
                            : "hover:bg-slate-50"
                            }`}
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="relative flex-shrink-0">
                              <div className="w-10 h-10 rounded-2xl font-black text-xs flex items-center justify-center shadow-xs bg-slate-900 text-orange-400">
                                <Users size={18} />
                              </div>
                            </div>
                            <div className="truncate">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-black text-slate-900 truncate">
                                  {conv.name || "Team Group"}
                                </p>
                                <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md font-bold">
                                  {conv.participants.length} members
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 truncate mt-0.5 font-medium">
                                {conv.lastMessage
                                  ? conv.lastMessage.content || "Attachment sent"
                                  : "No messages yet"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {conv.unreadCount ? (
                              <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 shadow-xs">
                                {conv.unreadCount}
                              </span>
                            ) : null}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteConversation(conv.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-100 text-rose-600 rounded-lg transition-all cursor-pointer"
                              title="Delete group"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-6 text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-500 border border-orange-200/60 flex items-center justify-center mx-auto text-xl">
                        👥
                      </div>
                      <p className="text-xs font-bold text-slate-700">No Groups Found</p>
                      <p className="text-[11px] text-slate-500">
                        Create team channels to collaborate together.
                      </p>
                      <button
                        onClick={handleOpenCreateGroupModal}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
                      >
                        + Create First Group
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Calls Tab */
                <div className="p-2 space-y-1">
                  <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Call Logs ({filteredCallLogs.length})
                  </p>
                  {loadingCalls ? (
                    <div className="p-6 text-center text-xs text-slate-400 animate-pulse font-medium">
                      Loading call logs...
                    </div>
                  ) : filteredCallLogs.length > 0 ? (
                    filteredCallLogs.map((call) => {
                      const isCaller = call.host.id === currentUserId;
                      const otherPerson = isCaller
                        ? call.participants[0]?.user || { id: 0, name: "Participant" }
                        : call.host;
                      const isMissed = call.status === "MISSED" || call.status === "REJECTED";

                      return (
                        <div
                          key={call.id}
                          className="p-2.5 sm:p-3 rounded-2xl hover:bg-slate-50 transition-all flex items-center justify-between group border border-transparent hover:border-slate-200/60"
                        >
                          <div className="flex items-center gap-3 overflow-hidden min-w-0">
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 ${call.type === "VIDEO"
                              ? "bg-orange-500/10 text-orange-600 border border-orange-500/20"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                              }`}>
                              {call.type === "VIDEO" ? <Video size={16} /> : <Phone size={15} />}
                            </div>
                            <div className="truncate min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-black text-slate-900 truncate">
                                  {otherPerson.name}
                                </p>
                                <span className={`text-[9px] px-1.5 py-0.2 rounded-md font-bold shrink-0 ${isMissed
                                  ? "bg-rose-50 text-rose-600 border border-rose-200"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  }`}>
                                  {call.status}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                                <span>{isCaller ? "↗ Outgoing" : "↙ Incoming"}</span>
                                <span>•</span>
                                <span>{new Date(call.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {/* Quick-dial Audio Call */}
                            <button
                              onClick={() => handleDirectCallEmployee(otherPerson.id, otherPerson.name, "AUDIO")}
                              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer shadow-2xs"
                              title={`Voice Call ${otherPerson.name}`}
                            >
                              <Phone size={13} />
                            </button>
                            {/* Quick-dial Video Call */}
                            <button
                              onClick={() => handleDirectCallEmployee(otherPerson.id, otherPerson.name, "VIDEO")}
                              className="p-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all cursor-pointer shadow-2xs"
                              title={`Video Call ${otherPerson.name}`}
                            >
                              <Video size={13} />
                            </button>
                            {/* Delete Call Log */}
                            <button
                              onClick={() => handleDeleteCallLog(call.id)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-rose-100 text-rose-600 rounded-xl transition-all cursor-pointer"
                              title="Delete log"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-6 text-center space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto text-xl">
                        📞
                      </div>
                      <p className="text-xs font-bold text-slate-700">No Call History</p>
                      <p className="text-[11px] text-slate-500">
                        Your calls and meetings will appear here.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Active Chat Window */}
          <div
            className={`flex-1 min-w-0 bg-slate-50/50 flex-col h-full transition-all relative ${activeConv ? "flex" : "hidden lg:flex"
              }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {activeConv ? (
              <>
                {/* Drag & Drop Visual Overlay */}
                {isDraggingOver && (
                  <div className="absolute inset-0 z-50 bg-orange-500/10 backdrop-blur-xs border-2 border-dashed border-orange-500 rounded-none flex flex-col items-center justify-center pointer-events-none transition-all">
                    <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3 border border-orange-200">
                      <div className="w-14 h-14 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center animate-bounce">
                        <Paperclip size={28} />
                      </div>
                      <p className="text-base font-bold text-slate-800">Drop your file here</p>
                      <p className="text-xs text-slate-500 font-medium">Upload images or documents </p>
                    </div>
                  </div>
                )}
                {/* Chat Header with PROMINENT BACK BUTTON */}
                <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-3 sm:px-6 shadow-2xs">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => setActiveConv(null)}
                      aria-label="Back to conversations"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 lg:hidden cursor-pointer"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div
                          className={`w-10 h-10 rounded-2xl font-black text-sm flex items-center justify-center ${!isDirect
                            ? "bg-slate-900 text-orange-400"
                            : "bg-slate-800 text-white"
                            }`}
                        >
                          {!isDirect
                            ? <Users size={18} />
                            : partnerUser?.name.charAt(0).toUpperCase() || "E"}
                        </div>
                        {isDirect && (
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${isPartnerOnline ? "bg-emerald-500" : "bg-slate-300"
                              }`}
                          />
                        )}
                      </div>
                      <div className="min-w-0 max-w-[120px] xs:max-w-[160px] sm:max-w-xs md:max-w-md">
                        <h3 className="text-sm font-black text-slate-900 truncate">
                          {!isDirect ? activeConv.name : partnerUser?.name}
                        </h3>
                        <p className="text-[11px] text-slate-500 font-medium truncate">
                          {!isDirect ? (
                            <span>
                              Created by {activeConv.createdBy?.name || "Admin"}
                              {activeConv.createdAt && (
                                <> on {new Date(activeConv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</>
                              )}{" "}
                              • {activeConv.participants.length} members
                            </span>
                          ) : isPartnerOnline ? (
                            "🟢 Active Now"
                          ) : (
                            "⚪ Offline"
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* WebRTC Call Triggers & Group Member Management */}
                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    {!isDirect && (
                      <button
                        onClick={() => handleOpenManageMembersModal(activeConv)}
                        className="h-8.5 w-8.5 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                        title="Manage group members"
                        aria-label="Manage group members"
                      >
                        <Settings2 size={15} strokeWidth={2} />
                      </button>
                    )}
                    <button
                      onClick={() => handleInitiateCall("AUDIO")}
                      className="h-8.5 px-3 bg-slate-100 hover:bg-slate-200/80 text-slate-700 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Audio call"
                    >
                      <Phone size={13} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => handleInitiateCall("VIDEO")}
                      className="h-8.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      title="Video call"
                    >
                      <Video size={13} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => handleDeleteConversation(activeConv.id)}
                      className="h-8.5 px-2.5 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg text-xs font-semibold transition-all border border-slate-200/80 hover:border-rose-200 flex items-center gap-1.5 cursor-pointer"
                      title={isDirect ? "Delete chat conversation" : "Delete group conversation"}
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => setActiveConv(null)}
                      className="h-8.5 w-8.5 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all border border-slate-200/80 cursor-pointer"
                      title="Close"
                    >
                      <X size={15} strokeWidth={2} />
                    </button>
                  </div>
                </div>

                {/* Messages Feed */}
                <div className="flex-1 space-y-4 overflow-y-auto no-scrollbar bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-50/40 via-slate-50/70 to-slate-100/70 p-4 sm:p-6">
                  {messages.length === 0 && (
                    <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
                      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-100 bg-white text-orange-500 shadow-sm">
                        <MessageSquare size={24} />
                      </span>
                      <p className="text-sm font-bold text-slate-700">Start the conversation</p>
                      <p className="mt-1 text-xs text-slate-500">Send a message to get things going.</p>
                    </div>
                  )}
                  {messages.map((m) => {
                    const isMe = m.senderId === currentUserId;
                    const isDeleted = Boolean(m.deletedAt);

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col relative ${isMe ? "items-end" : "items-start"}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-slate-400">
                            {m.sender.name}
                          </span>
                        </div>
                        <div
                          className={`max-w-[85vw] sm:max-w-md md:max-w-lg lg:max-w-xl p-3.5 rounded-2xl text-xs shadow-2xs relative group transition-all break-words [overflow-wrap:anywhere] ${isMe
                            ? "bg-orange-50/90 border border-orange-200/90 text-slate-900 font-medium rounded-br-xs"
                            : "bg-white text-slate-800 border border-slate-200/90 font-medium rounded-bl-xs"
                            }`}
                        >
                          {/* Smiley / Reaction Popover */}
                          {reactionPickerMsgId === m.id && (
                            <div
                              ref={reactionPickerRef}
                              className="absolute -top-11 right-2 z-50 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 flex items-center gap-1 animate-in fade-in zoom-in-95 duration-150"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {!showFullReactionPicker ? (
                                <>
                                  {["😊", "😍", "🔥", "🙌", "👏", "🚀", "💡", "💯", "😢", "😮", "✨"].map((emoji) => {
                                    const userReacted = Boolean(m.reactions?.[emoji]?.some((u) => u.userId === currentUserId));
                                    return (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => {
                                          handleReact(m.id, emoji);
                                          setReactionPickerMsgId(null);
                                        }}
                                        className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition-transform hover:scale-125 cursor-pointer ${userReacted ? "bg-orange-100 scale-110" : "hover:bg-slate-100"
                                          }`}
                                        title={`React with ${emoji}`}
                                      >
                                        {emoji}
                                      </button>
                                    );
                                  })}
                                  <button
                                    type="button"
                                    onClick={() => setShowFullReactionPicker(true)}
                                    className="w-7 h-7 rounded-lg text-xs flex items-center justify-center text-slate-500 hover:text-orange-600 hover:bg-orange-50 font-bold transition-all cursor-pointer border border-slate-200/80 ml-0.5"
                                    title="All smileys and emojis"
                                  >
                                    <Plus size={13} />
                                  </button>
                                </>
                              ) : (
                                <div className="p-0">
                                  <EmojiPicker
                                    onEmojiClick={(emojiData) => {
                                      handleReact(m.id, emojiData.emoji);
                                      setReactionPickerMsgId(null);
                                      setShowFullReactionPicker(false);
                                    }}
                                    autoFocusSearch={true}
                                    width={280}
                                    height={320}
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          {/* Reply Quote */}
                          {m.replyTo && (
                            <div className="mb-2 p-2 rounded-xl bg-slate-800/20 border-l-2 border-orange-500 text-[11px] italic">
                              <p className="font-bold">{m.replyTo.sender.name}:</p>
                              <p className="truncate">{m.replyTo.content}</p>
                            </div>
                          )}

                          {/* Attachment Display with Direct Download Action */}
                          {m.attachmentUrl && !isDeleted && (() => {
                            const cleanDocName = getCleanFileName(m.attachmentUrl, "Document");
                            const badgeInfo = getFileBadgeInfo(cleanDocName, m.attachmentType);
                            const isThisDownloading = downloadingFileUrl === m.attachmentUrl;

                            return (
                              <div className="my-2 relative group/att overflow-hidden rounded-xl">
                                {m.attachmentType === "IMAGE" ? (
                                  <div className="relative rounded-xl overflow-hidden border border-slate-200/80 shadow-2xs">
                                    <img
                                      src={m.attachmentUrl}
                                      alt="Attachment"
                                      className="max-w-xs max-h-60 rounded-xl object-cover"
                                    />
                                    <div className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover/att:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2 backdrop-blur-xs">
                                      <button
                                        type="button"
                                        onClick={() => handleTriggerDownload(m.attachmentUrl!, getCleanFileName(m.attachmentUrl, "image.jpg"))}
                                        disabled={isThisDownloading}
                                        className="px-3.5 py-2 bg-slate-900/90 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-md flex items-center gap-2 transition-all cursor-pointer active:scale-95 border border-white/20 disabled:opacity-75"
                                      >
                                        {isThisDownloading ? <Loader2 size={13} className="animate-spin text-white" /> : <Download size={13} strokeWidth={2.2} />}
                                        <span>{isThisDownloading ? "Downloading..." : "Download Image"}</span>
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    className={`p-2.5 sm:p-3 rounded-xl border transition-all flex items-center justify-between gap-3 shadow-2xs ${isMe
                                      ? "bg-white/95 border-orange-200/80 hover:border-orange-300"
                                      : "bg-slate-50/95 border-slate-200/90 hover:border-slate-300 hover:bg-slate-100/70"
                                      }`}
                                  >
                                    {/* Icon & File Details */}
                                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                      <span
                                        className={`flex h-9 w-9 items-center justify-center rounded-lg border shadow-2xs shrink-0 ${badgeInfo.colorClass}`}
                                      >
                                        {m.attachmentType === "LINK" ? (
                                          <Link2 size={16} strokeWidth={2.2} />
                                        ) : (
                                          <FileText size={16} strokeWidth={2.2} />
                                        )}
                                      </span>
                                      <div className="flex flex-col min-w-0">
                                        <span
                                          className="text-xs font-bold text-slate-800 hover:text-slate-950 truncate max-w-[130px] xs:max-w-[180px] sm:max-w-[240px] md:max-w-[300px] leading-snug"
                                          title={cleanDocName}
                                        >
                                          {cleanDocName}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-semibold tracking-wide uppercase leading-none mt-0.5">
                                          {badgeInfo.label}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Action Button */}
                                    {m.attachmentType === "LINK" ? (
                                      <a
                                        href={m.attachmentUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer active:scale-95"
                                      >
                                        <ExternalLink size={12} strokeWidth={2} />
                                        <span>Open</span>
                                      </a>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleTriggerDownload(m.attachmentUrl!, cleanDocName)}
                                        disabled={isThisDownloading}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 border disabled:opacity-60 ${isMe
                                          ? "bg-slate-900 hover:bg-slate-800 text-white border-slate-900"
                                          : "bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-200/90"
                                          }`}
                                        title="Download directly to your PC"
                                      >
                                        {isThisDownloading ? (
                                          <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                          <Download size={12} strokeWidth={2.2} />
                                        )}
                                        <span className="font-semibold">{isThisDownloading ? "Saving..." : "Download"}</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          <div className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed max-h-[360px] overflow-y-auto no-scrollbar pr-1 select-text ${isDeleted ? "italic opacity-60" : ""}`}>
                            {renderFormattedContent(m.content, isMe)}
                          </div>

                          <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] opacity-75 font-medium">
                            {m.editedAt && <span>(edited)</span>}
                            <span>
                              {new Date(m.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {isMe && (() => {
                              const otherParticipants = activeConv?.participants.filter((p) => p.userId !== currentUserId) || [];
                              const isRead = otherParticipants.length > 0 && otherParticipants.some((p) => p.lastReadAt && new Date(p.lastReadAt) >= new Date(m.createdAt));
                              return (
                                <span
                                  className={`text-xs font-black leading-none ${isRead ? "text-sky-500" : "text-slate-400"}`}
                                  title={isRead ? "Read by recipient(s)" : "Sent"}
                                >
                                  {isRead ? "✓✓" : "✓"}
                                </span>
                              );
                            })()}
                          </div>

                          {/* Hover Actions */}
                          {!isDeleted && (
                            <div className="absolute top-1 right-2 hidden group-hover:flex items-center gap-0.5 bg-white p-1 rounded-xl shadow-md border border-slate-200 z-10 animate-in fade-in duration-100">
                              {/* Quick Reaction Bar */}
                              <div className="flex items-center gap-0.5 border-r border-slate-200/80 pr-1 mr-0.5">
                                {["👍", "❤️", "😂", "🎉", "🙏"].map((emoji) => {
                                  const userReacted = Boolean(m.reactions?.[emoji]?.some((u) => u.userId === currentUserId));
                                  return (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => handleReact(m.id, emoji)}
                                      className={`w-6 h-6 rounded-md text-xs flex items-center justify-center transition-all hover:scale-125 cursor-pointer ${userReacted ? "bg-orange-100 scale-110" : "hover:bg-slate-100"
                                        }`}
                                      title={`React with ${emoji}`}
                                    >
                                      {emoji}
                                    </button>
                                  );
                                })}
                                {/* Add Smiley / Custom Reaction Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReactionPickerMsgId(reactionPickerMsgId === m.id ? null : m.id);
                                    setShowFullReactionPicker(false);
                                  }}
                                  className={`w-6 h-6 rounded-md text-xs flex items-center justify-center transition-all hover:scale-110 cursor-pointer ${reactionPickerMsgId === m.id ? "bg-orange-100 text-orange-600" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                    }`}
                                  title="Add smiley or reaction"
                                >
                                  <Smile size={13} />
                                </button>
                              </div>

                              {/* Reply */}
                              <button
                                onClick={() => setReplyingTo(m)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                                title="Reply"
                              >
                                <CornerUpLeft size={14} strokeWidth={2} />
                              </button>
                              {/* Copy */}
                              <button
                                onClick={() => handleCopyMessage(m)}
                                className={`p-1.5 rounded-lg transition-colors ${copyFeedbackId === m.id
                                  ? "text-emerald-600 bg-emerald-50"
                                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                  }`}
                                title={copyFeedbackId === m.id ? "Copied!" : "Copy"}
                              >
                                <Copy size={14} strokeWidth={2} />
                              </button>
                              {/* Forward */}
                              <button
                                onClick={() => {
                                  setForwardingMsg(m);
                                  setForwardTargetId(null);
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title="Forward"
                              >
                                <Forward size={14} strokeWidth={2} />
                              </button>
                              {/* Edit (own messages only) */}
                              {isMe && (
                                <button
                                  onClick={() => {
                                    setEditingMsg(m);
                                    setMsgInput(m.content);
                                  }}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                  title="Edit"
                                >
                                  <Pencil size={14} strokeWidth={2} />
                                </button>
                              )}
                              {/* Delete (own or Admin) */}
                              {(isMe || session.user.role === "ADMIN") && (
                                <button
                                  onClick={() => handleDeleteMessage(m.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={14} strokeWidth={2} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Reaction Badges Below Message Bubble */}
                        {m.reactions && Object.keys(m.reactions).length > 0 && (
                          <div className={`flex flex-wrap gap-1 mt-1 px-1 ${isMe ? "justify-end" : "justify-start"}`}>
                            {Object.entries(m.reactions).map(([emoji, users]) => {
                              if (!users || users.length === 0) return null;
                              const userReacted = users.some((u) => u.userId === currentUserId);
                              const tooltipText = users.map((u) => (u.userId === currentUserId ? "You" : u.userName)).join(", ");

                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => handleReact(m.id, emoji)}
                                  title={tooltipText}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95 ${userReacted
                                    ? "bg-orange-50 border-orange-300 text-orange-700"
                                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                                    }`}
                                >
                                  <span>{emoji}</span>
                                  <span className="text-[10px] text-slate-500">{users.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Typing Indicator */}
                {partnerUser && typingUsers.has(partnerUser.id) && (
                  <p className="px-6 text-[11px] text-orange-600 font-semibold italic animate-pulse pb-1">
                    {partnerUser.name} is typing...
                  </p>
                )}

                {/* Message Composer with Attachment Button (📎) and Clipboard Paste Support */}
                <div
                  onPaste={handlePaste}
                  className="p-2 bg-white border-t border-slate-200/80 space-y-2 flex-shrink-0"
                >
                  {/* Reply Banner */}
                  {replyingTo && (
                    <div className="flex items-center justify-between bg-orange-50 border border-orange-200 px-1.5 py-1.5 rounded-xl text-xs">
                      <span className="text-orange-800 truncate">
                        Replying to <strong>{replyingTo.sender.name}</strong>: "{replyingTo.content}"
                      </span>
                      <button
                        onClick={() => setReplyingTo(null)}
                        className="text-orange-600 font-bold ml-2"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Uploading Progress Indicator */}
                  {isUploadingAttachment && (
                    <div className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl text-xs border border-slate-200 animate-pulse shadow-2xs">
                      <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                      <span className="font-semibold text-[11px]">Uploading attachment...</span>
                    </div>
                  )}

                  {/* Compact Smart Icon / Thumbnail Chip Preview */}
                  {attachmentUrl && !isUploadingAttachment && (
                    <div className="inline-flex items-center gap-2.5 bg-slate-50 text-slate-800 pl-2 pr-3 py-1.5 rounded-xl text-xs shadow-2xs border border-slate-200 animate-fade-in">
                      {attachmentType === "IMAGE" ? (
                        <img
                          src={attachmentUrl}
                          alt="Pasted Attachment"
                          className="w-7 h-7 object-cover rounded-lg border border-slate-200 shadow-2xs shrink-0"
                        />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-slate-700 shrink-0 border border-slate-200 shadow-2xs">
                          {attachmentType === "LINK" ? <Link2 size={13} strokeWidth={2.2} /> : <FileText size={13} strokeWidth={2.2} />}
                        </span>
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-[11px] max-w-[170px] truncate leading-tight text-slate-800">
                          {attachmentFileName || "Attached File"}
                        </span>
                        {attachmentType === "IMAGE" && (
                          <span className="text-[9px] text-emerald-600 font-semibold leading-tight">
                            Image ready to send
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachmentUrl("");
                          setAttachmentFileName("");
                        }}
                        className="w-5 h-5 rounded-full bg-slate-200 hover:bg-rose-500 text-slate-600 hover:text-white font-black text-[10px] flex items-center justify-center transition-colors ml-1 shadow-2xs cursor-pointer shrink-0"
                        title="Remove attachment"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleSendMessage} onPaste={handlePaste} className="flex items-center gap-2 sm:gap-3 relative">
                    {/* Emoji Picker Popover */}
                    {showEmojiPicker && (
                      <div ref={emojiPickerRef} className="absolute bottom-16 right-4 sm:right-14 z-50 shadow-2xl rounded-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
                        <EmojiPicker
                          onEmojiClick={handleEmojiClick}
                          autoFocusSearch={false}
                          width={320}
                          height={390}
                          lazyLoadEmojis={true}
                          searchPlaceHolder="Search emojis..."
                        />
                      </div>
                    )}

                    {/* Input Field (Pill Shape) */}
                    <textarea
                      ref={textareaRef}
                      rows={1}
                      placeholder="Type a message..."
                      value={msgInput}
                      onChange={(e) => {
                        handleInputChange(e as any);
                        e.target.style.height = "auto";
                        e.target.style.height = e.target.value
                          ? `${Math.min(e.target.scrollHeight, 120)}px`
                          : "44px";
                      }}
                      onPaste={handlePaste}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(e as any);
                        }
                      }}
                      className="chat-composer-textarea flex-1 min-h-[44px] max-h-32 py-2.5 px-5 text-xs sm:text-[13px] bg-slate-50/80 hover:bg-slate-50 focus:bg-white border border-slate-200/90 focus:border-orange-500 rounded-full focus:outline-none focus:ring-4 focus:ring-orange-500/10 text-slate-900 font-medium !resize-none overflow-y-auto no-scrollbar leading-relaxed transition-all placeholder:text-slate-400 shadow-2xs"
                    />

                    {/* Attachment Popover Trigger */}
                    <div ref={attachmentMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAttachmentMenu(!showAttachmentMenu);
                          setShowEmojiPicker(false);
                        }}
                        className="w-10 h-10 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors cursor-pointer shrink-0"
                        title="Attach File or Link"
                      >
                        <Paperclip size={21} strokeWidth={2} />
                      </button>

                      {showAttachmentMenu && (
                        <div className="absolute bottom-14 right-0 z-50 w-56 rounded-2xl border border-slate-200/90 bg-white p-2 shadow-xl shadow-slate-900/10">
                          <button
                            type="button"
                            onClick={() => {
                              fileInputRef.current?.click();
                              setShowAttachmentMenu(false);
                            }}
                            className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-slate-50 cursor-pointer"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                              <ImageIcon size={17} strokeWidth={2} />
                            </span>

                            <div className="min-w-0">
                              <p className="text-[12px] font-semibold leading-4 text-slate-800">
                                Image / Document
                              </p>
                              <p className="text-[10px] leading-4 text-slate-400">
                                PNG, JPG, PDF, DOCX
                              </p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setShowAttachmentMenu(false);
                              handleAddLinkPrompt();
                            }}
                            className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-slate-50 cursor-pointer"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                              <Link2 size={17} strokeWidth={2} />
                            </span>

                            <div className="min-w-0">
                              <p className="text-[12px] font-semibold leading-4 text-slate-800">
                                Web Link
                              </p>
                              <p className="text-[10px] leading-4 text-slate-400">
                                Paste document or web link
                              </p>
                            </div>
                          </button>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </div>

                    {/* Smiley / Emoji Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmojiPicker(!showEmojiPicker);
                        setShowAttachmentMenu(false);
                      }}
                      className={`w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer shrink-0 ${showEmojiPicker ? "bg-slate-100 text-slate-900 ring-2 ring-slate-300" : ""
                        }`}
                      title="Insert Emoji"
                    >
                      <Smile size={21} strokeWidth={2} />
                    </button>

                    {/* Send Button (Solid Orange Circle with Paper Plane) */}
                    <button
                      type="submit"
                      disabled={isUploadingAttachment}
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all shadow-md shadow-orange-500/25 shrink-0 cursor-pointer"
                      title={editingMsg ? "Update Message" : "Send Message"}
                    >
                      <Send size={17} strokeWidth={2.4} className="text-white translate-x-px" />
                    </button>
                  </form>
                </div>
              </>
            ) : activeTab === "calls" ? (
              <div className="flex-1 flex flex-col h-full min-h-0 bg-white">
                {/* Call History Header */}
                <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-slate-100 shrink-0">
                  <div>
                    <h2 className="text-base font-black text-slate-900">Call History</h2>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                      {callLogs.length > 0 ? `${callLogs.length} call${callLogs.length !== 1 ? "s" : ""} recorded` : "No calls yet"}
                    </p>
                  </div>
                  {callLogs.length > 0 && (
                    <button
                      onClick={handleClearAllCalls}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 active:scale-95 px-3 py-1.5 text-xs font-semibold transition cursor-pointer shadow-2xs"
                      title="Clear all call logs"
                    >
                      <Trash2 size={13} />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>

                {/* Call Log List */}
                <div className="flex-1 overflow-y-auto">
                  {loadingCalls ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
                      <p className="text-xs text-slate-400 font-medium animate-pulse">Loading call history…</p>
                    </div>
                  ) : filteredCallLogs.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {filteredCallLogs.map((call) => {
                        const isCaller = call.host.id === currentUserId;
                        const otherPerson = isCaller
                          ? call.participants[0]?.user || { id: 0, name: "Participant" }
                          : call.host;
                        const isMissed = call.status === "MISSED" || call.status === "REJECTED";
                        const callDate = new Date(call.createdAt);
                        const today = new Date();
                        const isToday = callDate.toDateString() === today.toDateString();
                        const displayDate = isToday
                          ? callDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : callDate.toLocaleDateString([], { month: "short", day: "numeric" });

                        return (
                          <div
                            key={call.id}
                            className="flex items-center justify-between gap-3 px-5 sm:px-7 py-3.5 hover:bg-slate-50/70 transition-colors group"
                          >
                            {/* Icon */}
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${call.type === "VIDEO"
                              ? "bg-orange-50 text-orange-600 border border-orange-200/60"
                              : isMissed
                                ? "bg-slate-100 text-slate-400 border border-slate-200"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                              }`}>
                              {call.type === "VIDEO" ? <Video size={16} /> : <Phone size={15} />}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={`text-sm font-bold truncate ${isMissed ? "text-slate-400" : "text-slate-900"}`}>
                                  {otherPerson.name}
                                </p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold shrink-0 ${isMissed
                                  ? "bg-slate-100 text-slate-500"
                                  : "bg-slate-100 text-slate-600"
                                  }`}>
                                  {call.status}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                                {isCaller ? (
                                  <PhoneOutgoing size={11} className="text-slate-400 shrink-0" />
                                ) : isMissed ? (
                                  <PhoneMissed size={11} className="text-slate-400 shrink-0" />
                                ) : (
                                  <PhoneIncoming size={11} className="text-slate-400 shrink-0" />
                                )}
                                <span>{isCaller ? "Outgoing" : "Incoming"}</span>
                                <span className="text-slate-300">•</span>
                                <span>{call.type === "VIDEO" ? "Video" : "Voice"}</span>
                                <span className="text-slate-300">•</span>
                                <span>{displayDate}</span>
                              </p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleDirectCallEmployee(otherPerson.id, otherPerson.name, "AUDIO")}
                                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
                                title={`Voice call ${otherPerson.name}`}
                              >
                                <Phone size={14} />
                              </button>
                              <button
                                onClick={() => handleDirectCallEmployee(otherPerson.id, otherPerson.name, "VIDEO")}
                                className="p-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all cursor-pointer"
                                title={`Video call ${otherPerson.name}`}
                              >
                                <Video size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteCallLog(call.id)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition-all cursor-pointer"
                                title="Remove log"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-8">
                      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                        <PhoneCall size={28} className="text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700">No Call History</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Your voice and video calls will appear here.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === "groups" ? (
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900">Team Groups</h2>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      Collaborate across departments, project channels, and teams
                    </p>
                  </div>
                  <button
                    onClick={handleOpenCreateGroupModal}
                    className="self-start sm:self-auto px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-xs rounded-xl shadow-sm transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus size={15} />
                    <span>Create New Group</span>
                  </button>
                </div>

                {groupConversations.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                    {groupConversations.map((grp) => (
                      <div
                        key={grp.id}
                        onClick={() => setActiveConv(grp)}
                        className="p-4 bg-white hover:bg-orange-50/30 rounded-2xl border border-slate-200/80 hover:border-orange-200 transition-all cursor-pointer shadow-2xs flex flex-col justify-between space-y-3 group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-slate-900 text-orange-400 flex items-center justify-center font-black shadow-xs shrink-0">
                              <Users size={19} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-xs font-black text-slate-900 group-hover:text-orange-950 truncate">
                                {grp.name}
                              </h3>
                              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                                {grp.participants.length} members
                              </p>
                            </div>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate line-clamp-1">
                          {grp.lastMessage?.content || "No group messages yet"}
                        </p>
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-orange-600 font-bold">
                          <span>Open Group Chat</span>
                          <span>→</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-3xl border border-slate-200/80 p-8 sm:p-12 text-center space-y-4 max-w-md mx-auto shadow-2xs">
                    <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-500 border border-orange-200/60 flex items-center justify-center mx-auto text-2xl">
                      👥
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900">No Groups Created Yet</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Bring your team members together by setting up your first project or department channel.
                      </p>
                    </div>
                    <button
                      onClick={handleOpenCreateGroupModal}
                      className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                    >
                      + Create Group Channel
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
                <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-4xl shadow-xs">
                  💬
                </div>
                <h3 className="text-base font-black text-slate-800">Select a Conversation</h3>
                <p className="text-xs text-slate-500 max-w-xs">
                  Choose a colleague from the left panel to start messaging, share files, and place calls.
                </p>
              </div>
            )}
          </div>

          {/* Modular "+ New Group" Creation Modal */}
          {showGroupModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6">
              <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="messenger-modal-header relative shrink-0 overflow-hidden px-5 py-5 text-white sm:px-6">
                  <div className="pointer-events-none absolute -right-8 -top-20 h-48 w-48 rounded-full border border-white/10" />
                  <div className="relative flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/15 text-white">
                        <Users size={19} />
                      </span>
                      <div>
                        <h2 className="text-base font-black">
                          {editingGroupId ? "Manage group members" : "Create a team group"}
                        </h2>
                        <p className="mt-1 max-w-lg text-xs text-orange-50">
                          {editingGroupId
                            ? "Update the people who can participate in this team conversation."
                            : "Give your group a name and choose the employees who should be part of the conversation."}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowGroupModal(false)}
                      aria-label="Close group dialog"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-orange-50 transition hover:bg-white/15 hover:text-white"
                    >
                      <X size={17} />
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSaveGroupSubmit} className="flex min-h-0 flex-1 flex-col">
                  <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 sm:p-6 md:grid-cols-[0.85fr_1.15fr]">
                    <div className="space-y-5">
                      {!editingGroupId && (
                        <div>
                          <label htmlFor="chat-group-name" className="!mt-0 !mb-2 !block text-xs font-bold text-slate-800">
                            Group name <span className="text-rose-500">*</span>
                          </label>
                          <input
                            id="chat-group-name"
                            type="text"
                            placeholder="e.g. Frontend Engineering"
                            value={groupName}
                            onChange={(e) => {
                              setGroupName(e.target.value);
                              setGroupSubmitError(null);
                            }}
                            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
                            required
                            autoFocus
                          />
                          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                            Use a name that makes the purpose of this group easy to recognize.
                          </p>
                        </div>
                      )}

                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-slate-800">Your group</p>
                            <p className="mt-1 text-[11px] text-slate-500">You’ll be included automatically.</p>
                          </div>
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#172554] text-sm font-bold text-white">
                            {session.user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-xl border border-orange-100 bg-orange-50/70 p-4">
                        <div className="flex items-center gap-2 text-orange-700">
                          <UserPlus size={15} />
                          <span className="text-xs font-bold">Selected employees</span>
                          <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-orange-700">
                            {selectedParticipantIds.length}
                          </span>
                        </div>
                        {selectedParticipantIds.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {employees
                              .filter((employee) => selectedParticipantIds.includes(employee.id))
                              .map((employee) => (
                                <span key={employee.id} className="rounded-full border border-orange-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700">
                                  {employee.name}
                                </span>
                              ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-[11px] text-slate-500">Add employees to bring teammates into this conversation.</p>
                        )}
                      </div>
                    </div>

                    <div className="flex min-h-[300px] flex-col">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-xs font-bold text-slate-800">Add employees</h3>
                          <p className="mt-0.5 text-[11px] text-slate-500">Select the teammates who need access.</p>
                        </div>
                        <span className="shrink-0 text-[10px] font-semibold text-slate-400">
                          {employees.filter((employee) => employee.id !== currentUserId).length} available
                        </span>
                      </div>
                      <div className="relative mb-2 flex items-center">
                        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
                        <input
                          type="search"
                          value={groupMemberSearch}
                          onChange={(e) => setGroupMemberSearch(e.target.value)}
                          placeholder="Search by employee name or email"
                          aria-label="Search employees"
                          style={{ paddingLeft: "40px" }}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white !pl-10 pr-3 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-500/10"
                        />
                      </div>
                      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-2">
                        {employees
                          .filter((employee) => employee.id !== currentUserId)
                          .filter((employee) => `${employee.name} ${employee.email}`.toLowerCase().includes(groupMemberSearch.trim().toLowerCase()))
                          .map((emp) => {
                            const isSelected = selectedParticipantIds.includes(emp.id);
                            return (
                              <label
                                key={emp.id}
                                className={`!mt-0 !flex cursor-pointer items-center !gap-3 rounded-xl border p-2.5 transition ${isSelected
                                  ? "border-orange-200 bg-orange-50"
                                  : "border-transparent bg-white hover:border-slate-200 hover:bg-white"
                                  }`}
                              >
                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isSelected ? "bg-orange-500 text-white" : "bg-[#172554] text-white"
                                  }`}>
                                  {emp.name.charAt(0).toUpperCase()}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-bold text-slate-800">{emp.name}</span>
                                  <span className="mt-0.5 block truncate text-[10px] text-slate-500">{emp.email}</span>
                                </span>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    setSelectedParticipantIds((prev) =>
                                      isSelected ? prev.filter((id) => id !== emp.id) : [...prev, emp.id]
                                    );
                                    setGroupSubmitError(null);
                                  }}
                                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                                />
                              </label>
                            );
                          })}
                        {employees.filter((employee) =>
                          employee.id !== currentUserId &&
                          `${employee.name} ${employee.email}`.toLowerCase().includes(groupMemberSearch.trim().toLowerCase())
                        ).length === 0 && (
                            <p className="px-3 py-8 text-center text-xs text-slate-500">No employees match your search.</p>
                          )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 bg-white px-4 py-3 sm:px-6">
                    {groupSubmitError && (
                      <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                        {groupSubmitError}
                      </p>
                    )}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[11px] text-slate-500">
                        {selectedParticipantIds.length
                          ? `${selectedParticipantIds.length} employee${selectedParticipantIds.length === 1 ? "" : "s"} selected`
                          : "You can add employees now or invite them later"}
                      </p>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowGroupModal(false)}
                          className="rounded-lg px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={creatingGroup}
                          className="rounded-lg bg-orange-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {creatingGroup ? "Saving..." : editingGroupId ? "Save members" : "Create group"}
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}
          {/* ── Forward Message Modal ─────────────────────────────── */}
          {forwardingMsg && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
              <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Forward Message</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-xs">
                      &quot;{forwardingMsg.content.length > 60 ? forwardingMsg.content.slice(0, 57) + "..." : forwardingMsg.content}&quot;
                    </p>
                  </div>
                  <button
                    onClick={() => { setForwardingMsg(null); setForwardTargetId(null); }}
                    className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all"
                  >
                    <X size={15} strokeWidth={2} />
                  </button>
                </div>

                {/* Conversation List */}
                <div className="flex-1 overflow-y-auto max-h-72 divide-y divide-slate-50 p-2">
                  {conversations
                    .filter((c) => c.id !== activeConv?.id)
                    .map((conv) => {
                      const isGrp = conv.type === "GROUP";
                      const partner = !isGrp
                        ? conv.participants.find((p) => p.userId !== currentUserId)?.user
                        : null;
                      const isSelected = forwardTargetId === conv.id;
                      return (
                        <button
                          key={conv.id}
                          onClick={() => setForwardTargetId(conv.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${isSelected
                            ? "bg-blue-50 border border-blue-200"
                            : "hover:bg-slate-50 border border-transparent"
                            }`}
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 ${isGrp ? "bg-slate-900 text-orange-400" : "bg-slate-800 text-white"
                            }`}>
                            {isGrp ? <Users size={16} /> : partner?.name.charAt(0).toUpperCase() || "E"}
                          </div>
                          <div className="truncate">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {isGrp ? conv.name : partner?.name || "Employee"}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {isGrp ? `${conv.participants.length} members` : partner?.email}
                            </p>
                          </div>
                          {isSelected && (
                            <span className="ml-auto w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                              <span className="text-white text-[9px] font-black">✓</span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  {conversations.filter((c) => c.id !== activeConv?.id).length === 0 && (
                    <p className="py-8 text-center text-xs text-slate-400">No other conversations available.</p>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/60">
                  <button
                    onClick={() => { setForwardingMsg(null); setForwardTargetId(null); }}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleForwardMessage}
                    disabled={!forwardTargetId || forwardLoading}
                    className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <Forward size={13} strokeWidth={2} />
                    {forwardLoading ? "Forwarding..." : "Forward"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div >
    </main >
  );
}
