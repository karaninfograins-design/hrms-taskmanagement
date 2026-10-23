"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Settings2, Phone, Video, Trash2, X, Users, Search, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getAuthToken } from "@/lib/auth";
import { getApiUrl } from "@/lib/api-config";

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

export default function DirectChatsPage() {
  return (
    <Suspense fallback={<main className="route-loading">Loading Messenger...</main>}>
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
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [typingUsers, setTypingUsers] = useState<Set<number>>(new Set());

  // Attachments State
  const [attachmentUrl, setAttachmentUrl] = useState<string>("");
  const [attachmentFileName, setAttachmentFileName] = useState<string>("");
  const [attachmentType, setAttachmentType] = useState<"IMAGE" | "DOCUMENT" | "LINK">("IMAGE");
  const [showAttachmentMenu, setShowAttachmentMenu] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (!res.ok) return;
      const data = await res.json();
      setEmployees(data.employees || []);
    } catch (err) {
      console.error("Error fetching employees:", err);
    }
  };

  // Fetch all user conversations (Direct + Group)
  const fetchConversations = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/messenger/conversations`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setLoading(false);
    }
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

    socket.on("message:new", onNewMessage);
    socket.on("conversation:updated", onConversationUpdated);
    socket.on("conversation:members-updated", onGroupMembersUpdated);
    socket.on("conversation:deleted", onConversationDeleted);
    socket.on("user:typing", onUserTyping);
    socket.on("user:stop_typing", onUserStopTyping);

    return () => {
      socket.off("message:new", onNewMessage);
      socket.off("conversation:updated", onConversationUpdated);
      socket.off("conversation:members-updated", onGroupMembersUpdated);
      socket.off("conversation:deleted", onConversationDeleted);
      socket.off("user:typing", onUserTyping);
      socket.off("user:stop_typing", onUserStopTyping);
    };
  }, [socket]);

  // Delete Conversation Handler (Direct or Group)
  const handleDeleteConversation = async (conversationId: number) => {
    const conv = conversations.find((c) => c.id === conversationId);
    const label = conv?.type === "GROUP" ? `group "${conv.name}"` : "this conversation";
    if (!confirm(`Are you sure you want to delete ${label}? All messages and media will be permanently deleted.`)) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/messenger/conversations/${conversationId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) {
        alert("Failed to delete chat");
        return;
      }
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConv?.id === conversationId) {
        setActiveConv(null);
        setMessages([]);
      }
    } catch (err) {
      console.error("Error deleting conversation:", err);
      alert("Error deleting conversation");
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
      if (!res.ok) return;
      const data = await res.json();
      await fetchConversations();
      setActiveConv(data.conversation);
    } catch (err) {
      console.error("Error starting direct chat:", err);
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
      }
      setShowGroupModal(false);
      setGroupName("");
      setSelectedParticipantIds([]);
      setEditingGroupId(null);
    } catch (err) {
      setGroupSubmitError(err instanceof Error ? err.message : "Unable to save the group. Please try again.");
    } finally {
      setCreatingGroup(false);
    }
  };

  // Handle Attachment Upload to backend storage
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        } catch (err: any) {
          console.error("Upload error:", err);
          alert("Failed to upload file to server storage");
        }
      }
    };
    reader.readAsDataURL(file);
    setShowAttachmentMenu(false);
  };

  const handleAddLinkPrompt = () => {
    const link = prompt("Enter Web URL / Document Link:");
    if (link && link.trim()) {
      setAttachmentUrl(link.trim());
      setAttachmentFileName(link.trim().replace(/^https?:\/\//, ""));
      setAttachmentType("LINK");
      setShowAttachmentMenu(false);
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
        }
      } catch (err) {
        console.error("Error editing message:", err);
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
        setAttachmentUrl("");
        setReplyingTo(null);
        fetchConversations();
      }
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  // Soft Delete Message
  const handleDeleteMessage = async (msgId: number) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
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
      }
    } catch (err) {
      console.error("Error deleting message:", err);
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
            alert(result?.error || "Unable to start the group call");
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
          alert(result?.error || "Unable to start the call");
          return;
        }
        const params = new URLSearchParams({
          activeChannel: channelName,
          target: String(targetUserId),
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
            className={`w-full md:w-80 lg:w-96 border-r border-slate-200/80 bg-white flex flex-col h-full shadow-xs transition-all ${activeConv ? "hidden md:flex" : "flex"
              }`}
          >
            {/* Sidebar Top Controls: Header + "+ New Group" Button */}
            <div className="space-y-3 border-b border-orange-100 bg-gradient-to-r from-orange-50/80 via-white to-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-700">Team communication</span>
                  <h2 className="mt-0.5 text-lg font-black leading-tight text-slate-900">Messages &amp; Team</h2>
                </div>

                {/* Prominent "+ New Group" Button */}
                <button
                  onClick={handleOpenCreateGroupModal}
                  className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-orange-600"
                >
                  + New Group
                </button>
              </div>

              {/* Working Contact & Chat Search Bar */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search contacts or groups..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-slate-900 font-medium placeholder-slate-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Conversation & Contact Directory List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {loading ? (
                <div className="p-6 text-center text-xs text-slate-400 animate-pulse font-medium">
                  Loading workspace messaging...
                </div>
              ) : (
                <>
                  {/* Active Conversations (Direct & Group) */}
                  {filteredConversations.length > 0 && (
                    <div className="p-2 space-y-1">
                      <p className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Active Chats & Groups ({filteredConversations.length})
                      </p>
                      {filteredConversations.map((conv) => {
                        const isGrp = conv.type === "GROUP";
                        const partner = !isGrp
                          ? conv.participants.find((p) => p.userId !== currentUserId)?.user
                          : null;
                        const isOnline = partner ? onlineUserIds.includes(partner.id) : false;
                        const isSelected = activeConv?.id === conv.id;

                        return (
                          <div
                            key={conv.id}
                            onClick={() => setActiveConv(conv)}
                            className={`p-3 rounded-2xl cursor-pointer transition-all flex items-center justify-between group ${isSelected
                              ? "bg-orange-50 border border-orange-200/80 shadow-xs"
                              : "hover:bg-slate-50"
                              }`}
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="relative flex-shrink-0">
                                <div
                                  className={`w-10 h-10 rounded-2xl font-black text-xs flex items-center justify-center shadow-xs ${isGrp
                                    ? "bg-slate-900 text-orange-400"
                                    : "bg-slate-800 text-white"
                                    }`}
                                >
                                  {isGrp
                                    ? "👥"
                                    : partner?.name.charAt(0).toUpperCase() || "E"}
                                </div>
                                {!isGrp && (
                                  <span
                                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${isOnline ? "bg-emerald-500" : "bg-slate-300"
                                      }`}
                                  />
                                )}
                              </div>
                              <div className="truncate">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-black text-slate-900 truncate">
                                    {isGrp ? conv.name : partner?.name || "Employee"}
                                  </p>
                                  {isGrp && (
                                    <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md font-bold">
                                      {conv.participants.length} members
                                    </span>
                                  )}
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
                                title="Delete chat"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Contact Directory (Auto-listed for all Users/Admins) */}
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
              )}
            </div>
          </div>

          {/* Active Chat Window */}
          <div
            className={`flex-1 bg-slate-50/50 flex-col h-full transition-all ${activeConv ? "flex" : "hidden md:flex"
              }`}
          >
            {activeConv ? (
              <>
                {/* Chat Header with PROMINENT BACK BUTTON */}
                <div className="flex h-16 flex-shrink-0 items-center justify-between border-t-2 border-t-orange-500 border-b border-slate-200/80 bg-white px-4 shadow-sm sm:px-6">
                  <div className="flex items-center gap-3">

                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div
                          className={`w-10 h-10 rounded-2xl font-black text-sm flex items-center justify-center ${!isDirect
                            ? "bg-slate-900 text-orange-400"
                            : "bg-slate-800 text-white"
                            }`}
                        >
                          {!isDirect
                            ? "👥"
                            : partnerUser?.name.charAt(0).toUpperCase() || "E"}
                        </div>
                        {isDirect && (
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${isPartnerOnline ? "bg-emerald-500" : "bg-slate-300"
                              }`}
                          />
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900">
                          {!isDirect ? activeConv.name : partnerUser?.name}
                        </h3>
                        <p className="text-[11px] text-slate-500 font-medium">
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
                  <div className="flex items-center gap-1.5">
                    {!isDirect && (
                      <button
                        onClick={() => handleOpenManageMembersModal(activeConv)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                        title="Manage group members"
                        aria-label="Manage group members"
                      >
                        <Settings2 size={16} strokeWidth={2} />
                      </button>
                    )}
                    <button
                      onClick={() => handleInitiateCall("AUDIO")}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-orange-100 text-slate-600 hover:text-orange-700 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                      title="Audio call"
                    >
                      <Phone size={13} strokeWidth={2} />

                    </button>
                    <button
                      onClick={() => handleInitiateCall("VIDEO")}
                      className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs"
                      title="Video call"
                    >
                      <Video size={13} strokeWidth={2} />

                    </button>
                    <button
                      onClick={() => handleDeleteConversation(activeConv.id)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-600 text-rose-500 hover:text-white rounded-xl text-xs font-semibold transition-all border border-rose-200 flex items-center gap-1.5 cursor-pointer"
                      title={isDirect ? "Delete chat conversation" : "Delete group conversation"}
                    >
                      <Trash2 size={13} strokeWidth={2} />

                    </button>
                    <button
                      onClick={() => setActiveConv(null)}
                      className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-all border border-slate-200/60"
                      title="Close"
                    >
                      <X size={15} strokeWidth={2} />
                    </button>
                  </div>
                </div>

                {/* Messages Feed */}
                <div className="flex-1 space-y-4 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-50/40 via-slate-50/70 to-slate-100/70 p-4 sm:p-6">
                  {messages.length === 0 && (
                    <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
                      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-100 bg-white text-2xl shadow-sm">
                        💬
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
                        className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-slate-400">
                            {m.sender.name}
                          </span>
                        </div>
                        <div
                          className={`max-w-md p-3.5 rounded-2xl text-xs shadow-2xs relative group transition-all ${isMe
                            ? "bg-orange-50/90 border border-orange-200/90 text-slate-900 font-medium rounded-br-xs"
                            : "bg-white text-slate-800 border border-slate-200/90 font-medium rounded-bl-xs"
                            }`}
                        >
                          {/* Reply Quote */}
                          {m.replyTo && (
                            <div className="mb-2 p-2 rounded-xl bg-slate-800/20 border-l-2 border-orange-500 text-[11px] italic">
                              <p className="font-bold">{m.replyTo.sender.name}:</p>
                              <p className="truncate">{m.replyTo.content}</p>
                            </div>
                          )}

                          {/* Attachment Display with Hover Download Action */}
                          {m.attachmentUrl && !isDeleted && (
                            <div className="my-2 relative group/att overflow-hidden rounded-2xl border border-slate-200/40 shadow-xs">
                              {m.attachmentType === "IMAGE" ? (
                                <div className="relative">
                                  <img
                                    src={m.attachmentUrl}
                                    alt="Attachment"
                                    className="max-w-xs max-h-60 rounded-2xl object-cover"
                                  />
                                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover/att:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2 backdrop-blur-xs">
                                    <a
                                      href={m.attachmentUrl}
                                      download="attached-image"
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition-all"
                                    >
                                      📥 Download Image
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700 text-orange-300 text-xs font-bold flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="text-base">
                                      {m.attachmentType === "LINK" ? "🔗" : "📄"}
                                    </span>
                                    <span className="truncate max-w-[180px]">
                                      {m.attachmentUrl.length > 40
                                        ? m.attachmentUrl.slice(0, 35) + "..."
                                        : m.attachmentUrl}
                                    </span>
                                  </div>
                                  <a
                                    href={m.attachmentUrl}
                                    download="attached-file"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-[11px] font-black transition-all flex items-center gap-1 flex-shrink-0 shadow-xs"
                                  >
                                    📥 Download
                                  </a>
                                </div>
                              )}
                            </div>
                          )}

                          <p className={`whitespace-pre-wrap ${isDeleted ? "italic opacity-60" : ""}`}>
                            {m.content}
                          </p>

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
                            <div className="absolute top-1 right-2 hidden group-hover:flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl shadow-md border border-slate-200 dark:border-slate-700">
                              <button
                                onClick={() => setReplyingTo(m)}
                                className="px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:text-orange-600"
                                title="Reply"
                              >
                                ↩️
                              </button>
                              {isMe && (
                                <button
                                  onClick={() => {
                                    setEditingMsg(m);
                                    setMsgInput(m.content);
                                  }}
                                  className="px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:text-blue-600"
                                  title="Edit"
                                >
                                  ✏️
                                </button>
                              )}
                              {(isMe || session.user.role === "ADMIN") && (
                                <button
                                  onClick={() => handleDeleteMessage(m.id)}
                                  className="px-1.5 py-0.5 text-[10px] font-bold text-rose-600"
                                  title="Delete"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          )}
                        </div>
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

                {/* Message Composer with Attachment Button (📎) */}
                <div className="p-4 bg-white border-t border-slate-200/80 space-y-2 flex-shrink-0">
                  {/* Reply Banner */}
                  {replyingTo && (
                    <div className="flex items-center justify-between bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-xl text-xs">
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

                  {/* Compact Smart Icon Chip Preview */}
                  {attachmentUrl && (
                    <div className="inline-flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-2xl text-xs shadow-md border border-slate-700 animate-fade-in">
                      <span className="text-sm">
                        {attachmentType === "IMAGE" ? "🖼️" : attachmentType === "LINK" ? "🔗" : "📄"}
                      </span>
                      <span className="font-bold text-[11px] max-w-[140px] truncate">
                        {attachmentFileName || "Attached File"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachmentUrl("");
                          setAttachmentFileName("");
                        }}
                        className="w-5 h-5 rounded-full bg-slate-800 hover:bg-rose-500 text-white font-black text-[10px] flex items-center justify-center transition-colors ml-1 shadow-xs"
                        title="Remove attachment"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                    {/* Attachment Popover Trigger */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                        className="w-11 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-base flex items-center justify-center transition-all"
                        title="Attach File or Link"
                      >
                        📎
                      </button>

                      {showAttachmentMenu && (
                        <div className="absolute bottom-14 left-0 z-50 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/10">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm text-slate-600 group-hover:bg-orange-50 group-hover:text-orange-600">
                              🖼️
                            </span>

                            <div className="min-w-0">
                              <p className="text-[12px] font-medium leading-4 text-slate-700">
                                Image / Docs
                              </p>
                              <p className="text-[10px] leading-4 text-slate-400">
                                PNG, JPG, PDF, DOCX
                              </p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={handleAddLinkPrompt}
                            className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600">
                              🔗
                            </span>

                            <div className="min-w-0">
                              <p className="text-[12px] font-medium leading-4 text-slate-700">
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

                    <input
                      type="text"
                      placeholder="Type your message..."
                      value={msgInput}
                      onChange={handleInputChange}
                      className="flex-1 h-11 px-4 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-slate-900 font-medium"
                    />

                    <button
                      type="submit"
                      className="h-11 px-6 bg-[#F97316] hover:bg-[#EA580C] text-white font-extrabold rounded-xl transition-all shadow-xs text-xs flex items-center gap-1.5"
                    >
                      <span>{editingMsg ? "Update" : "Send"}</span>
                      <span>➔</span>
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-4xl mb-4 shadow-xs">
                  💬
                </div>
                <h3 className="text-base font-black text-slate-800">Select Contact for messaging</h3>
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
                      <div className="relative mb-2">
                        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="search"
                          value={groupMemberSearch}
                          onChange={(e) => setGroupMemberSearch(e.target.value)}
                          placeholder="Search by employee name or email"
                          aria-label="Search employees"
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-500/10"
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
                                className={`!mt-0 !flex cursor-pointer items-center !gap-3 rounded-xl border p-2.5 transition ${
                                  isSelected
                                    ? "border-orange-200 bg-orange-50"
                                    : "border-transparent bg-white hover:border-slate-200 hover:bg-white"
                                }`}
                              >
                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                  isSelected ? "bg-orange-500 text-white" : "bg-[#172554] text-white"
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
        </section>
      </div>
    </main>
  );
}
