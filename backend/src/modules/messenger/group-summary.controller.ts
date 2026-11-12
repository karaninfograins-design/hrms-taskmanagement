import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { verifyToken } from "../../utils/jwt.js";
import { getIO } from "../../socket.js";

// Helper to check if user is a member of the conversation or an admin/HR
async function checkGroupAccess(conversationId: number, userId: number): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: { select: { name: true } },
      conversationMemberships: {
        where: { conversationId },
        select: { conversationId: true },
      },
    },
  });

  if (!user) return false;
  if (user.role?.name === "SUPER_ADMIN" || user.role?.name === "ADMIN" || user.role?.name === "HR") {
    return true;
  }
  return user.conversationMemberships.length > 0;
}

/**
 * GET /api/messenger/conversations/:conversationId/daily-summaries
 * Query params: date=YYYY-MM-DD (defaults to current date)
 */
export const getGroupDailySummaries = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const conversationId = Number(req.params.conversationId);
    if (isNaN(conversationId)) {
      res.status(400).json({ message: "Invalid conversation ID" });
      return;
    }

    const hasAccess = await checkGroupAccess(conversationId, userId);
    if (!hasAccess) {
      res.status(403).json({ message: "You are not a member of this group" });
      return;
    }

    const dateQuery = typeof req.query.date === "string" && req.query.date.trim()
      ? req.query.date.trim()
      : new Date().toISOString().slice(0, 10);

    // Fetch conversation with all members
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                designation: { select: { name: true } },
                role: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      res.status(404).json({ message: "Group conversation not found" });
      return;
    }

    // Fetch all summaries for this conversation on this date
    const summaries = await prisma.groupDailySummary.findMany({
      where: {
        conversationId,
        date: dateQuery,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            designation: { select: { name: true } },
            role: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const summaryMap = new Map<number, (typeof summaries)[0]>();
    for (const s of summaries) {
      summaryMap.set(s.userId, s);
    }

    // Structure members into Bitrix-style list: each member with their summary or pending status
    const memberReports = conversation.participants.map((p) => {
      const existing = summaryMap.get(p.userId);
      return {
        userId: p.userId,
        name: p.user.name,
        email: p.user.email,
        designation: p.user.designation?.name || p.user.role?.name || "Member",
        role: p.role,
        hasSubmitted: !!existing,
        summary: existing
          ? {
            id: existing.id,
            content: existing.content,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
          }
          : null,
      };
    });

    // Sort: submitted members first, then pending members alphabetically
    memberReports.sort((a, b) => {
      if (a.hasSubmitted && !b.hasSubmitted) return -1;
      if (!a.hasSubmitted && b.hasSubmitted) return 1;
      return a.name.localeCompare(b.name);
    });

    const totalMembers = memberReports.length;
    const submittedCount = summaries.length;
    const pendingCount = Math.max(0, totalMembers - submittedCount);

    res.json({
      conversationId,
      groupName: conversation.name,
      date: dateQuery,
      stats: {
        totalMembers,
        submittedCount,
        pendingCount,
      },
      members: memberReports,
      summaries,
    });
  } catch (error) {
    console.error("Get group daily summaries error:", error);
    res.status(500).json({ message: "Failed to fetch daily summaries" });
  }
};

/**
 * POST /api/messenger/conversations/:conversationId/daily-summaries
 * Body: { content: string, date?: string }
 */
export const upsertGroupDailySummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const conversationId = Number(req.params.conversationId);
    if (isNaN(conversationId)) {
      res.status(400).json({ message: "Invalid conversation ID" });
      return;
    }

    const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
    if (!content) {
      res.status(400).json({ message: "Summary content is required" });
      return;
    }

    if (content.length > 5000) {
      res.status(400).json({ message: "Summary content cannot exceed 5000 characters" });
      return;
    }

    const date = typeof req.body.date === "string" && req.body.date.trim()
      ? req.body.date.trim()
      : new Date().toISOString().slice(0, 10);

    // Verify membership
    const isMember = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!isMember) {
      res.status(403).json({ message: "You must be a member of this group to submit a summary" });
      return;
    }

    const summary = await prisma.groupDailySummary.upsert({
      where: {
        conversationId_userId_date: {
          conversationId,
          userId,
          date,
        },
      },
      create: {
        conversationId,
        userId,
        date,
        content,
      },
      update: {
        content,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            designation: { select: { name: true } },
            role: { select: { name: true } },
          },
        },
      },
    });

    // Notify group participants via Socket.IO
    try {
      const io = getIO();
      if (io) {
        io.to(`conversation_${conversationId}`).emit("group:summary-updated", {
          conversationId,
          date,
          summary,
        });
      }
    } catch (socketErr) {
      console.warn("Socket broadcast for summary update failed:", socketErr);
    }

    res.status(200).json({
      message: "Daily report saved successfully",
      summary,
    });
  } catch (error) {
    console.error("Upsert group daily summary error:", error);
    res.status(500).json({ message: "Failed to save daily summary" });
  }
};

/**
 * DELETE /api/messenger/conversations/:conversationId/daily-summaries/:id
 */
export const deleteGroupDailySummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const conversationId = Number(req.params.conversationId);
    const summaryId = Number(req.params.id);

    if (isNaN(conversationId) || isNaN(summaryId)) {
      res.status(400).json({ message: "Invalid ID parameters" });
      return;
    }

    const existing = await prisma.groupDailySummary.findUnique({
      where: { id: summaryId },
      include: {
        user: {
          select: { role: { select: { name: true } } },
        },
      },
    });

    if (!existing || existing.conversationId !== conversationId) {
      res.status(404).json({ message: "Summary not found" });
      return;
    }

    // Only author or admin/superadmin can delete
    const caller = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { name: true } } },
    });
    const isAdmin = caller?.role?.name === "SUPER_ADMIN" || caller?.role?.name === "ADMIN";

    if (existing.userId !== userId && !isAdmin) {
      res.status(403).json({ message: "You can only delete your own report" });
      return;
    }

    await prisma.groupDailySummary.delete({
      where: { id: summaryId },
    });

    // Broadcast deletion via socket
    try {
      const io = getIO();
      if (io) {
        io.to(`conversation_${conversationId}`).emit("group:summary-deleted", {
          conversationId,
          summaryId,
          date: existing.date,
          userId: existing.userId,
        });
      }
    } catch { }

    res.json({ message: "Summary report deleted successfully" });
  } catch (error) {
    console.error("Delete group summary error:", error);
    res.status(500).json({ message: "Failed to delete daily summary" });
  }
};

/**
 * Automated 30-day retention cleanup
 * Deletes any group daily summary older than 30 days
 */
export const cleanupExpiredGroupSummaries = async (): Promise<number> => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await prisma.groupDailySummary.deleteMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo,
        },
      },
    });
    if (result.count > 0) {
      console.log(`[Auto-Cleanup] Removed ${result.count} group summaries older than 30 days`);
    }
    return result.count;
  } catch (err) {
    console.error("[Auto-Cleanup] Failed to clean up expired group summaries:", err);
    return 0;
  }
};
