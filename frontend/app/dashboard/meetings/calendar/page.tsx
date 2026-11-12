"use client";

import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MeetingCalendarView } from "@/components/meetings/meeting-calendar-view";

export default function MeetingCalendarRoutePage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  if (isLoading || !session) {
    return <main className="route-loading">Loading calendar...</main>;
  }

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} onSignOut={handleSignOut} />
        <section className="dashboard-content !bg-slate-50/70" style={{ paddingBottom: "60px" }}>
          <div className="w-full space-y-4">
            <MeetingCalendarView
              onSwitchToMeetings={() => router.push("/dashboard/meetings")}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
