"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Phone, Video, Users, Search, UserPlus, X, ArrowLeft, Settings2, Send, Smile } from "lucide-react";
import dynamic from "next/dynamic";
import type { EmojiClickData } from "emoji-picker-react";

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
} from "@/lib/swal";

type Employee = {
  id: number;
  name: string;
  email: string;
};

type Message = {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  sender: {
    id: number;
    name: string;
    email: string;
  };
  reactions?: Record<string, Array<{ userId: number; userName: string }>>;
};

type GroupConversation = {
  id: number;
  type: "GROUP";
  name: string;
  createdById: number;
  participants: Array<{
    userId: number;
    role: string;
    user: Employee;
  }>;
};

export default function GroupChatsPage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();
  const { socket } = useSocket();

  const [groups, setGroups] = useState<GroupConversation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeGroup, setActiveGroup] = useState<GroupConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [msgInput, setMsgInput] = useState<string>("");

  // Create Group Modal State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState<string>("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [submittingGroup, setSubmittingGroup] = useState<boolean>(false);
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [groupSubmitError, setGroupSubmitError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Emoji Picker State & Ref
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-adjust composer height and reset cleanly when message is sent or empty
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

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  // Fetch employees
  useEffect(() => {
    if (!session?.token) return;
    fetch(`${getApiUrl()}/api/employees`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load employees");
        return res.json();
      })
      .then((data) => setEmployees(data.employees || []))
      .catch((err) => {
        console.error("Error fetching employees:", err);
        showErrorToast("Could not load employee directory");
      });
  }, [session?.token]);

  // Fetch group conversations
  const fetchGroups = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/messenger/conversations`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) {
        showErrorToast("Failed to load group channels");
        return;
      }
      const data = await res.json();
      const groupConvs = (data.conversations || []).filter(
        (c: GroupConversation) => c.type === "GROUP"
      );
      setGroups(groupConvs);
      if (groupConvs.length > 0 && !activeGroup) {
        setActiveGroup(groupConvs[0]);
      }
    } catch (err) {
      console.error("Error fetching group conversations:", err);
      showErrorToast("Network error loading group channels");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.token) {
      fetchGroups();
    }
  }, [session?.token]);

  // Fetch messages when active group changes
  useEffect(() => {
    if (!activeGroup) return;
    const fetchMessages = async () => {
      try {
        const res = await fetch(
          `${getApiUrl()}/api/messenger/conversations/${activeGroup.id}/messages`,
          { headers: { Authorization: `Bearer ${getAuthToken()}` } }
        );
        if (!res.ok) return;
        const data = await res.json();
        setMessages(data.messages || []);
        if (socket) {
          socket.emit("join:conversation", activeGroup.id);
        }
      } catch (err) {
        console.error("Error fetching group messages:", err);
      }
    };
    fetchMessages();
  }, [activeGroup?.id, socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Real-time listener for deleted groups
  useEffect(() => {
    if (!socket) return;
    const onMembersUpdated = (data: {
      conversationId?: number;
      conversation?: GroupConversation;
      removed?: boolean;
    }) => {
      if (data.removed && data.conversationId) {
        setGroups((prev) => prev.filter((group) => group.id !== data.conversationId));
        if (activeGroup?.id === data.conversationId) {
          setActiveGroup(null);
          setMessages([]);
        }
        return;
      }
      if (!data.conversation) return;

      const updatedGroup = data.conversation;
      setGroups((prev) =>
        prev.map((group) => (group.id === updatedGroup.id ? updatedGroup : group))
      );
      if (activeGroup?.id === updatedGroup.id) {
        setActiveGroup(updatedGroup);
      }
    };
    const onConvDeleted = ({ conversationId }: { conversationId: number }) => {
      setGroups((prev) => prev.filter((g) => g.id !== conversationId));
      if (activeGroup?.id === conversationId) {
        setActiveGroup(null);
        setMessages([]);
      }
    };
    const onNewMessage = (newMsg: Message) => {
      if (activeGroup && newMsg.conversationId === activeGroup.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }
    };
    const onReaction = (data: { messageId: number; conversationId: number; reactions: Record<string, Array<{ userId: number; userName: string }>> }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId ? { ...m, reactions: data.reactions } : m
        )
      );
    };

    socket.on("conversation:members-updated", onMembersUpdated);
    socket.on("conversation:deleted", onConvDeleted);
    socket.on("message:new", onNewMessage);
    socket.on("message:reaction", onReaction);
    return () => {
      socket.off("conversation:members-updated", onMembersUpdated);
      socket.off("conversation:deleted", onConvDeleted);
      socket.off("message:new", onNewMessage);
      socket.off("message:reaction", onReaction);
    };
  }, [socket, activeGroup?.id]);

  // Insert emoji into group composer
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

  // Toggle reaction on group message
  const handleReact = async (messageId: number, emoji: string) => {
    if (!activeGroup || !session?.user?.id) return;
    const currentUserId = Number(session.user.id);
    const currentUserName = session.user.name || "You";

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

    if (socket) {
      socket.emit("message:react", {
        messageId,
        conversationId: activeGroup.id,
        emoji,
      });
    }

    try {
      const token = getAuthToken();
      await fetch(`${getApiUrl()}/api/messenger/messages/${messageId}/react`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ emoji }),
      });
    } catch (err) {
      console.error("Failed to persist reaction:", err);
    }
  };

  // Delete Group Handler
  const handleDeleteGroup = async (groupId: number) => {
    const confirmed = await showConfirmDialog({
      title: "Delete Group Channel?",
      text: "Are you sure you want to delete this group channel? All messages and attachments in this channel will be permanently deleted.",
      confirmButtonText: "Yes, delete",
      confirmButtonColor: "#dc2626",
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/messenger/conversations/${groupId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) {
        showErrorToast("Failed to delete group");
        return;
      }
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (activeGroup?.id === groupId) {
        setActiveGroup(null);
        setMessages([]);
      }
      showSuccessToast("Group channel deleted successfully");
    } catch (err) {
      console.error("Error deleting group:", err);
      showErrorToast("Error deleting group");
    }
  };

  const handleInitiateGroupCall = (type: "AUDIO" | "VIDEO") => {
    if (!activeGroup || !socket) {
      showNotification({
        title: "Calling Notice",
        text: "Unable to connect to calling. Please try again.",
        icon: "warning",
      });
      return;
    }

    const channelName = `call-${Date.now()}`;
    socket.emit(
      "call:initiate",
      {
        targetUserIds: activeGroup.participants
          .map((participant) => participant.userId)
          .filter((participantId) => participantId !== session?.user.id),
        conversationId: activeGroup.id,
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
          groupName: activeGroup.name,
          type,
        });
        router.push(`/dashboard/messenger/calls?${params.toString()}`);
      }
    );
  };

  // Create or update a group and its membership
  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setGroupSubmitError("Enter a group name before saving.");
      return;
    }

    setSubmittingGroup(true);
    setGroupSubmitError(null);
    try {
      const isEditing = editingGroupId !== null;
      const url = isEditing
        ? `${getApiUrl()}/api/messenger/conversations/group/${editingGroupId}`
        : `${getApiUrl()}/api/messenger/conversations/group`;
      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          name: groupName.trim(),
          participantIds: selectedMemberIds,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(
          errorData?.message || `Failed to ${isEditing ? "update" : "create"} group. Please try again.`
        );
      }
      const data = await res.json();
      if (isEditing) {
        setGroups((prev) =>
          prev.map((group) => (group.id === data.conversation.id ? data.conversation : group))
        );
      } else {
        setGroups((prev) => [data.conversation, ...prev]);
      }
      setActiveGroup(data.conversation);
      setShowCreateModal(false);
      setGroupName("");
      setSelectedMemberIds([]);
      setEditingGroupId(null);
      showSuccessToast(isEditing ? "Group channel updated successfully" : "Group channel created successfully");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unable to save the group. Please try again.";
      setGroupSubmitError(errMsg);
      showErrorToast(errMsg);
    } finally {
      setSubmittingGroup(false);
    }
  };

  const handleOpenCreateGroup = () => {
    setEditingGroupId(null);
    setGroupName("");
    setSelectedMemberIds([]);
    setGroupMemberSearch("");
    setGroupSubmitError(null);
    setShowCreateModal(true);
  };

  const handleOpenManageGroup = (group: GroupConversation) => {
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setSelectedMemberIds(group.participants.map((participant) => participant.userId));
    setGroupMemberSearch("");
    setGroupSubmitError(null);
    setShowCreateModal(true);
  };

  // Send Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgInput.trim() || !activeGroup) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/messenger/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          conversationId: activeGroup.id,
          content: msgInput.trim(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setMsgInput("");
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      } else {
        showErrorToast("Failed to send message");
      }
    } catch (err) {
      console.error("Error sending message:", err);
      showErrorToast("Network error sending message");
    }
  };

  const toggleMemberSelection = (empId: number) => {
    setSelectedMemberIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading Groups...</main>;
  }

  const currentUserId = session.user.id;

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} onSignOut={handleSignOut} />
        <section className="dashboard-content" style={{ padding: "0", display: "flex", height: "calc(100vh - 64px)" }}>
          {/* Groups Sidebar */}
          <div className={`h-full w-full flex-col border-r border-slate-200 bg-white lg:w-80 xl:w-96 ${activeGroup ? "hidden lg:flex" : "flex"}`}>
            <div className="flex items-center justify-between border-b border-orange-100 bg-gradient-to-r from-orange-50/80 via-white to-white p-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-700">Team communication</span>
                <h2 className="mt-0.5 text-base font-black text-slate-900">Group Chats</h2>
                {/* <p className="text-[11px] text-slate-500 font-medium">Team & Department Channels</p> */}
              </div>
              <button
                onClick={handleOpenCreateGroup}
                className="px-2 py-1.5 bg-orange-500 hover:bg-[#EA580C] text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                + New Group
              </button>
            </div>

            {/* Group List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {loading ? (
                <p className="p-4 text-xs text-slate-400 font-medium">Loading groups...</p>
              ) : groups.length === 0 ? (
                <div className="p-6 text-center space-y-3">
                  <p className="text-xs text-slate-400 font-medium">No group chats found.</p>
                  <button
                    onClick={handleOpenCreateGroup}
                    className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl"
                  >
                    Create First Group
                  </button>
                </div>
              ) : (
                groups.map((group) => {
                  const isSelected = activeGroup?.id === group.id;
                  return (
                    <div
                      key={group.id}
                      onClick={() => setActiveGroup(group)}
                      className={`group flex cursor-pointer items-center justify-between border-l-2 p-3.5 transition-all ${isSelected ? "border-orange-500 bg-orange-50/80" : "border-transparent hover:bg-slate-50"
                        }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-sm font-black text-orange-700 shadow-sm">
                          {group.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-black text-slate-900 truncate">{group.name}</p>
                          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                            {group.participants.length} {group.participants.length === 1 ? "member" : "members"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGroup(group.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-rose-100 text-rose-600 rounded-lg transition-all cursor-pointer"
                        title="Delete group"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Group Chat Panel */}
          <div className={`h-full min-w-0 flex-1 flex-col bg-slate-50 ${activeGroup ? "flex" : "hidden lg:flex"}`}>
            {activeGroup ? (
              <>
                {/* Header */}
                <div className="flex min-h-16 items-center justify-between border-t-2 border-t-orange-500 border-b border-slate-200 bg-white px-3 py-2 shadow-sm sm:px-6">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => setActiveGroup(null)}
                      aria-label="Back to groups"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 lg:hidden"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-base font-black text-orange-700">
                      {activeGroup.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 max-w-[120px] xs:max-w-[160px] sm:max-w-xs md:max-w-md">
                      <h3 className="text-sm font-black text-slate-900 truncate">{activeGroup.name}</h3>
                      <p className="truncate text-[11px] font-medium text-slate-500">
                        {activeGroup.participants.length} {activeGroup.participants.length === 1 ? "member" : "members"} · {activeGroup.participants.map((p) => p.user.name).join(", ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1 sm:gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenManageGroup(activeGroup)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                      title="Manage group members"
                      aria-label="Manage group members"
                    >
                      <Settings2 size={16} />
                    </button>
                    <button
                      onClick={() => handleInitiateGroupCall("AUDIO")}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                      title="Start audio group call"
                      aria-label="Start audio group call"
                    >
                      <Phone size={15} />
                    </button>
                    <button
                      onClick={() => handleInitiateGroupCall("VIDEO")}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-white transition-colors hover:bg-orange-600"
                      title="Start video group call"
                      aria-label="Start video group call"
                    >
                      <Video size={15} />
                    </button>
                    <span className="hidden md:inline-flex px-3 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">
                      {activeGroup.participants.length} Participants
                    </span>
                    <button
                      onClick={() => handleDeleteGroup(activeGroup.id)}
                      className="px-2.5 sm:px-3 py-1 bg-white-50 hover:bg-orange-600 text-rose-600 hover:text-white border border-rose-200 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1"
                      title="Delete this group channel"
                    >
                      <span className="hidden sm:inline">Delete Group</span>
                      <span className="sm:hidden">Delete</span>
                    </button>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-4 overflow-y-auto no-scrollbar bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-50/40 via-slate-50/70 to-slate-100/70 p-4 sm:p-6">
                  {messages.length === 0 && (
                    <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
                      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-100 bg-white text-orange-500 shadow-sm">
                        <Users size={24} />
                      </span>
                      <p className="text-sm font-bold text-slate-700">Start your group conversation</p>
                      <p className="mt-1 text-xs text-slate-500">Send the first message to the team.</p>
                    </div>
                  )}
                  {messages.map((m) => {
                    const isMe = m.senderId === currentUserId;
                    return (
                      <div key={m.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                        {!isMe && (
                          <span className="text-[10px] font-bold text-slate-500 mb-1 ml-1">
                            {m.sender.name}
                          </span>
                        )}
                        <div
                          className={`max-w-[85vw] sm:max-w-md md:max-w-lg lg:max-w-xl p-3.5 rounded-2xl text-xs shadow-xs relative group break-words [overflow-wrap:anywhere] overflow-hidden ${isMe
                            ? "bg-orange-500 text-white rounded-br-xs"
                            : "bg-white text-slate-800 border border-slate-200 rounded-bl-xs"
                            }`}
                        >
                          <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed max-h-[360px] overflow-y-auto no-scrollbar pr-1 select-text">
                            {m.content}
                          </div>
                          <span className="mt-1 block text-right text-[10px] opacity-70">
                            {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>

                          {/* Quick Reaction Bar on Hover */}
                          <div className="absolute top-1 right-2 hidden group-hover:flex items-center gap-0.5 bg-white p-1 rounded-xl shadow-md border border-slate-200 z-10 animate-in fade-in duration-100">
                            {["👍", "❤️", "😂", "🎉", "🙏"].map((emoji) => {
                              const userReacted = Boolean(m.reactions?.[emoji]?.some((u) => u.userId === currentUserId));
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => handleReact(m.id, emoji)}
                                  className={`w-6 h-6 rounded-md text-xs flex items-center justify-center transition-all hover:scale-125 cursor-pointer ${
                                    userReacted ? "bg-orange-100 scale-110" : "hover:bg-slate-100"
                                  }`}
                                  title={`React with ${emoji}`}
                                >
                                  {emoji}
                                </button>
                              );
                            })}
                          </div>
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
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95 ${
                                    userReacted
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

                {/* Composer */}
                <div className="border-t border-slate-200/80 bg-white p-3 sm:p-4">
                  <form onSubmit={handleSendMessage} className="flex items-center gap-2 sm:gap-3 relative">
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

                    <textarea
                      ref={textareaRef}
                      rows={1}
                      placeholder={`Message #${activeGroup.name}...`}
                      value={msgInput}
                      onChange={(e) => {
                        setMsgInput(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = e.target.value
                          ? `${Math.min(e.target.scrollHeight, 120)}px`
                          : "44px";
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(e as any);
                        }
                      }}
                      className="chat-composer-textarea flex-1 min-h-[44px] max-h-32 py-2.5 px-5 text-xs sm:text-[13px] bg-slate-50/80 hover:bg-slate-50 focus:bg-white border border-slate-200/90 focus:border-orange-500 rounded-full focus:outline-none focus:ring-4 focus:ring-orange-500/10 text-slate-900 font-medium !resize-none overflow-y-auto no-scrollbar leading-relaxed transition-all placeholder:text-slate-400 shadow-2xs"
                    />

                    {/* Smiley / Emoji Button */}
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className={`w-10 h-10 flex items-center justify-center text-orange-500 hover:text-orange-600 hover:bg-orange-50 rounded-full transition-colors cursor-pointer shrink-0 ${
                        showEmojiPicker ? "bg-orange-50 text-orange-600 ring-2 ring-orange-500/30" : ""
                      }`}
                      title="Insert Emoji"
                    >
                      <Smile size={23} strokeWidth={2.2} />
                    </button>

                    {/* Send Button (Solid Orange Circle with Paper Plane) */}
                    <button
                      type="submit"
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:scale-95 text-white flex items-center justify-center transition-all shadow-md shadow-orange-500/25 shrink-0 cursor-pointer"
                      title="Send Message"
                    >
                      <Send size={17} strokeWidth={2.4} className="text-white translate-x-px" />
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 mb-3">
                  <Users size={28} />
                </div>
                <h3 className="text-base font-bold text-slate-700">Select a Group Channel</h3>
                <p className="text-xs max-w-sm mt-1">
                  Click a group channel from the left sidebar or create a new group channel to start team messaging.
                </p>
              </div>
            )}
          </div>

          {/* Create Group Modal */}
          {showCreateModal && (
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
                            ? "Update the group name and choose which employees can participate."
                            : "Give your group a name and choose the employees who should be part of the conversation."}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      aria-label="Close group dialog"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-orange-50 transition hover:bg-white/15 hover:text-white"
                    >
                      <X size={17} />
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSaveGroup} className="flex min-h-0 flex-1 flex-col">
                  <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 sm:p-6 md:grid-cols-[0.85fr_1.15fr]">
                    <div className="space-y-5">
                      <div>
                        <label htmlFor="groups-page-group-name" className="!mt-0 !mb-2 !block text-xs font-bold text-slate-800">
                          Group name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          id="groups-page-group-name"
                          type="text"
                          placeholder="e.g. Engineering Squad"
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
                          {editingGroupId
                            ? "You can also update the group name here."
                            : "Choose a name your team will recognize."}
                        </p>
                      </div>

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
                            {selectedMemberIds.length}
                          </span>
                        </div>
                        {selectedMemberIds.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {employees
                              .filter((employee) => selectedMemberIds.includes(employee.id))
                              .map((employee) => (
                                <span key={employee.id} className="rounded-full border border-orange-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700">
                                  {employee.name}
                                </span>
                              ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-[11px] text-slate-500">No employees selected yet.</p>
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
                            const isSelected = selectedMemberIds.includes(emp.id);
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
                                    toggleMemberSelection(emp.id);
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
                        {selectedMemberIds.length
                          ? `${selectedMemberIds.length} employee${selectedMemberIds.length === 1 ? "" : "s"} selected`
                          : "You can add employees now or invite them later"}
                      </p>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowCreateModal(false)}
                          className="rounded-lg px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={submittingGroup}
                          className="rounded-lg bg-orange-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {submittingGroup
                            ? editingGroupId ? "Saving..." : "Creating..."
                            : editingGroupId ? "Save changes" : "Create group"}
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
