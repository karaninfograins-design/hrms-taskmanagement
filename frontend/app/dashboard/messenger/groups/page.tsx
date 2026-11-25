"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Phone,
  Video,
  Users,
  Search,
  UserPlus,
  X,
  ArrowLeft,
  Settings2,
  Send,
  Smile,
  FileText,
  CheckCircle2,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Edit3,
  Trash2,
  Mic,
  MicOff,
  Check,
  CheckCheck,
  AlertCircle,
  Sun,
  Moon,
  ExternalLink,
  AtSign,
  Bot,
  Paperclip,
  Eye,
  Download,
  Loader2,
  Link2,
  MoreHorizontal,
  Copy,
  Plus,
  CornerUpLeft,
  ImageIcon,
  UserMinus,
  PhoneCall,
  Info,
  LogOut,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { EmojiClickData } from "emoji-picker-react";
import { downloadFileDirectly, getCleanFileName, getFileBadgeInfo } from "@/lib/download";
import { DocumentFileIcon } from "@/components/common/DocumentFileIcon";

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

type SeenReceipt = {
  userId: number;
  name: string;
  designation?: string | null;
  readAt: string;
};

type Employee = {
  id: number;
  name: string;
  email: string;
  designation?: string | { name?: string } | null;
  role?: { name?: string } | null;
};

type Message = {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  sender: {
    id: number;
    name: string;
    email: string;
  };
  reactions?: Record<string, Array<{ userId: number; userName: string }>>;
  seenBy?: SeenReceipt[];
};

export type ChatAttachment = {
  id: string;
  url: string;
  fileName: string;
  type: "IMAGE" | "DOCUMENT" | "LINK";
  fileSize?: number;
};

type MentionOption = {
  id: string | number;
  type: "all" | "user";
  name: string;
  subtitle: string;
  avatarText?: string;
  user?: Employee;
};

type GroupConversation = {
  id: number;
  type: "GROUP";
  name: string;
  createdById: number;
  createdAt?: string;
  createdBy?: {
    id: number;
    name: string;
    email?: string;
  } | null;
  unreadCount?: number;
  participants: Array<{
    userId: number;
    role: string;
    lastReadAt?: string | null;
    user: Employee;
  }>;
};

type MemberReport = {
  userId: number;
  name: string;
  email: string;
  designation: string;
  role: string;
  hasSubmitted: boolean;
  summary: {
    id: number;
    content: string;
    createdAt: string;
    updatedAt: string;
  } | null;
};

type DailySummaryResponse = {
  conversationId: number;
  groupName: string;
  date: string;
  stats: {
    totalMembers: number;
    submittedCount: number;
    pendingCount: number;
  };
  members: MemberReport[];
};

export default function GroupChatsPage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();
  const { socket } = useSocket();
  const isSuperAdminUser = (typeof session?.user?.role === "string" ? session.user.role : (session?.user?.role as any)?.name)?.toUpperCase().includes("ADMIN");

  const [groups, setGroups] = useState<GroupConversation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeGroup, setActiveGroup] = useState<GroupConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [msgInput, setMsgInput] = useState<string>("");

  // Bitrix-Style Message Seen Details Modal State
  const [selectedSeenModalMessage, setSelectedSeenModalMessage] = useState<Message | null>(null);

  // Bitrix-Style @ Mention System States
  const [showMentions, setShowMentions] = useState<boolean>(false);
  const [mentionQuery, setMentionQuery] = useState<string>("");
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState<number>(0);
  const [mentionCursorPos, setMentionCursorPos] = useState<number>(0);
  const mentionMenuRef = useRef<HTMLDivElement>(null);

  // Chat Theme Option (Light / Dark)
  const [chatTheme, setChatTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("hrms_chat_theme");
      if (saved === "dark" || saved === "light") {
        setChatTheme(saved);
      }
    } catch { }
  }, []);

  const toggleChatTheme = () => {
    setChatTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem("hrms_chat_theme", next);
      } catch { }
      return next;
    });
  };

  const [downloadingFileUrl, setDownloadingFileUrl] = useState<string | null>(null);

  // Attachments State (Supports multiple/single documents, images, and links)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState<boolean>(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);
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

  // Bitrix-Style Message Context Menu States
  const [activeMenuMsgId, setActiveMenuMsgId] = useState<number | null>(null);
  const [copyFeedbackId, setCopyFeedbackId] = useState<number | null>(null);
  const messageMenuRef = useRef<HTMLDivElement>(null);

  const handleCopyMessage = (m: Message) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(m.content);
      setCopyFeedbackId(m.id);
      setTimeout(() => setCopyFeedbackId(null), 1500);
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    const confirmed = await showConfirmDialog({
      title: "Delete Message?",
      text: "Are you sure you want to delete this message? This action cannot be undone.",
      confirmButtonText: "Yes, delete",
      icon: "warning",
    });
    if (!confirmed) return;
    try {
      const token = getAuthToken();
      const res = await fetch(`${getApiUrl()}/api/messenger/messages/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
        showSuccessToast("Message deleted");
      } else {
        showErrorToast("Failed to delete message");
      }
    } catch {
      showErrorToast("Error deleting message");
    }
  };

  // Build Bitrix Mention Options (All members + Channel Members + All Employees)
  const mentionOptions = useMemo<MentionOption[]>(() => {
    const list: MentionOption[] = [
      {
        id: "all",
        type: "all",
        name: "All members",
        subtitle: "All members",
      },
    ];

    const seenIds = new Set<number>();
    if (session?.user?.id) {
      seenIds.add(session.user.id);
    }

    if (activeGroup?.participants) {
      activeGroup.participants.forEach((p) => {
        if (!seenIds.has(p.userId) && p.user?.name) {
          seenIds.add(p.userId);
          const designationName =
            typeof p.user?.designation === "string"
              ? p.user.designation
              : p.user?.designation?.name || (p.user as any)?.role?.name || "Team Member";

          const initials = p.user.name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((n) => n[0])
            .join("")
            .toUpperCase() || "U";

          list.push({
            id: p.userId,
            type: "user",
            name: p.user.name,
            subtitle: designationName,
            avatarText: initials,
            user: p.user,
          });
        }
      });
    }

    if (Array.isArray(employees)) {
      employees.forEach((emp) => {
        if (!seenIds.has(emp.id) && emp.name) {
          seenIds.add(emp.id);
          const designationName =
            typeof emp.designation === "string"
              ? emp.designation
              : (emp.designation as any)?.name || (emp as any)?.role?.name || "Employee";

          const initials = emp.name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((n) => n[0])
            .join("")
            .toUpperCase() || "U";

          list.push({
            id: emp.id,
            type: "user",
            name: emp.name,
            subtitle: designationName,
            avatarText: initials,
            user: emp,
          });
        }
      });
    }

    return list;
  }, [activeGroup?.participants, employees, session?.user?.id]);

  const filteredMentions = useMemo(() => {
    if (!mentionQuery) return mentionOptions;
    const q = mentionQuery.toLowerCase().trim();
    return mentionOptions.filter(
      (opt) =>
        opt.name.toLowerCase().includes(q) ||
        opt.subtitle.toLowerCase().includes(q)
    );
  }, [mentionOptions, mentionQuery]);

  // Click outside to close mention popup
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (mentionMenuRef.current && !mentionMenuRef.current.contains(e.target as Node)) {
        setShowMentions(false);
      }
    };
    if (showMentions) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMentions]);

  // In-Chat Message Search State
  const [showInChatSearch, setShowInChatSearch] = useState<boolean>(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState<string>("");
  const [inChatSearchMatchIndex, setInChatSearchMatchIndex] = useState<number>(0);
  const inChatSearchInputRef = useRef<HTMLInputElement>(null);

  const inChatMatchingMsgIds = useMemo(() => {
    if (!inChatSearchQuery.trim()) return [];
    const q = inChatSearchQuery.toLowerCase();
    return messages.filter((m) => m.content && m.content.toLowerCase().includes(q)).map((m) => m.id);
  }, [messages, inChatSearchQuery]);

  useEffect(() => {
    if (inChatMatchingMsgIds.length > 0) {
      const targetId = inChatMatchingMsgIds[inChatSearchMatchIndex] || inChatMatchingMsgIds[0];
      if (targetId) {
        const el = document.getElementById(`group-msg-${targetId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }
  }, [inChatMatchingMsgIds, inChatSearchMatchIndex]);

  const toggleInChatSearch = () => {
    setShowInChatSearch((prev) => {
      const next = !prev;
      if (!next) {
        setInChatSearchQuery("");
        setInChatSearchMatchIndex(0);
      } else {
        setTimeout(() => inChatSearchInputRef.current?.focus(), 50);
      }
      return next;
    });
  };

  // Handle selecting a mention
  const handleSelectMention = useCallback(
    (option: MentionOption) => {
      if (!textareaRef.current) return;
      const text = msgInput;
      const atIndex = text.lastIndexOf("@", mentionCursorPos);
      if (atIndex === -1) return;

      const beforeAt = text.slice(0, atIndex);
      const afterCursor = text.slice(mentionCursorPos);
      const mentionTag = `@${option.name} `;
      const newText = beforeAt + mentionTag + afterCursor;

      setMsgInput(newText);
      setShowMentions(false);
      setMentionQuery("");

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newPos = beforeAt.length + mentionTag.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 50);
    },
    [msgInput, mentionCursorPos]
  );

  // Helper to render message content with clickable links & Bitrix highlighted @mentions
  const renderFormattedContent = (content: string, isMe: boolean) => {
    if (!content) return null;
    const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s])/gi;
    const tokenRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s]|@[A-Za-z0-9_.-]+(?:\s[A-Za-z0-9_.-]+)?)/gi;
    const parts = content.split(tokenRegex);

    return parts.map((part, index) => {
      if (!part) return null;

      if (part.match(urlRegex)) {
        const href = part.startsWith("http://") || part.startsWith("https://") ? part : `https://${part}`;
        const isDark = chatTheme === "dark";
        const linkStyle = isDark
          ? isMe
            ? "text-emerald-300 hover:text-emerald-100"
            : "text-sky-400 hover:text-sky-200"
          : isMe
            ? "text-emerald-800 hover:text-emerald-950"
            : "text-blue-600 hover:text-blue-800";

        return (
          <a
            key={index}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`break-all inline underline underline-offset-2 hover:font-bold transition-all ${linkStyle}`}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }

      if (part.startsWith("@")) {
        const isSelfMention =
          part.toLowerCase() === `@${session?.user?.name?.toLowerCase()}` ||
          part.toLowerCase() === "@all members" ||
          part.toLowerCase() === "@all";

        const isDark = chatTheme === "dark";
        const mentionStyle = isDark
          ? isMe
            ? "text-emerald-200"
            : isSelfMention
              ? "text-amber-300"
              : "text-sky-300"
          : isMe
            ? "text-emerald-900"
            : isSelfMention
              ? "text-amber-700"
              : "text-blue-600";

        return (
          <span
            key={index}
            className={`inline font-bold transition-colors cursor-pointer hover:underline ${mentionStyle}`}
          >
            {part}
          </span>
        );
      }

      return <span key={index}>{part}</span>;
    });
  };

  // Bitrix-Style Daily Work Summary State
  const [showSummaryModal, setShowSummaryModal] = useState<boolean>(false);
  const [summaryDate, setSummaryDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [summaryData, setSummaryData] = useState<DailySummaryResponse | null>(null);
  const [loadingSummaries, setLoadingSummaries] = useState<boolean>(false);
  const [isEditingReport, setIsEditingReport] = useState<boolean>(false);
  const [reportInput, setReportInput] = useState<string>("");
  const [submittingReport, setSubmittingReport] = useState<boolean>(false);
  const [summarySearchQuery, setSummarySearchQuery] = useState<string>("");
  const [isDictating, setIsDictating] = useState<boolean>(false);
  const speechRecognitionRef = useRef<any>(null);

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
      if (messageMenuRef.current && !messageMenuRef.current.contains(e.target as Node)) {
        setActiveMenuMsgId(null);
      }
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(e.target as Node)) {
        setShowAttachmentMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Bitrix24-style auto-adjusting textarea height
  const adjustComposerHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 180;
    const minHeight = 44;
    const scrollHeight = el.scrollHeight;

    if (!el.value) {
      el.style.height = `${minHeight}px`;
      el.style.overflowY = "hidden";
    } else if (scrollHeight > maxHeight) {
      el.style.height = `${maxHeight}px`;
      el.style.overflowY = "auto";
    } else {
      el.style.height = `${Math.max(scrollHeight, minHeight)}px`;
      el.style.overflowY = "hidden";
    }
  }, []);

  useEffect(() => {
    adjustComposerHeight();
  }, [msgInput, adjustComposerHeight]);

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  // Fetch employees (up to 1000 active employees to support 30-50+ users per group)
  useEffect(() => {
    if (!session?.token) return;
    fetch(`${getApiUrl()}/api/employees?limit=1000&status=ACTIVE`, {
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

  const handleSelectGroup = (group: GroupConversation) => {
    setActiveGroup(group);
    setGroups((prev) =>
      prev.map((g) => (g.id === group.id ? { ...g, unreadCount: 0 } : g))
    );
    if (socket) {
      socket.emit("join:conversation", group.id);
      socket.emit("conversation:read", { conversationId: group.id });
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
        if (data.conversation) {
          setActiveGroup((prev) => (prev ? { ...prev, ...data.conversation } : data.conversation));
        }
        setGroups((prev) =>
          prev.map((g) => (g.id === activeGroup.id ? { ...g, unreadCount: 0 } : g))
        );
        if (socket) {
          socket.emit("join:conversation", activeGroup.id);
          socket.emit("conversation:read", { conversationId: activeGroup.id });
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
      const isCurrentlyActive = activeGroup?.id === newMsg.conversationId;
      if (isCurrentlyActive) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        if (socket && newMsg.senderId !== session?.user?.id) {
          socket.emit("conversation:read", { conversationId: activeGroup.id });
        }
      }
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id === newMsg.conversationId) {
            return {
              ...g,
              unreadCount: isCurrentlyActive ? 0 : (g.unreadCount || 0) + 1,
            };
          }
          return g;
        })
      );
    };

    const onConversationSeen = (seenData: {
      conversationId: number;
      userId: number;
      name: string;
      designation?: string | null;
      readAt: string;
    }) => {
      if (seenData.userId === session?.user?.id) {
        setGroups((prev) =>
          prev.map((g) => (g.id === seenData.conversationId ? { ...g, unreadCount: 0 } : g))
        );
      }

      if (activeGroup && seenData.conversationId === activeGroup.id) {
        const readTime = new Date(seenData.readAt).getTime();
        setMessages((prev) =>
          prev.map((m) => {
            if (m.senderId === seenData.userId) return m;
            const msgTime = new Date(m.createdAt).getTime();
            if (readTime < msgTime) return m;

            const existingSeen = m.seenBy || [];
            if (existingSeen.some((s) => s.userId === seenData.userId)) return m;

            return {
              ...m,
              seenBy: [
                ...existingSeen,
                {
                  userId: seenData.userId,
                  name: seenData.name,
                  designation: seenData.designation,
                  readAt: seenData.readAt,
                },
              ],
            };
          })
        );
      }
    };

    const onConversationMarkedRead = (data: { conversationId: number }) => {
      setGroups((prev) =>
        prev.map((g) => (g.id === data.conversationId ? { ...g, unreadCount: 0 } : g))
      );
    };

    const onReaction = (data: { messageId: number; conversationId: number; reactions: Record<string, Array<{ userId: number; userName: string }>> }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId ? { ...m, reactions: data.reactions } : m
        )
      );
    };

    const onSummaryUpdated = (data: { conversationId: number; date: string }) => {
      if (activeGroup?.id === data.conversationId) {
        fetchDailySummaries(data.conversationId, data.date);
      }
    };
    const onSummaryDeleted = (data: { conversationId: number; date: string }) => {
      if (activeGroup?.id === data.conversationId) {
        fetchDailySummaries(data.conversationId, data.date);
      }
    };

    socket.on("conversation:members-updated", onMembersUpdated);
    socket.on("conversation:deleted", onConvDeleted);
    socket.on("message:new", onNewMessage);
    socket.on("conversation:seen", onConversationSeen);
    socket.on("conversation:marked-read", onConversationMarkedRead);
    socket.on("message:reaction", onReaction);
    socket.on("group:summary-updated", onSummaryUpdated);
    socket.on("group:summary-deleted", onSummaryDeleted);
    return () => {
      socket.off("conversation:members-updated", onMembersUpdated);
      socket.off("conversation:deleted", onConvDeleted);
      socket.off("message:new", onNewMessage);
      socket.off("conversation:seen", onConversationSeen);
      socket.off("conversation:marked-read", onConversationMarkedRead);
      socket.off("message:reaction", onReaction);
      socket.off("group:summary-updated", onSummaryUpdated);
      socket.off("group:summary-deleted", onSummaryDeleted);
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

    const channelName = `group-call-${Date.now()}`;
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
          isHost: "true",
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

  const handleLeaveGroup = async (group: GroupConversation) => {
    const confirmed = await showConfirmDialog({
      title: "Leave Group?",
      text: `Are you sure you want to leave "${group.name}"? You will no longer receive messages or updates from this group channel.`,
      confirmButtonText: "Yes, leave",
      confirmButtonColor: "#dc2626",
    });
    if (!confirmed) return;

    try {
      const token = getAuthToken();
      const res = await fetch(`${getApiUrl()}/api/messenger/conversations/group/${group.id}/leave`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        showSuccessToast(`You have left "${group.name}"`);
        setActiveGroup(null);
        setGroups((prev) => prev.filter((g) => g.id !== group.id));
        setShowCreateModal(false);
      } else {
        const data = await res.json().catch(() => ({}));
        showErrorToast(data.message || "Failed to leave group");
      }
    } catch (err: any) {
      showErrorToast(err.message || "Network error while leaving group");
    }
  };

  // Bitrix-Style Daily Work Summary Handlers
  const fetchDailySummaries = async (conversationId: number, dateStr?: string) => {
    try {
      setLoadingSummaries(true);
      const targetDate = dateStr || summaryDate;
      const res = await fetch(
        `${getApiUrl()}/api/messenger/conversations/${conversationId}/daily-summaries?date=${targetDate}`,
        {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        }
      );
      if (!res.ok) throw new Error("Failed to load daily reports");
      const data: DailySummaryResponse = await res.json();
      setSummaryData(data);
    } catch (err) {
      console.error("Error loading daily summaries:", err);
      showErrorToast("Could not load daily reports for this group");
    } finally {
      setLoadingSummaries(false);
    }
  };

  const handleOpenDailySummaryModal = (group: GroupConversation) => {
    setShowSummaryModal(true);
    setIsEditingReport(false);
    setReportInput("");
    setSummarySearchQuery("");
    const today = new Date().toISOString().slice(0, 10);
    setSummaryDate(today);
    fetchDailySummaries(group.id, today);
  };

  const handleChangeSummaryDate = (offsetDays: number) => {
    const current = new Date(summaryDate);
    current.setDate(current.getDate() + offsetDays);
    const newDateStr = current.toISOString().slice(0, 10);
    setSummaryDate(newDateStr);
    setIsEditingReport(false);
    setReportInput("");
    if (activeGroup) {
      fetchDailySummaries(activeGroup.id, newDateStr);
    }
  };

  const handleSelectSummaryDate = (dateVal: string) => {
    setSummaryDate(dateVal);
    setIsEditingReport(false);
    setReportInput("");
    if (activeGroup) {
      fetchDailySummaries(activeGroup.id, dateVal);
    }
  };

  const handleStartWritingReport = (existingText = "") => {
    setReportInput(existingText || "• ");
    setIsEditingReport(true);
  };

  const handleSaveDailyReport = async () => {
    if (!reportInput.trim() || !activeGroup) return;
    try {
      setSubmittingReport(true);
      const res = await fetch(
        `${getApiUrl()}/api/messenger/conversations/${activeGroup.id}/daily-summaries`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({
            content: reportInput.trim(),
            date: summaryDate,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to save report");
      }
      showSuccessToast("Daily report saved successfully");
      setIsEditingReport(false);
      setReportInput("");
      fetchDailySummaries(activeGroup.id, summaryDate);
    } catch (err: any) {
      showErrorToast(err.message || "Error saving report");
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleDeleteDailyReport = async (summaryId: number) => {
    if (!activeGroup) return;
    const isConfirmed = await showConfirmDialog({
      title: "Delete Daily Report?",
      text: "Are you sure you want to delete this report?",
      confirmButtonText: "Yes, delete",
      confirmButtonColor: "#e11d48",
      icon: "warning",
    });
    if (!isConfirmed) return;
    try {
      const res = await fetch(
        `${getApiUrl()}/api/messenger/conversations/${activeGroup.id}/daily-summaries/${summaryId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        }
      );
      if (!res.ok) throw new Error("Failed to delete report");
      showSuccessToast("Report deleted");
      if (isEditingReport) {
        setIsEditingReport(false);
        setReportInput("");
      }
      fetchDailySummaries(activeGroup.id, summaryDate);
    } catch (err: any) {
      showErrorToast(err.message || "Could not delete report");
    }
  };

  const toggleSpeechDictation = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showNotification({
        title: "Voice Dictation Notice",
        text: "Your browser does not support Web Speech API. You can type your bullet points directly into the box.",
        icon: "info",
      });
      return;
    }

    if (isDictating) {
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch { }
      }
      setIsDictating(false);
    } else {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          let transcript = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              transcript += event.results[i][0].transcript + " ";
            }
          }
          if (transcript) {
            setReportInput((prev) => (prev ? `${prev.trim()}\n• ${transcript.trim()}` : `• ${transcript.trim()}`));
          }
        };

        recognition.onerror = (event: any) => {
          console.warn("Speech recognition error:", event.error);
          setIsDictating(false);
        };

        recognition.onend = () => {
          setIsDictating(false);
        };

        speechRecognitionRef.current = recognition;
        recognition.start();
        setIsDictating(true);
      } catch (err) {
        console.error("Speech recognition start failed:", err);
        setIsDictating(false);
      }
    }
  };

  // Composer Mentions & Keydown Handler
  const handleComposerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setMsgInput(val);
    adjustComposerHeight();

    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : " ";
      if (charBeforeAt === " " || charBeforeAt === "\n" || lastAtIndex === 0) {
        const queryText = textBeforeCursor.slice(lastAtIndex + 1);
        if (!queryText.includes(" ") && !queryText.includes("\n")) {
          setShowMentions(true);
          setMentionQuery(queryText);
          setMentionCursorPos(cursorPos);
          setMentionSelectedIndex(0);
          return;
        }
      }
    }

    setShowMentions(false);
    setMentionQuery("");
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev + 1) % filteredMentions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev - 1 + filteredMentions.length) % filteredMentions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected = filteredMentions[mentionSelectedIndex] || filteredMentions[0];
        if (selected) {
          handleSelectMention(selected);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e as any);
    }
  };

  // Drag & drop handlers for group message attachments
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
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      uploadFiles(files);
    }
  };

  // Reusable Multi-File Upload helper (supports multiple files, drag & drop, and direct clipboard image paste)
  const MAX_FILE_SIZE_BYTES = 35 * 1024 * 1024; // 35 MB

  const uploadSingleFile = (file: File): Promise<ChatAttachment> => {
    return new Promise((resolve, reject) => {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        reject(new Error(`"${file.name}" exceeds the maximum allowed file size of 35MB.`));
        return;
      }
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

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.message || "Upload failed");
            }
            const data = await res.json();
            resolve({
              id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              url: data.url,
              fileName: data.fileName,
              type: data.type,
              fileSize: file.size,
            });
          } catch (err: any) {
            reject(err);
          }
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const uploadFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setIsUploadingAttachment(true);
    try {
      const results = await Promise.allSettled(files.map(uploadSingleFile));
      const successful: ChatAttachment[] = [];
      const errors: string[] = [];

      results.forEach((res) => {
        if (res.status === "fulfilled") {
          successful.push(res.value);
        } else {
          errors.push(res.reason?.message || "Failed to upload file");
        }
      });

      if (successful.length > 0) {
        setAttachments((prev) => [...prev, ...successful]);
        showSuccessToast(
          successful.length === 1
            ? "Attachment added"
            : `${successful.length} attachments added`
        );
      }
      if (errors.length > 0) {
        showErrorToast(errors[0]);
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      showErrorToast("Failed to upload attachment");
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  // Handle Attachment Upload from File Picker (supports multiple files)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    uploadFiles(files);
    setShowAttachmentMenu(false);
    if (e.target) e.target.value = "";
  };

  // Handle Direct Clipboard Image Pasting (Ctrl+V)
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    const filesToUpload: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const ext = file.type.split("/")[1]?.replace(/[^a-zA-Z0-9]/g, "") || "png";
          const uniqueName = `pasted_image_${Date.now()}_${i}.${ext}`;
          filesToUpload.push(new File([file], uniqueName, { type: file.type }));
        }
      }
    }
    if (filesToUpload.length > 0) {
      e.preventDefault();
      uploadFiles(filesToUpload);
      return;
    }
    setTimeout(adjustComposerHeight, 0);
  };

  const handleAddLinkPrompt = async () => {
    const link = await showPromptDialog({
      title: "Add Document / Web Link",
      inputPlaceholder: "https://example.com/document...",
    });
    if (link && link.trim()) {
      const trimmed = link.trim();
      const newAtt: ChatAttachment = {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        url: trimmed,
        fileName: trimmed.replace(/^https?:\/\//, ""),
        type: "LINK",
      };
      setAttachments((prev) => [...prev, newAtt]);
      setShowAttachmentMenu(false);
      showSuccessToast("Link attached");
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const clearAllAttachments = () => {
    setAttachments([]);
  };

  // Send Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!msgInput.trim() && attachments.length === 0) || !activeGroup) return;

    try {
      setShowMentions(false);
      setMentionQuery("");

      if (attachments.length === 0) {
        // Plain text message
        const res = await fetch(`${getApiUrl()}/api/messenger/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({
            conversationId: activeGroup.id,
            content: msgInput.trim(),
            attachmentUrl: null,
            attachmentType: null,
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
      } else {
        // Multiple or single attachment: send sequentially, attaching caption/text to the first item
        for (let i = 0; i < attachments.length; i++) {
          const att = attachments[i];
          const res = await fetch(`${getApiUrl()}/api/messenger/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getAuthToken()}`,
            },
            body: JSON.stringify({
              conversationId: activeGroup.id,
              content: i === 0 ? msgInput.trim() : "",
              attachmentUrl: att.url,
              attachmentType: att.type,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            setMessages((prev) => [...prev, data.message]);
          }
        }

        setMsgInput("");
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
        setAttachments([]);
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
                      onClick={() => handleSelectGroup(group)}
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
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {group.unreadCount ? (
                          <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 shadow-xs">
                            {group.unreadCount}
                          </span>
                        ) : null}
                        {((group.createdById !== undefined && Number(group.createdById) === Number(currentUserId)) || isSuperAdminUser) && (
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
                        )}
                      </div>
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
                <div className={`flex min-h-16 items-center justify-between border-t-2 border-t-orange-500 border-b px-3 py-2 shadow-sm sm:px-6 transition-colors ${chatTheme === "dark" ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => setActiveGroup(null)}
                      aria-label="Back to groups"
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition lg:hidden ${chatTheme === "dark" ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 text-slate-500 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"}`}
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-base font-black text-orange-700">
                      {activeGroup.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 max-w-[120px] xs:max-w-[160px] sm:max-w-xs md:max-w-md">
                      <h3 className={`text-sm font-black truncate ${chatTheme === "dark" ? "text-white" : "text-slate-900"}`}>{activeGroup.name}</h3>
                      <p className={`truncate text-[11px] font-medium ${chatTheme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
                        {activeGroup.participants.length} {activeGroup.participants.length === 1 ? "member" : "members"} · {activeGroup.participants.map((p) => p.user.name).join(", ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1 sm:gap-1.5 shrink-0">
                    {/* Search in Group Conversation */}
                    <button
                      type="button"
                      onClick={toggleInChatSearch}
                      className={`h-9 w-9 rounded-xl text-xs font-semibold transition-all border flex items-center justify-center cursor-pointer shadow-2xs ${showInChatSearch
                        ? "bg-orange-50 text-orange-600 border-orange-300 ring-2 ring-orange-500/20"
                        : chatTheme === "dark"
                          ? "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
                          : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      title="Search messages in group"
                      aria-label="Search messages"
                    >
                      <Search size={15} strokeWidth={2.2} />
                    </button>

                    {/* Chat Theme Toggle (Light / Dark) */}
                    <button
                      type="button"
                      onClick={toggleChatTheme}
                      className={`h-9 px-2.5 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 cursor-pointer shadow-2xs ${chatTheme === "dark"
                        ? "bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700 hover:text-amber-200"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      title={chatTheme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme"}
                    >
                      {chatTheme === "dark" ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-slate-600" />}
                      <span className="hidden sm:inline text-[11px] font-bold">{chatTheme === "dark" ? "Light" : "Dark"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenDailySummaryModal(activeGroup)}
                      className="flex h-9 items-center gap-1.5 px-3 rounded-xl border border-orange-200 bg-orange-50 text-orange-700 transition hover:bg-orange-100 hover:border-orange-300 font-bold text-xs shadow-xs cursor-pointer"
                      title="View & Submit Daily Work Reports (Bitrix Style)"
                      aria-label="Daily Work Reports"
                    >
                      <FileText size={15} />
                      <span className="hidden sm:inline">Daily Reports</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenManageGroup(activeGroup)}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border transition cursor-pointer ${chatTheme === "dark" ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"}`}
                      title="Manage group members"
                      aria-label="Manage group members"
                    >
                      <Settings2 size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLeaveGroup(activeGroup)}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border transition cursor-pointer ${chatTheme === "dark" ? "border-slate-700 bg-slate-800 text-rose-400 hover:bg-rose-950/40 hover:text-rose-300" : "border-slate-200 bg-slate-50 text-rose-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"}`}
                      title="Leave this group"
                      aria-label="Leave group"
                    >
                      <LogOut size={15} />
                    </button>
                    <button
                      onClick={() => handleInitiateGroupCall("AUDIO")}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${chatTheme === "dark" ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"}`}
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
                    <span className={`hidden md:inline-flex px-3 py-1 text-xs font-bold rounded-full ${chatTheme === "dark" ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"}`}>
                      {activeGroup.participants.length} Participants
                    </span>
                    {((activeGroup.createdById !== undefined && Number(activeGroup.createdById) === Number(currentUserId)) || isSuperAdminUser) && (
                      <button
                        onClick={() => handleDeleteGroup(activeGroup.id)}
                        className="px-2.5 sm:px-3 py-1 bg-white-50 hover:bg-orange-600 text-rose-600 hover:text-white border border-rose-200 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1"
                        title="Delete this group channel"
                      >
                        <span className="hidden sm:inline">Delete Group</span>
                        <span className="sm:hidden">Delete</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* In-Chat Message Search Bar */}
                {showInChatSearch && (
                  <div
                    className={`flex items-center gap-2 px-3 sm:px-6 py-2 border-b animate-in slide-in-from-top-2 duration-150 z-20 transition-colors ${chatTheme === "dark"
                      ? "bg-slate-900 border-slate-800 text-white"
                      : "bg-orange-50/80 border-orange-200/80 text-slate-800"
                      }`}
                  >
                    <Search size={14} className="text-orange-500 shrink-0" />
                    <input
                      ref={inChatSearchInputRef}
                      type="text"
                      value={inChatSearchQuery}
                      onChange={(e) => {
                        setInChatSearchQuery(e.target.value);
                        setInChatSearchMatchIndex(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (inChatMatchingMsgIds.length > 0) {
                            if (e.shiftKey) {
                              setInChatSearchMatchIndex((prev) => (prev - 1 + inChatMatchingMsgIds.length) % inChatMatchingMsgIds.length);
                            } else {
                              setInChatSearchMatchIndex((prev) => (prev + 1) % inChatMatchingMsgIds.length);
                            }
                          }
                        } else if (e.key === "Escape") {
                          toggleInChatSearch();
                        }
                      }}
                      aria-label="Search in group"
                      className="flex-1 min-w-0 bg-transparent text-xs outline-none font-medium text-slate-800 dark:text-slate-100"
                    />
                    {inChatSearchQuery && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
                        {inChatMatchingMsgIds.length > 0
                          ? `${inChatSearchMatchIndex + 1} of ${inChatMatchingMsgIds.length}`
                          : "No matches"}
                      </span>
                    )}
                    {inChatMatchingMsgIds.length > 1 && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setInChatSearchMatchIndex((prev) => (prev - 1 + inChatMatchingMsgIds.length) % inChatMatchingMsgIds.length)}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                          title="Previous match (Shift+Enter)"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setInChatSearchMatchIndex((prev) => (prev + 1) % inChatMatchingMsgIds.length)}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                          title="Next match (Enter)"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={toggleInChatSearch}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer shrink-0"
                      title="Close search (Esc)"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Messages */}
                <div className={`flex-1 space-y-4 overflow-y-auto no-scrollbar p-4 sm:p-6 transition-colors ${chatTheme === "dark" ? "bg-slate-950" : "bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-50/40 via-slate-50/70 to-slate-100/70"}`}>
                  {messages.length === 0 && (
                    <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
                      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-100 bg-white text-orange-500 shadow-sm">
                        <Users size={24} />
                      </span>
                      <p className="text-sm font-bold text-slate-700">Start your group conversation</p>
                      <p className="mt-1 text-xs text-slate-500">Send the first message to the team.</p>
                    </div>
                  )}
                  {messages.map((m, idx) => {
                    const isMe = m.senderId === currentUserId;
                    const isCurrentSearchMatch = m.id === inChatMatchingMsgIds[inChatSearchMatchIndex];
                    const isAnySearchMatch = inChatMatchingMsgIds.includes(m.id);

                    const msgDate = new Date(m.createdAt);
                    const prevMsg = idx > 0 ? messages[idx - 1] : null;
                    const prevMsgDate = prevMsg ? new Date(prevMsg.createdAt) : null;
                    const isNewDay = !prevMsgDate || msgDate.toDateString() !== prevMsgDate.toDateString();

                    const formatDateSeparator = (d: Date) => {
                      const now = new Date();
                      const isToday = d.toDateString() === now.toDateString();
                      const yesterday = new Date(now);
                      yesterday.setDate(yesterday.getDate() - 1);
                      const isYesterday = d.toDateString() === yesterday.toDateString();
                      if (isToday) return "Today";
                      if (isYesterday) return "Yesterday";
                      return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
                    };

                    const isSystemMsg = m.attachmentType === "SYSTEM" || m.attachmentType === "CALL";

                    return (
                      <div key={m.id} className="flex flex-col w-full">
                        {isNewDay && (
                          <div className="flex items-center justify-center my-3 select-none">
                            <span className="px-3 py-1 rounded-full text-[10px] font-semibold tracking-wide bg-slate-200/70 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 shadow-2xs backdrop-blur-xs border border-slate-300/40 dark:border-slate-700/50">
                              {formatDateSeparator(msgDate)}
                            </span>
                          </div>
                        )}

                        {isSystemMsg ? (
                          <div id={`group-msg-${m.id}`} className="flex flex-col items-center my-2 px-2 select-none">
                            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 shadow-2xs text-[11px] text-slate-600 dark:text-slate-300">
                              <span className="shrink-0 text-orange-500">
                                {m.attachmentType === "CALL" ? (
                                  <PhoneCall size={12} strokeWidth={2.2} />
                                ) : m.content.includes("added") ? (
                                  <UserPlus size={12} strokeWidth={2.2} />
                                ) : m.content.includes("left") || m.content.includes("removed") ? (
                                  <UserMinus size={12} strokeWidth={2.2} />
                                ) : m.content.includes("name") ? (
                                  <Edit3 size={12} strokeWidth={2.2} />
                                ) : (
                                  <Info size={12} strokeWidth={2.2} />
                                )}
                              </span>
                              <span className="font-medium">{m.content}</span>
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 ml-1">
                                {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div
                            id={`group-msg-${m.id}`}
                            className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                          >
                            {!isMe && (
                              <span className="text-[10px] font-bold text-slate-500 mb-1 ml-1">
                                {m.sender.name}
                              </span>
                            )}
                            <div
                              className={`max-w-[85vw] sm:max-w-md md:max-w-lg lg:max-w-xl pt-4 pb-3 px-3.5 sm:px-4 sm:pt-4.5 rounded-2xl text-xs shadow-2xs relative group break-words [overflow-wrap:anywhere] ${isCurrentSearchMatch
                                ? "ring-3 ring-amber-400 ring-offset-2 dark:ring-offset-slate-950 shadow-md"
                                : isAnySearchMatch
                                  ? "ring-2 ring-amber-300/80"
                                  : ""
                                } ${isMe
                                  ? chatTheme === "dark"
                                    ? "bg-[#18362b] text-emerald-100 shadow-md font-medium rounded-br-xs border border-emerald-700/60"
                                    : "bg-[#eaf4ed] text-slate-900 border border-[#cbe4d7] shadow-2xs font-medium rounded-br-xs"
                                  : chatTheme === "dark"
                                    ? "bg-slate-900 text-slate-100 border border-slate-800 shadow-sm font-medium rounded-bl-xs"
                                    : "bg-white text-slate-900 border border-slate-200/90 rounded-bl-xs shadow-2xs font-medium"
                                }`}
                            >
                              {/* Attachment Display with Direct Download Action */}
                              {m.attachmentUrl && !m.deletedAt && (() => {
                                const cleanDocName = getCleanFileName(m.attachmentUrl, "Document");
                                const badgeInfo = getFileBadgeInfo(cleanDocName, m.attachmentType);
                                const isThisDownloading = downloadingFileUrl === m.attachmentUrl;

                                return (
                                  <div className="my-1.5 relative group/att">
                                    {m.attachmentType === "IMAGE" ? (
                                      <div className="relative rounded-xl overflow-hidden border border-slate-200/80 shadow-2xs mb-2">
                                        <img
                                          src={m.attachmentUrl}
                                          alt="Attachment"
                                          className="max-w-xs max-h-60 rounded-xl object-cover"
                                        />
                                        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/att:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2 backdrop-blur-2xs">
                                          <button
                                            type="button"
                                            onClick={() => handleTriggerDownload(m.attachmentUrl!, getCleanFileName(m.attachmentUrl, "image.jpg"))}
                                            disabled={isThisDownloading}
                                            className="p-2 text-white/90 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition-all cursor-pointer active:scale-95 disabled:opacity-75"
                                            title="Download Image"
                                          >
                                            {isThisDownloading ? <Loader2 size={18} className="animate-spin text-white" /> : <Download size={18} strokeWidth={1.8} />}
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-between gap-3 py-1 px-0.5 bg-transparent border-0 shadow-none mb-1">
                                        {/* Icon & File Details */}
                                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                          {m.attachmentType === "LINK" ? (
                                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shrink-0">
                                              <Link2 size={18} strokeWidth={2} />
                                            </span>
                                          ) : (
                                            <DocumentFileIcon ext={cleanDocName.split(".").pop()} />
                                          )}
                                          <div className="flex flex-col min-w-0">
                                            <span
                                              className={`text-xs sm:text-sm font-medium truncate max-w-[140px] xs:max-w-[200px] sm:max-w-[260px] md:max-w-[320px] leading-snug ${chatTheme === "dark" ? "text-slate-100" : "text-slate-800"}`}
                                              title={cleanDocName}
                                            >
                                              {cleanDocName}
                                            </span>
                                            <span className="text-[11px] text-slate-400 dark:text-slate-400 font-normal leading-tight mt-0.5">
                                              {badgeInfo.label}
                                            </span>
                                          </div>
                                        </div>

                                        {/* Action Button - Lucide icon without background or border */}
                                        {m.attachmentType === "LINK" ? (
                                          <a
                                            href={m.attachmentUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 bg-transparent border-0 transition-colors cursor-pointer shrink-0"
                                            title="Open link"
                                          >
                                            <ExternalLink size={18} strokeWidth={1.75} />
                                          </a>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => handleTriggerDownload(m.attachmentUrl!, cleanDocName)}
                                            disabled={isThisDownloading}
                                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 bg-transparent border-0 rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                                            title="Download file"
                                          >
                                            {isThisDownloading ? (
                                              <Loader2 size={19} className="animate-spin text-slate-400 dark:text-slate-300" />
                                            ) : (
                                              <Download size={19} strokeWidth={1.75} />
                                            )}
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed max-h-[360px] overflow-y-auto no-scrollbar pr-1 select-text">
                                {renderFormattedContent(m.content, isMe)}
                              </div>
                              <span className="mt-1 block text-right text-[10px] text-slate-500 font-medium">
                                {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>

                              {/* Bitrix-Style Hover Action Bar (Compact & Perfectly Anchored) */}
                              {!m.deletedAt && (
                                <div
                                  className={`absolute -top-3.5 sm:-top-4 z-30 flex items-center gap-0.5 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xs p-0.5 rounded-xl shadow-md border border-slate-200/90 dark:border-slate-700 transition-all right-2 sm:right-2.5 ${activeMenuMsgId === m.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                                >
                                  {/* Quick Reaction Button */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuMsgId(activeMenuMsgId === m.id ? null : m.id);
                                    }}
                                    className="w-6 h-6 rounded-lg text-xs flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                    title="Add reaction"
                                  >
                                    <Smile size={14} />
                                  </button>

                                  {/* Bitrix 3-Dots Menu Button */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuMsgId(activeMenuMsgId === m.id ? null : m.id);
                                    }}
                                    className={`w-6 h-6 rounded-lg text-xs flex items-center justify-center transition-all cursor-pointer ${activeMenuMsgId === m.id
                                      ? "bg-orange-500 text-white shadow-xs"
                                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                                      }`}
                                    title="More options"
                                  >
                                    <MoreHorizontal size={15} strokeWidth={2.2} />
                                  </button>
                                </div>
                              )}

                              {/* Bitrix-Style Message Context Menu */}
                              {activeMenuMsgId === m.id && (
                                <div
                                  ref={messageMenuRef}
                                  className={`absolute z-50 top-full mt-1.5 min-w-[210px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800 p-1.5 animate-in fade-in zoom-in-95 duration-150 ${isMe ? "right-0" : "left-0"
                                    }`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {/* Suggested Smileys / Reaction Bar */}
                                  <div className="px-2 pt-1.5 pb-1">
                                    {/* <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                                  Reactions
                                </span> */}
                                    <div className="flex items-center justify-between gap-1">
                                      {["👍", "❤️", "😂", "🎉", "🙏", "🔥"].map((emoji) => {
                                        const userReacted = Boolean(m.reactions?.[emoji]?.some((u) => u.userId === currentUserId));
                                        return (
                                          <button
                                            key={emoji}
                                            type="button"
                                            onClick={() => {
                                              handleReact(m.id, emoji);
                                              setActiveMenuMsgId(null);
                                            }}
                                            className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition-all hover:scale-125 cursor-pointer ${userReacted ? "bg-orange-100 dark:bg-orange-950/60 scale-110" : "hover:bg-slate-100 dark:hover:bg-slate-800"
                                              }`}
                                            title={`React with ${emoji}`}
                                          >
                                            {emoji}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

                                  {/* Actions List */}
                                  <div className="space-y-0.5">
                                    {/* Copy Message */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleCopyMessage(m);
                                        setActiveMenuMsgId(null);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer font-medium text-left"
                                    >
                                      <Copy size={14} className="text-slate-400" />
                                      <span>{copyFeedbackId === m.id ? "Copied!" : "Copy message"}</span>
                                    </button>

                                    {/* Delete (own or Admin) */}
                                    {(isMe || session?.user?.role === "ADMIN") && (
                                      <>
                                        <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleDeleteMessage(m.id);
                                            setActiveMenuMsgId(null);
                                          }}
                                          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer font-medium text-left"
                                        >
                                          <Trash2 size={14} className="text-rose-500" />
                                          <span>Delete message</span>
                                        </button>
                                      </>
                                    )}
                                  </div>
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

                            {/* Bitrix-Style Seen View Badge (Visible to message sender only) */}
                            {isMe && (() => {
                              const seenList = m.seenBy || [];
                              if (seenList.length === 0) {
                                return (
                                  <div className="mt-0.5 flex items-center justify-end px-1">
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] text-slate-400 select-none"
                                      style={{ fontSize: "10px", lineHeight: "13px" }}
                                    >
                                      <Check size={10} strokeWidth={2.4} />
                                      <span>Sent</span>
                                    </span>
                                  </div>
                                );
                              }

                              const firstViewer = seenList[0]?.name || "1 member";
                              const moreCount = seenList.length - 1;

                              return (
                                <div className="mt-0.5 flex items-center justify-end px-1">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedSeenModalMessage(m)}
                                    title={seenList.map((s) => `${s.name} (${s.designation || "Member"})`).join(", ")}
                                    className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400 transition-colors cursor-pointer select-none bg-transparent border-0 p-0 shadow-none font-normal"
                                    style={{ fontSize: "10px", lineHeight: "13px" }}
                                  >
                                    <CheckCheck size={11} className="text-sky-500 shrink-0 stroke-[2]" />
                                    <span>
                                      Viewed by {firstViewer}
                                      {moreCount > 0 && (
                                        <>
                                          {" and "}
                                          <span className="underline underline-offset-2 font-medium">{moreCount} more</span>
                                        </>
                                      )}
                                    </span>
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Composer */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-t p-3 sm:p-4 transition-colors relative ${chatTheme === "dark" ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200/80"} ${isDraggingOver ? "ring-2 ring-orange-500 ring-inset bg-orange-50/20" : ""}`}
                >
                  {/* Uploading Progress Indicator */}
                  {isUploadingAttachment && (
                    <div className="mb-2 inline-flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-xl text-xs border border-slate-200 dark:border-slate-700 animate-pulse shadow-2xs">
                      <div className="w-3.5 h-3.5 border-2 border-slate-600 dark:border-slate-300 border-t-transparent rounded-full animate-spin" />
                      <span className="font-semibold text-[11px]">Uploading attachment...</span>
                    </div>
                  )}

                  {/* Compact Multi-Attachment Chip Preview */}
                  {attachments.length > 0 && !isUploadingAttachment && (
                    <div className="mb-2 flex flex-wrap items-center gap-2 max-h-36 overflow-y-auto p-1 animate-fade-in">
                      {attachments.map((att) => (
                        <div
                          key={att.id}
                          className="inline-flex items-center gap-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 pl-2 pr-2.5 py-1.5 rounded-xl text-xs shadow-2xs border border-slate-200 dark:border-slate-700 animate-fade-in group"
                        >
                          {att.type === "IMAGE" ? (
                            <img
                              src={att.url}
                              alt="Attachment"
                              className="w-7 h-7 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs shrink-0"
                            />
                          ) : (
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 shrink-0 border border-slate-200 dark:border-slate-600 shadow-2xs">
                              {att.type === "LINK" ? <Link2 size={13} strokeWidth={2.2} /> : <FileText size={13} strokeWidth={2.2} />}
                            </span>
                          )}
                          <div className="flex flex-col min-w-0 max-w-[170px]">
                            <span className="font-bold text-[11px] truncate leading-tight text-slate-800 dark:text-slate-100" title={att.fileName}>
                              {att.fileName}
                            </span>
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium leading-tight">
                              {att.fileSize ? `${Math.round(att.fileSize / 1024)} KB` : att.type === "IMAGE" ? "Image ready" : att.type}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(att.id)}
                            className="w-4 h-4 rounded-full bg-slate-200 hover:bg-rose-500 text-slate-600 hover:text-white font-black text-[9px] flex items-center justify-center transition-colors ml-1 shadow-2xs cursor-pointer shrink-0"
                            title="Remove attachment"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {attachments.length > 1 && (
                        <button
                          type="button"
                          onClick={clearAllAttachments}
                          className="text-[11px] font-semibold text-rose-500 hover:text-rose-600 hover:underline px-2 py-1 cursor-pointer"
                        >
                          Clear all ({attachments.length})
                        </button>
                      )}
                    </div>
                  )}

                  <form onSubmit={handleSendMessage} onPaste={handlePaste} className="flex items-center gap-2 sm:gap-3 relative">
                    {/* Bitrix-Style @ Mention Suggestions Popup (Matches Screenshot) */}
                    {showMentions && filteredMentions.length > 0 && (
                      <div
                        ref={mentionMenuRef}
                        className={`absolute bottom-full mb-3 left-0 sm:left-2 z-50 w-[92vw] sm:w-80 max-h-72 rounded-2xl shadow-2xl border flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150 ${chatTheme === "dark"
                          ? "bg-slate-900 border-slate-700/80 text-white shadow-slate-950/80"
                          : "bg-white border-slate-200/90 text-slate-800 shadow-slate-900/15"
                          }`}
                      >
                        {/* Suggestions List */}
                        <div className="overflow-y-auto max-h-56 p-1.5 space-y-0.5 no-scrollbar">
                          {filteredMentions.map((opt, idx) => {
                            const isSelected = idx === mentionSelectedIndex;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onMouseEnter={() => setMentionSelectedIndex(idx)}
                                onClick={() => handleSelectMention(opt)}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer select-none ${isSelected
                                  ? chatTheme === "dark"
                                    ? "bg-slate-800 text-white"
                                    : "bg-orange-50/80 text-orange-950 border border-orange-200/60"
                                  : chatTheme === "dark"
                                    ? "hover:bg-slate-800/60 text-slate-200"
                                    : "hover:bg-slate-50 text-slate-800"
                                  }`}
                              >
                                {/* Avatar */}
                                {opt.type === "all" ? (
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-cyan-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                                    <Users size={16} />
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0 shadow-2xs">
                                    {opt.avatarText || "U"}
                                  </div>
                                )}

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold truncate">
                                    {opt.name}
                                  </p>
                                  <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                                    {opt.subtitle}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* Footer Navigation Hints (Exact as Bitrix screenshot) */}
                        <div
                          className={`px-3 py-1.5 border-t text-[10px] flex items-center justify-between select-none font-medium ${chatTheme === "dark"
                            ? "bg-slate-950/60 border-slate-800 text-slate-400"
                            : "bg-slate-50 border-slate-100 text-slate-400"
                            }`}
                        >
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-500 dark:text-slate-300">↑ ↓</span> to select user or chat
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-500 dark:text-slate-300">Enter</span> to select
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-500 dark:text-slate-300">Esc</span> to cancel
                          </span>
                        </div>
                      </div>
                    )}

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

                    {/* @ Mention Trigger Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMentions((prev) => !prev);
                        setMentionQuery("");
                        setMentionSelectedIndex(0);
                        if (!showMentions) {
                          setMsgInput((prev) => prev + (prev.endsWith(" ") || prev === "" ? "@" : " @"));
                          setTimeout(() => textareaRef.current?.focus(), 50);
                        }
                      }}
                      className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-colors cursor-pointer shrink-0 ${showMentions
                        ? "bg-orange-100 text-orange-600 ring-2 ring-orange-500/30"
                        : chatTheme === "dark"
                          ? "text-slate-400 hover:text-white hover:bg-slate-800"
                          : "text-slate-400 hover:text-orange-500 hover:bg-orange-50"
                        }`}
                      title="Mention (@) user"
                    >
                      <AtSign size={18} strokeWidth={2.2} />
                    </button>

                    <textarea
                      ref={textareaRef}
                      rows={1}
                      placeholder={`Message #${activeGroup.name}... (type @ to mention)`}
                      value={msgInput}
                      onChange={handleComposerChange}
                      onKeyDown={handleComposerKeyDown}
                      className={`chat-composer-textarea flex-1 min-h-[44px] max-h-[180px] py-2.5 px-4 sm:px-5 text-xs sm:text-[13px] rounded-2xl focus:outline-none focus:ring-4 focus:ring-orange-500/10 font-medium !resize-none leading-relaxed transition-all shadow-2xs ${chatTheme === "dark"
                        ? "bg-slate-800/90 hover:bg-slate-800 focus:bg-slate-800 border border-slate-700 text-white placeholder:text-slate-400"
                        : "bg-slate-50/80 hover:bg-slate-50 focus:bg-white border border-slate-200/90 focus:border-orange-500 text-slate-900 placeholder:text-slate-400"
                        }`}
                    />

                    {/* Attachment Popover Trigger */}
                    <div ref={attachmentMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAttachmentMenu(!showAttachmentMenu);
                          setShowEmojiPicker(false);
                        }}
                        className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors cursor-pointer shrink-0 ${chatTheme === "dark" ? "text-slate-300 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                          }`}
                        title="Attach File or Link"
                      >
                        <Paperclip size={21} strokeWidth={2} />
                      </button>

                      {showAttachmentMenu && (
                        <div className={`absolute bottom-14 right-0 z-50 w-56 rounded-2xl border p-2 shadow-xl ${chatTheme === "dark"
                          ? "bg-slate-900 border-slate-700 shadow-slate-950/80 text-white"
                          : "bg-white border-slate-200/90 shadow-slate-900/10 text-slate-800"
                          }`}>
                          <button
                            type="button"
                            onClick={() => {
                              fileInputRef.current?.click();
                              setShowAttachmentMenu(false);
                            }}
                            className={`group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer ${chatTheme === "dark" ? "hover:bg-slate-800" : "hover:bg-slate-50"}`}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                              <ImageIcon size={17} strokeWidth={2} />
                            </span>

                            <div className="min-w-0">
                              <p className="text-[12px] font-semibold leading-4">
                                Image / Document
                              </p>
                              <p className="text-[10px] leading-4 text-slate-400">
                                Multiple PDF, DOCX, PNG, JPG
                              </p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setShowAttachmentMenu(false);
                              handleAddLinkPrompt();
                            }}
                            className={`group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer ${chatTheme === "dark" ? "hover:bg-slate-800" : "hover:bg-slate-50"}`}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                              <Link2 size={17} strokeWidth={2} />
                            </span>

                            <div className="min-w-0">
                              <p className="text-[12px] font-semibold leading-4">
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
                        multiple
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </div>

                    {/* Smiley / Emoji Button */}
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className={`w-10 h-10 flex items-center justify-center text-orange-500 hover:text-orange-600 hover:bg-orange-50 rounded-full transition-colors cursor-pointer shrink-0 ${showEmojiPicker ? "bg-orange-50 text-orange-600 ring-2 ring-orange-500/30" : ""
                        }`}
                      title="Insert Emoji"
                    >
                      <Smile size={23} strokeWidth={2.2} />
                    </button>

                    {/* Send Button (Solid Orange Circle with Paper Plane) */}
                    <button
                      type="submit"
                      disabled={isUploadingAttachment}
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all shadow-md shadow-orange-500/25 shrink-0 cursor-pointer"
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
                          <p className="mt-0.5 text-[11px] text-slate-500">Select the teammates who need access (30–50+ supported).</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              const eligible = employees.filter((employee) => employee.id !== currentUserId);
                              const allSelected = eligible.length > 0 && eligible.every((e) => selectedMemberIds.includes(e.id));
                              if (allSelected) {
                                setSelectedMemberIds([]);
                              } else {
                                setSelectedMemberIds(eligible.map((e) => e.id));
                              }
                            }}
                            className="text-[11px] font-bold text-orange-600 hover:text-orange-700 underline cursor-pointer"
                          >
                            {employees.filter((employee) => employee.id !== currentUserId).length > 0 &&
                              employees.filter((employee) => employee.id !== currentUserId).every((e) => selectedMemberIds.includes(e.id))
                              ? "Deselect All"
                              : "Select All"}
                          </button>
                          <span className="shrink-0 text-[10px] font-semibold text-slate-400">
                            {employees.filter((employee) => employee.id !== currentUserId).length} available
                          </span>
                        </div>
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
                        {editingGroupId && activeGroup && (
                          <button
                            type="button"
                            onClick={() => handleLeaveGroup(activeGroup)}
                            className="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 cursor-pointer"
                          >
                            <LogOut size={13} />
                            <span>Leave Group</span>
                          </button>
                        )}
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

          {/* Bitrix-Style Daily Work Summary Modal */}
          {showSummaryModal && activeGroup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-4 backdrop-blur-sm">
              <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                {/* Modal Header */}
                <div className="messenger-modal-header relative shrink-0 overflow-hidden px-5 py-4 text-white sm:px-6">
                  <div className="pointer-events-none absolute -right-8 -top-20 h-48 w-48 rounded-full border border-white/10" />
                  <div className="relative flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/15 text-white">
                        <FileText size={20} />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-black">Daily Work Reports</h2>
                          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                            Bitrix Format
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-orange-50">
                          {activeGroup.name} · {summaryData?.stats.totalMembers || activeGroup.participants.length} Team Members
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSummaryModal(false)}
                      aria-label="Close dialog"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-orange-50 transition hover:bg-white/15 hover:text-white cursor-pointer"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Subheader: Date Bar & Statistics */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3 sm:px-6">
                  {/* Date Navigation */}
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => handleChangeSummaryDate(-1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition cursor-pointer"
                      title="Previous Day"
                    >
                      <ChevronLeft size={16} />
                    </button>

                    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-xs">
                      <Calendar size={14} className="text-orange-500" />
                      <span>
                        {new Date(summaryDate + "T00:00:00").toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleChangeSummaryDate(1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition cursor-pointer"
                      title="Next Day"
                    >
                      <ChevronRight size={16} />
                    </button>

                    <input
                      type="date"
                      value={summaryDate}
                      onChange={(e) => e.target.value && handleSelectSummaryDate(e.target.value)}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none hover:border-orange-300 cursor-pointer"
                    />
                  </div>

                  {/* Submission Statistics & Action Button */}
                  <div className="flex items-center gap-2">
                    {summaryData?.stats && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 font-bold text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={13} />
                          {summaryData.stats.submittedCount} Submitted
                        </span>
                        {summaryData.stats.pendingCount > 0 && (
                          <span className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 font-bold text-amber-700 border border-amber-200">
                            <Clock size={13} />
                            {summaryData.stats.pendingCount} Pending
                          </span>
                        )}
                      </div>
                    )}

                    {!isEditingReport && (
                      <button
                        type="button"
                        onClick={() => {
                          const myReport = summaryData?.members.find((m) => m.userId === session?.user?.id)?.summary;
                          handleStartWritingReport(myReport?.content || "");
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition active:scale-95 cursor-pointer"
                      >
                        <Edit3 size={14} />
                        <span>
                          {summaryData?.members.find((m) => m.userId === session?.user?.id)?.hasSubmitted
                            ? "Edit My Report"
                            : "Submit My Report"}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Modal Body */}
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6 space-y-4">
                  {/* Report Editor Form (if writing/editing report) */}
                  {isEditingReport && (
                    <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4 sm:p-5 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500 text-white">
                            <Edit3 size={14} />
                          </span>
                          <h4 className="text-xs font-black text-slate-800">
                            My Daily Work Report — {new Date(summaryDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={toggleSpeechDictation}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${isDictating
                              ? "bg-rose-500 text-white border-rose-600 animate-pulse"
                              : "bg-white text-slate-700 border-slate-200 hover:border-orange-300"
                              }`}
                            title="Speak to dictate your points via microphone"
                          >
                            {isDictating ? <MicOff size={13} /> : <Mic size={13} className="text-orange-500" />}
                            <span>{isDictating ? "Listening..." : "Voice Dictate"}</span>
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <textarea
                          rows={5}
                          value={reportInput}
                          onChange={(e) => setReportInput(e.target.value)}
                          placeholder="• What did you accomplish today?&#10;• What are you working on next?&#10;• Key decisions, blockers or deliverables..."
                          className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-xs text-slate-800 font-medium placeholder:text-slate-400 outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-500/10 leading-relaxed"
                          maxLength={5000}
                        />
                        <span className="absolute bottom-2.5 right-3 text-[10px] text-slate-400 font-medium">
                          {reportInput.length} / 5000
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setReportInput((prev) => (prev ? `${prev.trim()}\n• ` : "• "));
                            }}
                            className="text-[11px] font-bold text-orange-600 hover:text-orange-700 underline cursor-pointer"
                          >
                            + Add bullet point
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingReport(false);
                              setReportInput("");
                              if (isDictating) toggleSpeechDictation();
                            }}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={!reportInput.trim() || submittingReport}
                            onClick={handleSaveDailyReport}
                            className="rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition cursor-pointer"
                          >
                            {submittingReport ? "Saving..." : "Save Report"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Search / Filter Member Reports */}
                  <div className="flex items-center justify-between gap-3 pb-1">
                    <div className="relative flex-1 max-w-xs">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={summarySearchQuery}
                        onChange={(e) => setSummarySearchQuery(e.target.value)}
                        placeholder="Search member by name..."
                        className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-orange-400 focus:bg-white"
                      />
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium">
                      Showing reports for {summaryData?.members.filter((m) => m.hasSubmitted).length || 0} participants
                    </span>
                  </div>

                  {/* List of Member Reports (Bitrix Style) */}
                  {loadingSummaries ? (
                    <div className="flex h-48 flex-col items-center justify-center space-y-2 text-center text-slate-400">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                      <p className="text-xs font-medium">Loading daily reports...</p>
                    </div>
                  ) : summaryData && summaryData.members.length > 0 ? (
                    <div className="space-y-3">
                      {/* Filter members by search query */}
                      {summaryData.members
                        .filter((m) =>
                          `${m.name} ${m.email} ${m.designation}`.toLowerCase().includes(summarySearchQuery.toLowerCase())
                        )
                        .map((member) => {
                          const isSelf = member.userId === session?.user?.id;
                          return (
                            <div
                              key={member.userId}
                              className={`rounded-xl border p-4 transition-all ${member.hasSubmitted
                                ? isSelf
                                  ? "border-orange-300 bg-orange-50/30 shadow-xs"
                                  : "border-slate-200 bg-white shadow-xs hover:border-slate-300"
                                : "border-dashed border-slate-200 bg-slate-50/50"
                                }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                {/* Member Info */}
                                <div className="flex items-center gap-3">
                                  <div className="relative">
                                    <span
                                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white ${member.hasSubmitted ? "bg-[#172554]" : "bg-slate-400"
                                        }`}
                                    >
                                      {member.name.charAt(0).toUpperCase()}
                                    </span>
                                    {member.hasSubmitted && (
                                      <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
                                        <Check size={10} strokeWidth={3} />
                                      </span>
                                    )}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="text-xs font-black text-slate-900">{member.name}</h4>
                                      {isSelf && (
                                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-black text-orange-700">
                                          You
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] font-medium text-slate-500">
                                      {member.designation} · {member.email}
                                    </p>
                                  </div>
                                </div>

                                {/* Submission Time / Status & Actions */}
                                <div className="flex items-center gap-2 shrink-0">
                                  {member.hasSubmitted && member.summary ? (
                                    <>
                                      <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                                        <Clock size={12} className="text-slate-400" />
                                        {new Date(member.summary.createdAt).toLocaleTimeString(undefined, {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </span>
                                      {isSelf && (
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => handleStartWritingReport(member.summary?.content || "")}
                                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600 transition cursor-pointer"
                                            title="Edit my report"
                                          >
                                            <Edit3 size={13} />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => member.summary && handleDeleteDailyReport(member.summary.id)}
                                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-rose-500 hover:border-rose-300 hover:bg-rose-50 transition cursor-pointer"
                                            title="Delete my report"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                                      <Clock size={11} />
                                      Pending
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Member Report Content */}
                              {member.hasSubmitted && member.summary ? (
                                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-xs text-slate-800 leading-relaxed whitespace-pre-line font-medium">
                                  {member.summary.content}
                                </div>
                              ) : isSelf ? (
                                <div className="mt-2.5 flex items-center justify-between rounded-lg bg-orange-50/60 p-2.5 text-xs text-orange-800">
                                  <span>You haven’t submitted your daily work update for this date yet.</span>
                                  <button
                                    type="button"
                                    onClick={() => handleStartWritingReport("")}
                                    className="font-bold underline text-orange-700 hover:text-orange-900 cursor-pointer"
                                  >
                                    Submit now
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="flex h-40 flex-col items-center justify-center text-center text-slate-400">
                      <p className="text-xs">No team members found in this group.</p>
                    </div>
                  )}
                </div>

                {/* Footer Note */}
                <div className="border-t border-slate-100 bg-slate-50/90 px-5 py-3 text-[11px] text-slate-500 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <AlertCircle size={13} className="text-orange-500 shrink-0" />
                    <span>Daily reports are automatically stored for 30 days and purged thereafter.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSummaryModal(false)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bitrix-Style Message Read Receipts (Seen View) Modal */}
          {selectedSeenModalMessage && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs animate-in fade-in duration-100"
              onClick={() => setSelectedSeenModalMessage(null)}
            >
              <div
                className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl animate-in zoom-in-95 duration-150 ${chatTheme === "dark"
                  ? "bg-slate-900 border-slate-800 text-white"
                  : "bg-white border-slate-200 text-slate-800"
                  }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400">
                      <CheckCheck size={18} strokeWidth={2.4} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">Message Read Receipts</h4>
                      <p className="text-[10px] text-slate-400">
                        Viewed by {selectedSeenModalMessage.seenBy?.length || 0}{" "}
                        {(selectedSeenModalMessage.seenBy?.length || 0) === 1 ? "member" : "members"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedSeenModalMessage(null)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                  {selectedSeenModalMessage.seenBy && selectedSeenModalMessage.seenBy.length > 0 ? (
                    selectedSeenModalMessage.seenBy.map((seen) => (
                      <div
                        key={seen.userId}
                        className={`flex items-center justify-between rounded-xl p-2 transition-colors ${chatTheme === "dark" ? "hover:bg-slate-800/60" : "hover:bg-slate-50"
                          }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 text-[11px] font-bold text-white shadow-2xs shrink-0">
                            {seen.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{seen.name}</p>
                            <p className="text-[10px] text-slate-400">{seen.designation || "Team Member"}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 font-medium">
                            {new Date(seen.readAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="py-6 text-center text-xs text-slate-400">No viewers yet</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
