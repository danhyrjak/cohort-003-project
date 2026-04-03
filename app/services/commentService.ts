import { eq, and, or, asc, isNull } from "drizzle-orm";
import { db } from "~/db";
import {
  lessonComments,
  users,
  lessons,
  modules,
  courses,
  CommentStatus,
} from "~/db/schema";

// ─── Comment Service ───
// Handles lesson comments: creation, retrieval, editing, deletion, moderation.

export type CommentWithAuthor = {
  id: number;
  lessonId: number;
  userId: number;
  parentId: number | null;
  body: string;
  status: CommentStatus;
  reportReason: string | null;
  adminReason: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorAvatarUrl: string | null;
};

export type VisibleComment = CommentWithAuthor & {
  isOwn: boolean;
  replies: CommentWithAuthor[];
};

export type ModerationComment = CommentWithAuthor & {
  replyCount: number;
};

export type ReportedComment = CommentWithAuthor & {
  lessonTitle: string;
  courseTitle: string;
  courseId: number;
};

// ─── Student actions ───

export function createComment(userId: number, lessonId: number, body: string) {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 2000) {
    throw new Error("Comment must be between 1 and 2000 characters.");
  }

  return db
    .insert(lessonComments)
    .values({ lessonId, userId, body: trimmed })
    .returning()
    .get();
}

export function updateComment(commentId: number, body: string) {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 2000) {
    throw new Error("Comment must be between 1 and 2000 characters.");
  }

  const existing = db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, commentId))
    .get();

  if (!existing) return undefined;

  if (existing.status !== CommentStatus.Pending) {
    throw new Error("Only pending comments can be edited.");
  }

  return db
    .update(lessonComments)
    .set({ body: trimmed, updatedAt: new Date().toISOString() })
    .where(eq(lessonComments.id, commentId))
    .returning()
    .get();
}

export function deleteComment(commentId: number) {
  const existing = db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, commentId))
    .get();

  if (!existing) return undefined;

  if (existing.status === CommentStatus.Reported) {
    throw new Error("Reported comments cannot be deleted.");
  }

  return db
    .delete(lessonComments)
    .where(eq(lessonComments.id, commentId))
    .returning()
    .get();
}

// ─── Read ───

export function getCommentById(commentId: number) {
  return db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, commentId))
    .get();
}

export function getVisibleCommentsForLesson(
  lessonId: number,
  currentUserId: number | null
): VisibleComment[] {
  // Fetch all top-level comments: approved, or owned by currentUser
  const rows = db
    .select({
      id: lessonComments.id,
      lessonId: lessonComments.lessonId,
      userId: lessonComments.userId,
      parentId: lessonComments.parentId,
      body: lessonComments.body,
      status: lessonComments.status,
      reportReason: lessonComments.reportReason,
      adminReason: lessonComments.adminReason,
      createdAt: lessonComments.createdAt,
      updatedAt: lessonComments.updatedAt,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(
      and(
        eq(lessonComments.lessonId, lessonId),
        currentUserId !== null
          ? or(
              eq(lessonComments.status, CommentStatus.Approved),
              eq(lessonComments.userId, currentUserId)
            )
          : eq(lessonComments.status, CommentStatus.Approved)
      )
    )
    .orderBy(asc(lessonComments.createdAt))
    .all();

  // Separate top-level comments from replies
  const topLevel = rows.filter((r) => r.parentId === null);
  const replies = rows.filter((r) => r.parentId !== null);

  return topLevel.map((comment) => ({
    ...comment,
    status: comment.status as CommentStatus,
    isOwn: comment.userId === currentUserId,
    replies: replies
      .filter((r) => r.parentId === comment.id)
      .map((r) => ({ ...r, status: r.status as CommentStatus })),
  }));
}

export function getAllCommentsForLesson(lessonId: number): ModerationComment[] {
  const topLevelRows = db
    .select({
      id: lessonComments.id,
      lessonId: lessonComments.lessonId,
      userId: lessonComments.userId,
      parentId: lessonComments.parentId,
      body: lessonComments.body,
      status: lessonComments.status,
      reportReason: lessonComments.reportReason,
      adminReason: lessonComments.adminReason,
      createdAt: lessonComments.createdAt,
      updatedAt: lessonComments.updatedAt,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(
      and(
        eq(lessonComments.lessonId, lessonId),
        isNull(lessonComments.parentId)
      )
    )
    .orderBy(asc(lessonComments.createdAt))
    .all();

  // Count replies per top-level comment
  const allReplies = db
    .select({ parentId: lessonComments.parentId })
    .from(lessonComments)
    .where(
      and(
        eq(lessonComments.lessonId, lessonId),
        // parentId is not null — we count by grouping in JS
      )
    )
    .all();

  const replyCounts: Record<number, number> = {};
  for (const r of allReplies) {
    if (r.parentId !== null) {
      replyCounts[r.parentId] = (replyCounts[r.parentId] ?? 0) + 1;
    }
  }

  return topLevelRows.map((row) => ({
    ...row,
    status: row.status as CommentStatus,
    replyCount: replyCounts[row.id] ?? 0,
  }));
}

export type PendingCommentsByLesson = {
  moduleId: number;
  moduleTitle: string;
  modulePosition: number;
  lessons: {
    lessonId: number;
    lessonTitle: string;
    comments: CommentWithAuthor[];
  }[];
}[];

export function getPendingCommentsForCourse(courseId: number): PendingCommentsByLesson {
  const rows = db
    .select({
      id: lessonComments.id,
      lessonId: lessonComments.lessonId,
      userId: lessonComments.userId,
      parentId: lessonComments.parentId,
      body: lessonComments.body,
      status: lessonComments.status,
      reportReason: lessonComments.reportReason,
      adminReason: lessonComments.adminReason,
      createdAt: lessonComments.createdAt,
      updatedAt: lessonComments.updatedAt,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      lessonTitle: lessons.title,
      moduleId: modules.id,
      moduleTitle: modules.title,
      modulePosition: modules.position,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .innerJoin(lessons, eq(lessonComments.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(
      and(
        eq(modules.courseId, courseId),
        eq(lessonComments.status, CommentStatus.Pending),
        isNull(lessonComments.parentId)
      )
    )
    .orderBy(asc(modules.position), asc(lessonComments.createdAt))
    .all();

  // Group by module → lesson
  const moduleMap = new Map<number, {
    moduleId: number;
    moduleTitle: string;
    modulePosition: number;
    lessonMap: Map<number, { lessonId: number; lessonTitle: string; comments: CommentWithAuthor[] }>;
  }>();

  for (const row of rows) {
    if (!moduleMap.has(row.moduleId)) {
      moduleMap.set(row.moduleId, {
        moduleId: row.moduleId,
        moduleTitle: row.moduleTitle,
        modulePosition: row.modulePosition,
        lessonMap: new Map(),
      });
    }
    const mod = moduleMap.get(row.moduleId)!;
    if (!mod.lessonMap.has(row.lessonId)) {
      mod.lessonMap.set(row.lessonId, {
        lessonId: row.lessonId,
        lessonTitle: row.lessonTitle,
        comments: [],
      });
    }
    mod.lessonMap.get(row.lessonId)!.comments.push({
      id: row.id,
      lessonId: row.lessonId,
      userId: row.userId,
      parentId: row.parentId,
      body: row.body,
      status: row.status as CommentStatus,
      reportReason: row.reportReason,
      adminReason: row.adminReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      authorName: row.authorName,
      authorAvatarUrl: row.authorAvatarUrl,
    });
  }

  return Array.from(moduleMap.values())
    .sort((a, b) => a.modulePosition - b.modulePosition)
    .map(({ moduleId, moduleTitle, modulePosition, lessonMap }) => ({
      moduleId,
      moduleTitle,
      modulePosition,
      lessons: Array.from(lessonMap.values()),
    }));
}

export function getReportedComments(): ReportedComment[] {
  const rows = db
    .select({
      id: lessonComments.id,
      lessonId: lessonComments.lessonId,
      userId: lessonComments.userId,
      parentId: lessonComments.parentId,
      body: lessonComments.body,
      status: lessonComments.status,
      reportReason: lessonComments.reportReason,
      adminReason: lessonComments.adminReason,
      createdAt: lessonComments.createdAt,
      updatedAt: lessonComments.updatedAt,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      lessonTitle: lessons.title,
      courseTitle: courses.title,
      courseId: courses.id,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .innerJoin(lessons, eq(lessonComments.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessonComments.status, CommentStatus.Reported))
    .orderBy(asc(lessonComments.updatedAt))
    .all();

  return rows.map((row) => ({ ...row, status: row.status as CommentStatus }));
}

// ─── Instructor actions ───

export function createInstructorReply(
  userId: number,
  lessonId: number,
  parentId: number,
  body: string
) {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 2000) {
    throw new Error("Reply must be between 1 and 2000 characters.");
  }

  const parent = db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, parentId))
    .get();

  if (!parent || parent.lessonId !== lessonId) {
    throw new Error("Parent comment not found in this lesson.");
  }

  return db
    .insert(lessonComments)
    .values({
      lessonId,
      userId,
      parentId,
      body: trimmed,
      status: CommentStatus.Approved,
    })
    .returning()
    .get();
}

export function reportComment(commentId: number, reason: string) {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new Error("A reason is required when reporting a comment.");
  }

  return db
    .update(lessonComments)
    .set({
      status: CommentStatus.Reported,
      reportReason: trimmed,
      adminReason: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(lessonComments.id, commentId))
    .returning()
    .get();
}

export function approveComment(commentId: number) {
  return db
    .update(lessonComments)
    .set({
      status: CommentStatus.Approved,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(lessonComments.id, commentId))
    .returning()
    .get();
}

// ─── Admin actions ───

export function resolveComment(
  commentId: number,
  status: CommentStatus.Approved | CommentStatus.Declined,
  adminReason: string | null
) {
  return db
    .update(lessonComments)
    .set({
      status,
      adminReason: adminReason?.trim() || null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(lessonComments.id, commentId))
    .returning()
    .get();
}
