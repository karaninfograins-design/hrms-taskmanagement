"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
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
  const [groupName, setGroupName] = useState<string>("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [submittingGroup, setSubmittingGroup] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      .then((res) => res.json())
      .then((data) => setEmployees(data.employees || []))
      .catch((err) => console.error("Error fetching employees:", err));
  }, [session?.token]);

  // Fetch group conversations
  const fetchGroups = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/messenger/conversations`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) return;
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

  // Create Group Handler
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    setSubmittingGroup(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/messenger/conversations/group`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          name: groupName.trim(),
          participantIds: selectedMemberIds,
        }),
      });

      if (!res.ok) throw new Error("Failed to create group");
      const data = await res.json();
      setShowCreateModal(false);
      setGroupName("");
      setSelectedMemberIds([]);
      await fetchGroups();
      setActiveGroup(data.conversation);
    } catch (err: any) {
      alert(err.message || "Error creating group");
    } finally {
      setSubmittingGroup(false);
    }
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
      }
    } catch (err) {
      console.error("Error sending message:", err);
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
          <div className="w-80 border-r border-slate-200 bg-white flex flex-col h-full">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900">👥 Group Chats</h2>
                <p className="text-[11px] text-slate-500 font-medium">Team & Department Channels</p>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black transition-all shadow-xs"
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
                    onClick={() => setShowCreateModal(true)}
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
                      className={`p-4 cursor-pointer transition-all flex items-center justify-between ${
                        isSelected ? "bg-orange-50/80 border-l-4 border-orange-500" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-9 h-9 rounded-full bg-slate-900 text-orange-400 font-black flex items-center justify-center text-sm shadow-xs">
                          {group.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-black text-slate-900 truncate">{group.name}</p>
                          <p className="text-[11px] text-slate-500 font-medium">
                            {group.participants.length} Members
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Group Chat Panel */}
          <div className="flex-1 bg-slate-50 flex flex-col h-full">
            {activeGroup ? (
              <>
                {/* Header */}
                <div className="h-16 px-6 bg-white border-b border-slate-200 flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-900 text-orange-400 font-black flex items-center justify-center text-base">
                      {activeGroup.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{activeGroup.name}</h3>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {activeGroup.participants.map((p) => p.user.name).join(", ")}
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">
                    {activeGroup.participants.length} Participants
                  </span>
                </div>

                {/* Messages */}
                <div className="flex-1 p-6 overflow-y-auto space-y-4">
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
                          className={`max-w-md p-3.5 rounded-2xl text-xs shadow-xs ${
                            isMe
                              ? "bg-slate-900 text-white rounded-br-xs"
                              : "bg-white text-slate-800 border border-slate-200 rounded-bl-xs"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{m.content}</p>
                          <span className="mt-1 block text-right text-[10px] opacity-70">
                            {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Composer */}
                <div className="p-4 bg-white border-t border-slate-200">
                  <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Message #${activeGroup.name}...`}
                      value={msgInput}
                      onChange={(e) => setMsgInput(e.target.value)}
                      className="flex-1 h-11 px-4 text-xs bg-slate-100 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                    <button
                      type="submit"
                      className="h-11 px-5 bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl transition-all shadow-xs text-xs"
                    >
                      Send ➔
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-2xl mb-3">
                  👥
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
                <h2 className="text-base font-black text-slate-900">Create New Group Channel</h2>
                <form onSubmit={handleCreateGroup} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Group Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Engineering Squad, HR Announcements"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Add Group Participants
                    </label>
                    <div className="max-h-48 overflow-y-auto space-y-1 bg-slate-50 p-3 border border-slate-200 rounded-xl divide-y divide-slate-200/60">
                      {employees
                        .filter((emp) => emp.id !== currentUserId)
                        .map((emp) => (
                          <label
                            key={emp.id}
                            className="flex items-center justify-between py-1.5 cursor-pointer text-xs font-medium text-slate-800"
                          >
                            <span>{emp.name} ({emp.email})</span>
                            <input
                              type="checkbox"
                              checked={selectedMemberIds.includes(emp.id)}
                              onChange={() => toggleMemberSelection(emp.id)}
                              className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                            />
                          </label>
                        ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="px-4 py-2.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingGroup}
                      className="px-4 py-2.5 text-xs bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl shadow-xs disabled:opacity-50"
                    >
                      {submittingGroup ? "Creating..." : "Create Group"}
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
