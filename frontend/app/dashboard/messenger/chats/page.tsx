"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

    socket.on("message:new", onNewMessage);
    socket.on("conversation:updated", onConversationUpdated);
    socket.on("user:typing", onUserTyping);
    socket.on("user:stop_typing", onUserStopTyping);

    return () => {
      socket.off("message:new", onNewMessage);
      socket.off("conversation:updated", onConversationUpdated);
      socket.off("user:typing", onUserTyping);
      socket.off("user:stop_typing", onUserStopTyping);
    };
  }, [socket]);

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
    setShowGroupModal(true);
  };

  const handleOpenManageMembersModal = (conv: Conversation) => {
    setEditingGroupId(conv.id);
    setGroupName(conv.name || "");
    setSelectedParticipantIds(conv.participants.map((p) => p.userId));
    setShowGroupModal(true);
  };

  // Create or Update Group Modal Submission
  const handleSaveGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    setCreatingGroup(true);
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

        if (!res.ok) throw new Error("Failed to update group");
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

        if (!res.ok) throw new Error("Failed to create group");
        const data = await res.json();
        setConversations((prev) => [data.conversation, ...prev]);
        setActiveConv(data.conversation);
      }
      setShowGroupModal(false);
      setGroupName("");
      setSelectedParticipantIds([]);
      setEditingGroupId(null);
    } catch (err: any) {
      alert(err.message || "Error saving group");
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
    const partner = activeConv.participants.find((p) => p.userId !== session?.user.id);
    if (!partner && activeConv.type === "DIRECT") return;

    const targetUserId = partner ? partner.userId : activeConv.participants[0]?.userId;
    const channelName = `call-${Date.now()}`;
    socket.emit("call:initiate", {
      targetUserId,
      conversationId: activeConv.id,
      type,
      channelName,
    });

    router.push(`/dashboard/messenger/calls?activeChannel=${channelName}&target=${targetUserId}&type=${type}`);
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
            <div className="p-4 border-b border-slate-100 space-y-3 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  {/* <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    HRMS COLLABORATION
                  </span> */}
                  <h2 className="text-lg font-black text-slate-900 leading-tight">Messages & Team</h2>
                </div>

                {/* Prominent "+ New Group" Button */}
                <button
                  onClick={handleOpenCreateGroupModal}
                  className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center gap-1.5"
                >
                  <span>👥</span> + New Group
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
                      <p className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">
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

                            {conv.unreadCount ? (
                              <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 shadow-xs">
                                {conv.unreadCount}
                              </span>
                            ) : null}
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
                            + Chat ➔
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
                <div className="h-16 px-6 bg-white border-b border-slate-200/80 flex items-center justify-between shadow-xs flex-shrink-0">
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
                  <div className="flex items-center gap-2">
                    {!isDirect && (
                      <button
                        onClick={() => handleOpenManageMembersModal(activeConv)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-orange-100 text-slate-800 hover:text-orange-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                        title="Add or remove group participants"
                      >
                        ⚙️ Manage team
                      </button>
                    )}
                    <button
                      onClick={() => handleInitiateCall("AUDIO")}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-orange-100 text-slate-800 hover:text-orange-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      📞 Call
                    </button>
                    <button
                      onClick={() => handleInitiateCall("VIDEO")}
                      className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                    >
                      🎥 Video
                    </button>
                    <button
                      onClick={() => setActiveConv(null)}
                      className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-xl text-slate-600 hover:text-slate-900 transition-all border border-slate-200/60"
                      title="Close"
                    >
                      <span className="text-lg font-bold leading-none">×</span>
                    </button>
                  </div>
                </div>

                {/* Messages Feed */}
                <div className="flex-1 p-6 overflow-y-auto space-y-4">
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
                      className="h-11 px-6 bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl transition-all shadow-xs text-xs flex items-center gap-1.5"
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
                <h3 className="text-base font-black text-slate-800">Select a Chat or Contact for messaging</h3>
              </div>
            )}
          </div>

          {/* Modular "+ New Group" Creation Modal */}
          {showGroupModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
              <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200/90 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 font-black text-base flex items-center justify-center">
                      👥
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-slate-900 leading-tight">
                        {editingGroupId ? "Manage Group Members" : "Create Team Group"}
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        {editingGroupId
                          ? "Add or remove member participants for this team group."
                          : "Configure team group name and select member participants."}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowGroupModal(false)}
                    className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs flex items-center justify-center transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveGroupSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                      Group Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Frontend Engineering Sync"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      className="w-full h-10 px-3.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 font-medium text-slate-900"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                        Select Group Members ({selectedParticipantIds.length})
                      </label>
                      <span className="text-[10px] text-slate-400 font-bold">Only members can view group</span>
                    </div>
                    <div className="max-h-52 overflow-y-auto border border-slate-200/80 rounded-2xl p-1.5 divide-y divide-slate-100 space-y-1 bg-slate-50/50">
                      {employees
                        .filter((e) => e.id !== currentUserId)
                        .map((emp) => {
                          const isSelected = selectedParticipantIds.includes(emp.id);
                          return (
                            <label
                              key={emp.id}
                              className={`flex items-center justify-between w-full p-2.5 rounded-2xl cursor-pointer text-xs transition-all ${isSelected
                                ? "bg-orange-50/90 border border-orange-200 shadow-2xs"
                                : "hover:bg-white border border-transparent"
                                }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                                  {emp.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-extrabold text-slate-900 leading-tight truncate">{emp.name}</p>
                                  <p className="text-[10px] text-slate-400 font-medium truncate">{emp.email}</p>
                                </div>
                              </div>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (isSelected) {
                                    setSelectedParticipantIds((prev) =>
                                      prev.filter((id) => id !== emp.id)
                                    );
                                  } else {
                                    setSelectedParticipantIds((prev) => [...prev, emp.id]);
                                  }
                                }}
                                className="w-4.5 h-4.5 text-orange-500 rounded border-slate-300 focus:ring-orange-500 flex-shrink-0 ml-4 cursor-pointer"
                              />
                            </label>
                          );
                        })}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowGroupModal(false)}
                      className="px-4 py-2 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creatingGroup}
                      className="px-4 py-2.5 text-xs bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl shadow-xs disabled:opacity-50 transition-all"
                    >
                      {creatingGroup ? "Saving..." : editingGroupId ? "Save Changes" : "Create Group"}
                    </button>
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
